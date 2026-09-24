"""Guardas de Alembic 044; las tablas se crean sólo en SQLite efímera."""

import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy import event

from catalog_api.auth_models import auth_metadata
from catalog_api.auth_throttle_models import throttle_metadata
from catalog_api.db.country_models import country_metadata

PATH = Path(__file__).parents[1] / "migrations" / "versions" / "044_login_throttle.py"
SPEC = importlib.util.spec_from_file_location("migration_044_login_throttle", PATH)
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)


@pytest.fixture
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def attach(connection, _record):
        connection.execute("ATTACH DATABASE ':memory:' AS catalogo")

    country_metadata.create_all(engine)
    auth_metadata.create_all(engine)
    yield engine
    engine.dispose()


def invoke(engine, monkeypatch, operation, flag=False):
    with engine.begin() as connection:
        context = SimpleNamespace(config=SimpleNamespace(attributes={flag: True} if flag else {}))
        monkeypatch.setattr(migration, "op", SimpleNamespace(
            get_context=lambda: context, get_bind=lambda: connection,
        ))
        getattr(migration, operation)()


def test_upgrade_and_downgrade_are_guarded_and_preserve_auth_tables(db, monkeypatch):
    with pytest.raises(RuntimeError, match="flujo autorizado"):
        invoke(db, monkeypatch, "upgrade")
    assert "login_intentos" not in inspect(db).get_table_names(schema="catalogo")

    invoke(db, monkeypatch, "upgrade", flag="auth_throttle_schema_migration")
    names = set(inspect(db).get_table_names(schema="catalogo"))
    assert {"usuarios", "usuario_paises", "sesiones_app", "login_intentos"} <= names

    with pytest.raises(RuntimeError, match="autorización explícita"):
        invoke(db, monkeypatch, "downgrade")
    invoke(db, monkeypatch, "downgrade", flag="auth_throttle_schema_rollback")
    names = set(inspect(db).get_table_names(schema="catalogo"))
    assert "login_intentos" not in names
    assert {"usuarios", "usuario_paises", "sesiones_app", "paises"} <= names
