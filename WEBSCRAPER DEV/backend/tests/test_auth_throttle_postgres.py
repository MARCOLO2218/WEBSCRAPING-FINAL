"""Prueba PostgreSQL explícita del limitador; exige una base scratch dedicada."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import os
import re
from threading import Barrier

import pytest
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from catalog_api.auth_throttle import DatabaseLoginThrottle
from catalog_api.auth_throttle_models import login_attempts


POSTGRES_URL = os.environ.get("SPEC046_POSTGRES_TEST_URL")
pytestmark = pytest.mark.skipif(
    not POSTGRES_URL,
    reason="Defina SPEC046_POSTGRES_TEST_URL hacia una base scratch PostgreSQL dedicada",
)


def test_postgresql_serializes_concurrent_attempt_reservations():
    target = make_url(POSTGRES_URL)
    if target.drivername != "postgresql+psycopg":
        pytest.fail("La integración SPEC-046 sólo acepta postgresql+psycopg")
    if not re.fullmatch(r"spec046_scratch_[a-z0-9_]+", target.database or ""):
        pytest.fail("Se rechazó el destino: use una base dedicada spec046_scratch_*")

    engine = create_engine(POSTGRES_URL, pool_size=32, max_overflow=0,
                           pool_timeout=15, hide_parameters=True)
    created_schema = False
    table_created = False
    try:
        with engine.begin() as connection:
            database, readonly = connection.execute(text(
                "SELECT current_database(), current_setting('transaction_read_only')"
            )).one()
            if database != target.database or readonly != "off":
                pytest.fail("Destino PostgreSQL inesperado o no escribible")
            schema_exists = "catalogo" in inspect(connection).get_schema_names()
            if not schema_exists:
                connection.execute(text("CREATE SCHEMA catalogo"))
                created_schema = True
            existing = inspect(connection).get_table_names(schema="catalogo")
            if "login_intentos" in existing:
                pytest.fail("La tabla catalogo.login_intentos ya existe; use scratch vacío")
            login_attempts.create(connection, checkfirst=False)
            table_created = True

        factory = sessionmaker(engine, expire_on_commit=False)
        throttle = DatabaseLoginThrottle(
            factory,
            key_secret=b"postgres-integration-test-key-32-bytes-minimum",
            account_limit=8,
            ip_limit=30,
        )
        started = Barrier(32)
        now = datetime.now(timezone.utc)

        def attempt(_number):
            started.wait(timeout=15)
            return throttle.claim_attempt("simultaneous-user", "192.0.2.50", now)

        with ThreadPoolExecutor(max_workers=32) as executor:
            results = list(executor.map(attempt, range(32)))

        assert results.count(None) == 8
        assert len([value for value in results if value is not None]) == 24
        assert all(value and value > 0 for value in results if value is not None)
        with factory() as session:
            rows = session.execute(select(login_attempts.c.attempt_count)).scalars().all()
        assert len(rows) == 2
        assert sorted(rows) == [9, 9]
    finally:
        with engine.begin() as connection:
            if table_created:
                login_attempts.drop(connection, checkfirst=False)
            if created_schema:
                connection.execute(text("DROP SCHEMA catalogo"))
        engine.dispose()
