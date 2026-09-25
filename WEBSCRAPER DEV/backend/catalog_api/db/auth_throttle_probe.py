"""Ensayo acotado de concurrencia para el limitador PostgreSQL en DEV."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import getpass
import json
import re
import time
from threading import Barrier

from sqlalchemy import URL, create_engine, delete, func, select, text
from sqlalchemy.orm import sessionmaker

from ..auth_models import sessions, user_country_roles, users
from ..auth_throttle import DatabaseLoginThrottle
from ..auth_throttle_models import login_attempts


REVISION = "044_login_throttle"
PROBE_USERNAME = "spec046_concurrency_probe"
PROBE_IP = "192.0.2.50"
PROBE_SECRET = b"spec046-postgresql-concurrency-probe-v1"
WORKERS = 32


class Rejected(ValueError):
    """Rechazo esperado sin incluir DSN, contraseñas ni hashes internos."""


def require_target(connection, expected_regional_hash):
    if connection.dialect.name != "postgresql":
        raise Rejected("El ensayo requiere PostgreSQL")
    identity = connection.execute(text(
        "SELECT current_database() AS db, current_user AS role"
    )).mappings().one()
    if identity["db"] != "webscraper_dev" or identity["role"] != "webscraper_user":
        raise Rejected("Destino rechazado: usar únicamente webscraper_dev")
    revision = connection.execute(text(
        "SELECT version_num FROM catalogo.alembic_version"
    )).scalar_one()
    if revision != REVISION:
        raise Rejected("El ensayo requiere la revisión 044_login_throttle")
    plan_hash = connection.execute(text(
        "SELECT plan_hash FROM catalogo.regional_lotes WHERE id = 1"
    )).scalar_one()
    if plan_hash != expected_regional_hash:
        raise Rejected("La huella regional cambió; detener ensayo")
    protected_counts = {
        "usuarios": connection.execute(select(func.count()).select_from(users)).scalar_one(),
        "usuario_paises": connection.execute(
            select(func.count()).select_from(user_country_roles)
        ).scalar_one(),
        "sesiones_app": connection.execute(
            select(func.count()).select_from(sessions)
        ).scalar_one(),
        "login_intentos": connection.execute(
            select(func.count()).select_from(login_attempts)
        ).scalar_one(),
    }
    if any(protected_counts.values()):
        raise Rejected("El ensayo exige tablas de autenticación vacías")
    return protected_counts


def validate_outcome(results, rows):
    allowed = results.count(None)
    blocked = len(results) - allowed
    counts = sorted(row["attempt_count"] for row in rows)
    if allowed != 8 or blocked != 24 or len(rows) != 2 or counts != [9, 9]:
        raise Rejected("Resultado concurrente distinto del contrato esperado")
    if any(value is None or value <= 0 for value in results if value is not None):
        raise Rejected("El bloqueo no devolvió una espera válida")
    return {"permitidos": allowed, "bloqueados": blocked, "contadores": counts}


def run_probe(engine, expected_regional_hash):
    factory = sessionmaker(engine, expire_on_commit=False)
    throttle = DatabaseLoginThrottle(
        factory,
        key_secret=PROBE_SECRET,
        account_limit=8,
        ip_limit=30,
    )
    keys = [key for key, _limit in throttle._keys(PROBE_USERNAME, PROBE_IP)]
    started = Barrier(WORKERS)
    now = datetime.now(timezone.utc)
    started_at = time.monotonic()
    control = engine.connect().execution_options(isolation_level="AUTOCOMMIT")
    locked = False
    target_confirmed = False
    before = None
    outcome = None
    try:
        control.execute(text("SELECT pg_advisory_lock(460046)"))
        locked = True
        before = require_target(control, expected_regional_hash)
        target_confirmed = True

        def attempt(_number):
            started.wait(timeout=15)
            return throttle.claim_attempt(PROBE_USERNAME, PROBE_IP, now)

        with ThreadPoolExecutor(max_workers=WORKERS) as executor:
            results = list(executor.map(attempt, range(WORKERS)))
        with factory() as db:
            rows = db.execute(select(
                login_attempts.c.attempt_count,
                login_attempts.c.blocked_until,
            ).where(login_attempts.c.key_hash.in_(keys))).mappings().all()
        outcome = validate_outcome(results, rows)
    finally:
        try:
            if target_confirmed:
                control.execute(delete(login_attempts).where(
                    login_attempts.c.key_hash.in_(keys)
                ))
        finally:
            if locked:
                control.execute(text("SELECT pg_advisory_unlock(460046)"))
            control.close()

    with engine.connect() as connection:
        after = connection.execute(select(func.count()).select_from(login_attempts)).scalar_one()
    if before is None or after != before["login_intentos"]:
        raise Rejected("La limpieza del ensayo no recuperó el conteo inicial")
    return {
        "status": "validado",
        "revision": REVISION,
        "concurrencia": WORKERS,
        **outcome,
        "filas_antes": before,
        "filas_login_despues": after,
        "filas_temporales_eliminadas": True,
        "duracion_segundos": round(time.monotonic() - started_at, 3),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", type=int, default=5432)
    parser.add_argument("--expected-regional-hash", required=True)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--confirm-dev", action="store_true")
    args = parser.parse_args(argv)
    if not args.run or not args.confirm_dev:
        parser.error("El ensayo requiere --run y --confirm-dev")
    if not re.fullmatch(r"[a-f0-9]{64}", args.expected_regional_hash):
        parser.error("La huella regional debe ser SHA-256 hexadecimal")

    engine = None
    try:
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
        engine = create_engine(
            url,
            pool_size=WORKERS + 1,
            max_overflow=0,
            pool_timeout=20,
            hide_parameters=True,
            connect_args={
                "connect_timeout": 10,
                "sslmode": "disable",
                "options": "-c statement_timeout=120000 -c lock_timeout=5000",
                "application_name": "spec046_concurrency_probe",
            },
        )
        report = run_probe(engine, args.expected_regional_hash)
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0
    except Exception as error:
        message = str(error) if isinstance(error, Rejected) else (
            "Ensayo no confirmado; revisar conexión y estado PostgreSQL."
        )
        print(json.dumps({"status": "error", "message": message}, ensure_ascii=False))
        return 2
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
