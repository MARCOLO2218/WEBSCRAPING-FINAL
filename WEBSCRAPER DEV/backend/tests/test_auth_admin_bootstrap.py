"""Bootstrap y rollback del primer administrador en una base efímera."""

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine, event, select, text

from catalog_api.auth_models import auth_metadata, users
from catalog_api.auth_throttle_models import throttle_metadata
from catalog_api.db import auth_admin_bootstrap as bootstrap
from catalog_api.db.country_models import country_metadata


REGIONAL_HASH = "7" * 64
NOW = datetime(2026, 9, 24, 18, tzinfo=timezone.utc)


class FakeHasher:
    def hash(self, password):
        return "$argon2id$test$" + str(len(password))

    def verify(self, stored, password):
        return stored == self.hash(password)


@pytest.fixture
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def attach_catalog(connection, _record):
        connection.execute("ATTACH DATABASE ':memory:' AS catalogo")

    country_metadata.create_all(engine)
    auth_metadata.create_all(engine)
    throttle_metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE catalogo.alembic_version (version_num VARCHAR(32) PRIMARY KEY)"
        ))
        connection.execute(text(
            "INSERT INTO catalogo.alembic_version VALUES ('044_login_throttle')"
        ))
        connection.execute(text(
            "CREATE TABLE catalogo.regional_lotes "
            "(id INTEGER PRIMARY KEY, plan_hash TEXT, source_hash TEXT, rules TEXT)"
        ))
        connection.execute(text(
            "INSERT INTO catalogo.regional_lotes VALUES (1, :plan, :source, :rules)"
        ), {"plan": REGIONAL_HASH, "source": "8" * 64, "rules": "038-origin-v2"})
    yield engine
    engine.dispose()


def record(username=" AdminInicial "):
    return bootstrap.prepare_admin(
        username,
        "Password_segura_2026!",
        hasher=FakeHasher(),
        clock=lambda: NOW,
    )


def test_bootstrap_creates_exactly_one_enabled_global_admin_and_rolls_back(db):
    admin = record()
    with db.begin() as connection:
        result = bootstrap.insert_first_admin(
            connection, admin, REGIONAL_HASH,
            password="Password_segura_2026!", hasher=FakeHasher(),
        )
        assert result["status"] == "aplicado"
        assert result["usuario"] == "admininicial"
        assert result["asignaciones_creadas"] == result["sesiones_creadas"] == 0
        stored = connection.execute(select(users)).mappings().one()
        assert stored["password_hash"].startswith("$argon2id$")
        assert stored["enabled"] is True
        assert stored["global_admin"] is True

    with db.begin() as connection:
        result = bootstrap.remove_first_admin(
            connection, admin["id"], "admininicial", REGIONAL_HASH
        )
        assert result["status"] == "revertido"
        assert set(result["filas"].values()) == {0}


def test_bootstrap_rejects_repetition_and_changed_regional_hash(db):
    first = record("primero")
    with db.begin() as connection:
        bootstrap.insert_first_admin(
            connection, first, REGIONAL_HASH,
            password="Password_segura_2026!", hasher=FakeHasher(),
        )
    with db.begin() as connection:
        stored_before = connection.execute(select(
            users.c.id, users.c.password_hash
        )).one()
        repeated = bootstrap.insert_first_admin(
            connection, record("PRIMERO"), REGIONAL_HASH,
            password="Password_segura_2026!", hasher=FakeHasher(),
        )
        stored_after = connection.execute(select(
            users.c.id, users.c.password_hash
        )).one()
        assert repeated["status"] == "ya_aplicado"
        assert repeated["escritura_ejecutada"] is False
        assert stored_after == stored_before
    with pytest.raises(bootstrap.Rejected, match="no coincide"), db.begin() as connection:
        bootstrap.insert_first_admin(
            connection, record("segundo"), REGIONAL_HASH,
            password="Otra_password_segura_2026!", hasher=FakeHasher(),
        )
    with pytest.raises(ValueError, match="huella regional cambió"), db.begin() as connection:
        bootstrap.inspect_state(connection, "9" * 64)


def test_rollback_requires_exact_single_bootstrap_user(db):
    admin = record()
    with db.begin() as connection:
        bootstrap.insert_first_admin(
            connection, admin, REGIONAL_HASH,
            password="Password_segura_2026!", hasher=FakeHasher(),
        )
    with pytest.raises(bootstrap.Rejected, match="estado distinto"), db.begin() as connection:
        bootstrap.remove_first_admin(
            connection, "00000000-0000-0000-0000-000000000000",
            "admininicial", REGIONAL_HASH,
        )
    with db.connect() as connection:
        assert connection.execute(select(users.c.id)).scalar_one() == admin["id"]


def test_cli_refuses_unguarded_writes(monkeypatch):
    monkeypatch.setattr(bootstrap, "create_engine", lambda *a, **kw: pytest.fail("No conectar"))
    with pytest.raises(SystemExit):
        bootstrap.main([
            "--host", "127.0.0.1", "--expected-regional-hash", REGIONAL_HASH,
            "--apply",
        ])
    connection = MagicMock()
    connection.dialect.name = "postgresql"
    connection.execute.return_value.mappings.return_value.one.return_value = {
        "db": "WEBSCRAPING_CAMAS_DEV", "role": "postgres",
    }
    with pytest.raises(ValueError, match="sólo puede migrarse"):
        bootstrap.schema.require_copy_target(connection)
