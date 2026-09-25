"""Migración controlada de autenticación en la copia PostgreSQL DEV."""

import argparse
import getpass
import hashlib
import json
from pathlib import Path
import re

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.engine import URL

from ..auth_models import tables as identity_tables
from ..auth_throttle_models import login_attempts


BASE = "042_regional"
MID = "043_auth"
HEAD = "044_login_throttle"
BACKEND = Path(__file__).resolve().parents[2]


class Rejected(ValueError):
    """Rechazo esperado sin incluir credenciales ni valores sensibles."""


def auth_tables():
    return (*identity_tables(), login_attempts)


def require_copy_target(connection):
    identity = connection.execute(text(
        "SELECT current_database() AS db, current_user AS role"
    )).mappings().one()
    if identity["db"] != "webscraper_dev" or identity["role"] != "webscraper_user":
        raise Rejected("Autenticación sólo puede migrarse en webscraper_dev con webscraper_user")


def revision(connection):
    values = list(connection.execute(text(
        "SELECT version_num FROM catalogo.alembic_version"
    )).scalars())
    if len(values) != 1 or values[0] not in {BASE, MID, HEAD}:
        raise Rejected("Revisión Alembic incompatible con la migración de autenticación")
    return values[0]


def existing_auth_tables(connection):
    names = {table.name for table in auth_tables()}
    return set(inspect(connection).get_table_names(schema="catalogo")) & names


def table_state(connection, existing=None):
    expected = {table.name: set(table.c.keys()) for table in auth_tables()}
    inspector = inspect(connection)
    existing = existing_auth_tables(connection) if existing is None else existing
    for name in existing:
        actual_columns = {
            column["name"] for column in inspector.get_columns(name, schema="catalogo")
        }
        if actual_columns != expected[name]:
            raise Rejected("Esquema de autenticación divergente: " + name)
    counts = {
        table.name: connection.execute(select(text("count(*)")).select_from(table)).scalar_one()
        for table in auth_tables() if table.name in existing
    }
    return existing, counts


def require_consistent_state(current, existing):
    identity = {table.name for table in identity_tables()}
    expected = {
        BASE: set(),
        MID: identity,
        HEAD: identity | {login_attempts.name},
    }[current]
    if existing != expected:
        raise Rejected("Estado parcial entre Alembic y tablas de autenticación")


def migrate(connection, target, rollback=False):
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "migrations"))
    config.attributes.update(
        connection=connection,
        baseline_schema="catalogo",
        auth_schema_migration=not rollback,
        auth_throttle_schema_migration=not rollback,
        auth_schema_rollback=rollback,
        auth_throttle_schema_rollback=rollback,
    )
    if rollback:
        command.downgrade(config, target)
    else:
        command.upgrade(config, target)


def regional_lot(connection, expected_hash=None):
    row = connection.execute(text(
        "SELECT plan_hash, source_hash, rules FROM catalogo.regional_lotes WHERE id = 1"
    )).mappings().one_or_none()
    if row is None:
        raise Rejected("Falta el lote regional 042 requerido por autenticación")
    result = dict(row)
    if expected_hash and result["plan_hash"] != expected_hash:
        raise Rejected("La huella regional cambió; detener migración de autenticación")
    return result


def execute(connection, mode="plan", allow_data_loss=False, expected_regional_hash=None):
    if mode not in {"plan", "apply", "verify", "rollback"}:
        raise Rejected("Modo desconocido")
    writing = mode in {"apply", "rollback"}
    postgres = connection.dialect.name == "postgresql"
    if postgres and writing:
        require_copy_target(connection)
        connection.execute(text("SET LOCAL lock_timeout = '5s'"))
        connection.execute(text("SELECT pg_advisory_xact_lock(430046)"))
        connection.execute(text(
            "LOCK TABLE catalogo.alembic_version, catalogo.paises IN SHARE ROW EXCLUSIVE MODE"
        ))
    elif postgres:
        connection.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))

    before = revision(connection)
    lot = regional_lot(connection, expected_regional_hash)
    existing = existing_auth_tables(connection)
    require_consistent_state(before, existing)
    existing, counts = table_state(connection, existing)

    if mode == "verify" and before != HEAD:
        raise Rejected("Las revisiones de autenticación aún no están aplicadas")
    if mode == "rollback":
        if before == BASE:
            raise Rejected("No hay esquema de autenticación para revertir")
        if any(counts.values()) and not allow_data_loss:
            raise Rejected("Rollback rechazado: existen datos de autenticación")
        migrate(connection, BASE, rollback=True)
    elif mode == "apply" and before != HEAD:
        migrate(connection, HEAD)

    after = revision(connection)
    final_tables = existing_auth_tables(connection)
    require_consistent_state(after, final_tables)
    final_tables, final_counts = table_state(connection, final_tables)
    if mode == "apply" and after != HEAD:
        raise Rejected("La migración de autenticación no alcanzó 044")
    if mode == "rollback" and after != BASE:
        raise Rejected("El rollback de autenticación no regresó a 042")

    return {
        "status": (
            "aplicado" if mode == "apply" and before != HEAD else
            "revertido" if mode == "rollback" else
            "validado" if mode in {"apply", "verify"} else "plan_preparado"
        ),
        "modo": mode,
        "revision_antes": before,
        "revision_despues": after,
        "tablas": sorted(final_tables),
        "filas": final_counts,
        "escritura_ejecutada": writing,
        "usuarios_creados": False,
        "lote_regional": lot,
    }


def validate_backup(path, expected_sha256):
    digest = hashlib.sha256()
    try:
        with path.open("rb") as source:
            header = source.read(5)
            digest.update(header)
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
    except OSError as error:
        raise Rejected("No se pudo leer el respaldo requerido") from error
    if header != b"PGDMP":
        raise Rejected("El respaldo no es un pg_dump custom")
    actual = digest.hexdigest()
    if actual != expected_sha256:
        raise Rejected("La huella del respaldo cambió; detener migración")
    return actual


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--apply", action="store_true")
    modes.add_argument("--verify", action="store_true")
    modes.add_argument("--rollback", action="store_true")
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--backup", type=Path)
    parser.add_argument("--confirm-dev", action="store_true")
    parser.add_argument("--allow-data-loss", action="store_true")
    parser.add_argument("--expected-regional-hash")
    parser.add_argument("--expected-backup-sha256")
    args = parser.parse_args(argv)
    writing = args.apply or args.rollback
    if writing and (
        not args.confirm_dev or not args.backup or
        not re.fullmatch(r"[a-f0-9]{64}", args.expected_regional_hash or "") or
        not re.fullmatch(r"[a-f0-9]{64}", args.expected_backup_sha256 or "")
    ):
        parser.error(
            "Escritura requiere confirmación, respaldo y ambas huellas esperadas"
        )
    if args.rollback and not args.allow_data_loss:
        parser.error("Rollback requiere --allow-data-loss")

    engine = None
    try:
        backup_sha256 = None
        if writing:
            backup_sha256 = validate_backup(args.backup, args.expected_backup_sha256)
        password = getpass.getpass("Contraseña de webscraper_user: ")
        url = URL.create(
            "postgresql+psycopg",
            username="webscraper_user",
            password=password,
            host=args.host,
            port=args.port,
            database="webscraper_dev",
        )
        del password
        options = "-c statement_timeout=300000"
        if not writing:
            options += " -c default_transaction_read_only=on"
        engine = create_engine(url, hide_parameters=True, connect_args={
            "connect_timeout": 10,
            "sslmode": "disable",
            "options": options,
            "application_name": "auth_schema_migration",
        })
        mode = (
            "apply" if args.apply else "verify" if args.verify else
            "rollback" if args.rollback else "plan"
        )
        with engine.begin() as connection:
            report = execute(
                connection, mode, args.allow_data_loss, args.expected_regional_hash
            )
        if backup_sha256:
            report["respaldo_sha256"] = backup_sha256
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0
    except Exception as error:
        message = str(error) if isinstance(error, Rejected) else (
            "Operación no confirmada; revisar conexión y estado PostgreSQL."
        )
        print(json.dumps({"status": "error", "message": message}, ensure_ascii=False))
        return 2
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
