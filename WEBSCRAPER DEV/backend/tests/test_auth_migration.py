"""La revisión 043 sólo opera con flags explícitos en una SQLite efímera."""

import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy import event

from catalog_api.db.country_models import country_metadata

MIGRATION_PATH = Path(__file__).parents[1] / "migrations" / "versions" / "043_auth.py"
SPEC = importlib.util.spec_from_file_location("migration_043_auth", MIGRATION_PATH)
migration = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(migration)


@pytest.fixture
def sqlite_catalog():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def attach_catalog_schema(connection, _record):
        connection.execute("ATTACH DATABASE ':memory:' AS catalogo")

    country_metadata.create_all(engine)
    with engine.begin() as connection:
        connection.execute(text(
            "INSERT INTO catalogo.paises (codigo,nombre,moneda,habilitado) "
            "VALUES ('GT','Guatemala','GTQ',1)"
        ))
    yield engine
    engine.dispose()


def run_revision(engine, monkeypatch, *, migrate=False):
    with engine.begin() as connection:
        context = SimpleNamespace(config=SimpleNamespace(attributes={
            "auth_schema_migration": migrate,
        }))
        monkeypatch.setattr(migration, "op", SimpleNamespace(
            get_context=lambda: context, get_bind=lambda: connection,
        ))
        migration.upgrade()


def run_rollback(engine, monkeypatch, *, rollback=False):
    with engine.begin() as connection:
        context = SimpleNamespace(config=SimpleNamespace(attributes={
            "auth_schema_rollback": rollback,
        }))
        monkeypatch.setattr(migration, "op", SimpleNamespace(
            get_context=lambda: context, get_bind=lambda: connection,
        ))
        migration.downgrade()


def table_names(engine):
    return set(inspect(engine).get_table_names(schema="catalogo"))


def test_upgrade_requires_explicit_flag_and_adds_only_identity_tables(sqlite_catalog, monkeypatch):
    with pytest.raises(RuntimeError, match="requiere el flujo autorizado"):
        run_revision(sqlite_catalog, monkeypatch)
    assert table_names(sqlite_catalog) == {"paises"}

    run_revision(sqlite_catalog, monkeypatch, migrate=True)
    assert table_names(sqlite_catalog) == {
        "paises", "usuarios", "usuario_paises", "sesiones_app",
    }
    with sqlite_catalog.connect() as connection:
        assert connection.execute(text(
            "SELECT codigo FROM catalogo.paises"
        )).scalar_one() == "GT"
    with sqlite_catalog.begin() as connection:
        connection.execute(text(
            "INSERT INTO catalogo.usuarios "
            "(id,username,password_hash,enabled,global_admin,created_at) "
            "VALUES ('fixture-user','fixture','synthetic-hash',1,0,'2026-09-23 12:00:00')"
        ))


def test_downgrade_requires_explicit_flag_and_removes_only_identity_tables(sqlite_catalog, monkeypatch):
    run_revision(sqlite_catalog, monkeypatch, migrate=True)
    with pytest.raises(RuntimeError, match="requiere autorización explícita"):
        run_rollback(sqlite_catalog, monkeypatch)
    assert "usuarios" in table_names(sqlite_catalog)

    run_rollback(sqlite_catalog, monkeypatch, rollback=True)
    assert table_names(sqlite_catalog) == {"paises"}
    with sqlite_catalog.connect() as connection:
        assert connection.execute(text(
            "SELECT codigo FROM catalogo.paises"
        )).scalar_one() == "GT"
