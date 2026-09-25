"""Bootstrap controlado del primer administrador en PostgreSQL DEV."""

import argparse
from datetime import datetime, timezone
import getpass
import json
from pathlib import Path
import re
import uuid

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from sqlalchemy import URL, create_engine, delete, func, inspect, select, text

from ..auth import normalize_username, validate_new_password
from ..auth_models import sessions, user_country_roles, users
from ..auth_throttle_models import login_attempts
from . import auth_schema_migration as schema


REVISION = "044_login_throttle"


class Rejected(ValueError):
    """Rechazo esperado sin incluir contraseñas, hashes ni DSN."""


def inspect_state(connection, expected_regional_hash):
    if connection.dialect.name == "postgresql":
        schema.require_copy_target(connection)
    current = schema.revision(connection)
    if current != REVISION:
        raise Rejected("El bootstrap requiere la revisión 044_login_throttle")
    lot = schema.regional_lot(connection, expected_regional_hash)
    existing = schema.existing_auth_tables(connection)
    schema.require_consistent_state(current, existing)
    _tables, counts = schema.table_state(connection, existing)
    inspector = inspect(connection)
    primary_key = set(inspector.get_pk_constraint(
        "usuarios", schema="catalogo"
    ).get("constrained_columns") or ())
    unique_sets = {
        frozenset(item.get("column_names") or ())
        for item in inspector.get_unique_constraints("usuarios", schema="catalogo")
    }
    if primary_key != {"id"} or frozenset({"username"}) not in unique_sets:
        raise Rejected("Las restricciones de usuarios no coinciden con 043_auth")
    admins = connection.execute(select(func.count()).select_from(users).where(
        users.c.global_admin.is_(True)
    )).scalar_one()
    enabled_admins = connection.execute(select(func.count()).select_from(users).where(
        users.c.global_admin.is_(True), users.c.enabled.is_(True)
    )).scalar_one()
    return {
        "revision": current,
        "lote_regional": lot,
        "filas": counts,
        "administradores_globales": admins,
        "administradores_habilitados": enabled_admins,
    }


def prepare_admin(username, password, *, hasher=None, clock=None):
    normalized = normalize_username(username)
    validate_new_password(password)
    hasher = hasher or PasswordHasher()
    clock = clock or (lambda: datetime.now(timezone.utc))
    return {
        "id": str(uuid.uuid4()),
        "username": normalized,
        "password_hash": hasher.hash(password),
        "enabled": True,
        "global_admin": True,
        "created_at": clock(),
    }


def insert_first_admin(connection, record, expected_regional_hash, *, password, hasher=None):
    hasher = hasher or PasswordHasher()
    if not record["password_hash"].startswith("$argon2id$"):
        raise Rejected("El hash preparado no usa Argon2id")
    before = inspect_state(connection, expected_regional_hash)
    related = ("usuario_paises", "sesiones_app", "login_intentos")
    if before["filas"].get("usuarios") == 1 and not any(
        before["filas"].get(name) for name in related
    ):
        existing = connection.execute(select(
            users.c.id, users.c.username, users.c.password_hash,
            users.c.enabled, users.c.global_admin, users.c.created_at,
        )).mappings().one()
        password_matches = False
        try:
            password_matches = hasher.verify(existing["password_hash"], password)
        except (VerifyMismatchError, VerificationError):
            pass
        if (
            existing["username"] == record["username"] and
            existing["enabled"] is True and
            existing["global_admin"] is True and
            password_matches is True
        ):
            return {
                "status": "ya_aplicado",
                "revision": before["revision"],
                "usuario_id": existing["id"],
                "usuario": existing["username"],
                "habilitado": True,
                "administrador_global": True,
                "creado_en": existing["created_at"].isoformat(),
                "filas": before["filas"],
                "asignaciones_creadas": 0,
                "sesiones_creadas": 0,
                "escritura_ejecutada": False,
            }
        raise Rejected("Bootstrap existente no coincide con las credenciales esperadas")
    if any(before["filas"].values()) or before["administradores_globales"]:
        raise Rejected("Bootstrap rechazado: autenticación ya contiene datos")
    connection.execute(users.insert().values(**record))
    after = inspect_state(connection, expected_regional_hash)
    if (
        after["filas"].get("usuarios") != 1 or
        after["administradores_globales"] != 1 or
        after["administradores_habilitados"] != 1 or
        any(after["filas"].get(name) for name in (
            "usuario_paises", "sesiones_app", "login_intentos"
        ))
    ):
        raise Rejected("El resultado del bootstrap no cumple el contrato")
    return {
        "status": "aplicado",
        "revision": after["revision"],
        "usuario_id": record["id"],
        "usuario": record["username"],
        "habilitado": True,
        "administrador_global": True,
        "creado_en": record["created_at"].isoformat(),
        "filas": after["filas"],
        "asignaciones_creadas": 0,
        "sesiones_creadas": 0,
        "escritura_ejecutada": True,
    }


def remove_first_admin(connection, expected_user_id, expected_username,
                       expected_regional_hash):
    before = inspect_state(connection, expected_regional_hash)
    expected_username = normalize_username(expected_username)
    if (
        before["filas"].get("usuarios") != 1 or
        any(before["filas"].get(name) for name in (
            "usuario_paises", "sesiones_app", "login_intentos"
        ))
    ):
        raise Rejected("Rollback rechazado: estado distinto del bootstrap inicial")
    row = connection.execute(select(
        users.c.id, users.c.username, users.c.global_admin, users.c.enabled
    )).mappings().one_or_none()
    if (
        row is None or row["id"] != expected_user_id or
        row["username"] != expected_username or
        row["global_admin"] is not True or
        row["enabled"] is not True
    ):
        raise Rejected("Rollback rechazado: estado distinto del bootstrap inicial")
    connection.execute(delete(users).where(users.c.id == expected_user_id))
    after = inspect_state(connection, expected_regional_hash)
    if any(after["filas"].values()):
        raise Rejected("El rollback no recuperó las tablas vacías")
    return {
        "status": "revertido",
        "revision": after["revision"],
        "usuario_id": expected_user_id,
        "filas": after["filas"],
        "escritura_ejecutada": True,
    }


def lock_auth_tables(connection):
    connection.execute(text("SET LOCAL lock_timeout = '5s'"))
    locks = connection.execute(text(
        "SELECT pg_try_advisory_xact_lock(430046), "
        "pg_try_advisory_xact_lock(460046), "
        "pg_try_advisory_xact_lock(480048)"
    )).one()
    if not all(locks):
        raise Rejected("Otro flujo de autenticación o migración está activo")
    connection.execute(text(
        "LOCK TABLE catalogo.usuarios, catalogo.usuario_paises, "
        "catalogo.sesiones_app, catalogo.login_intentos "
        "IN SHARE ROW EXCLUSIVE MODE"
    ))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--apply", action="store_true")
    modes.add_argument("--verify", action="store_true")
    modes.add_argument("--rollback", action="store_true")
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--expected-regional-hash", required=True)
    parser.add_argument("--backup", type=Path)
    parser.add_argument("--expected-backup-sha256")
    parser.add_argument("--expected-user-id")
    parser.add_argument("--expected-username")
    parser.add_argument("--confirm-dev", action="store_true")
    parser.add_argument("--allow-data-loss", action="store_true")
    args = parser.parse_args(argv)
    writing = args.apply or args.rollback
    if not re.fullmatch(r"[a-f0-9]{64}", args.expected_regional_hash):
        parser.error("La huella regional debe ser SHA-256 hexadecimal")
    if writing and (
        not args.confirm_dev or not args.backup or
        not re.fullmatch(r"[a-f0-9]{64}", args.expected_backup_sha256 or "")
    ):
        parser.error("Escritura requiere confirmación, respaldo y su huella")
    if args.rollback and (
        not args.allow_data_loss or
        not args.expected_user_id or not args.expected_username
    ):
        parser.error("Rollback requiere autorización, UUID y usuario esperados")
    if args.rollback:
        try:
            if str(uuid.UUID(args.expected_user_id)) != args.expected_user_id.lower():
                raise ValueError
        except (ValueError, AttributeError):
            parser.error("El UUID esperado no es válido")

    engine = None
    try:
        backup_sha256 = None
        if writing:
            backup_sha256 = schema.validate_backup(
                args.backup, args.expected_backup_sha256
            )
        database_password = getpass.getpass("Contraseña de webscraper_user: ")
        url = URL.create(
            "postgresql+psycopg",
            username="webscraper_user",
            password=database_password,
            host=args.host,
            port=args.port,
            database="webscraper_dev",
        )
        del database_password
        options = "-c statement_timeout=300000"
        if not writing:
            options += " -c default_transaction_read_only=on"
        engine = create_engine(
            url,
            hide_parameters=True,
            connect_args={
                "connect_timeout": 10,
                "sslmode": "disable",
                "options": options,
                "application_name": "auth_admin_bootstrap",
            },
        )

        if args.apply:
            with engine.connect() as connection:
                preflight = inspect_state(connection, args.expected_regional_hash)
            related = ("usuario_paises", "sesiones_app", "login_intentos")
            if (
                preflight["filas"].get("usuarios") not in {0, 1} or
                any(preflight["filas"].get(name) for name in related) or
                preflight["administradores_globales"] != preflight["filas"].get("usuarios") or
                preflight["administradores_habilitados"] != preflight["filas"].get("usuarios")
            ):
                raise Rejected("Bootstrap rechazado: autenticación ya contiene datos")
            username = input("Usuario administrador inicial: ")
            password = getpass.getpass("Contraseña nueva del administrador: ")
            confirmation = getpass.getpass("Repita la contraseña nueva: ")
            if password != confirmation:
                raise Rejected("Las contraseñas nuevas no coinciden")
            hasher = PasswordHasher()
            record = prepare_admin(username, password, hasher=hasher)
            del confirmation
            with engine.begin() as connection:
                schema.require_copy_target(connection)
                lock_auth_tables(connection)
                report = insert_first_admin(
                    connection, record, args.expected_regional_hash,
                    password=password, hasher=hasher,
                )
            del password
        elif args.rollback:
            with engine.begin() as connection:
                schema.require_copy_target(connection)
                lock_auth_tables(connection)
                report = remove_first_admin(
                    connection, args.expected_user_id, args.expected_username,
                    args.expected_regional_hash,
                )
        else:
            with engine.begin() as connection:
                state = inspect_state(connection, args.expected_regional_hash)
                if args.verify and (
                    state["filas"].get("usuarios") != 1 or
                    state["administradores_globales"] != 1 or
                    state["administradores_habilitados"] != 1 or
                    any(state["filas"].get(name) for name in (
                        "usuario_paises", "sesiones_app", "login_intentos"
                    ))
                ):
                    raise Rejected("No existe exactamente un administrador inicial válido")
                report = {
                    "status": "validado" if args.verify else "plan_preparado",
                    "modo": "verify" if args.verify else "plan",
                    **state,
                    "escritura_ejecutada": False,
                }
        if backup_sha256:
            report["respaldo_sha256"] = backup_sha256
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0
    except (Rejected, schema.Rejected, ValueError) as error:
        print(json.dumps({"status": "error", "message": str(error)}, ensure_ascii=False))
        return 2
    except Exception:
        print(json.dumps({
            "status": "error",
            "message": "Operación no confirmada; revisar conexión y estado PostgreSQL.",
        }, ensure_ascii=False))
        return 2
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
