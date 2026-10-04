"""Backfill 045 probado sólo con SQLite efímera."""

import importlib.util
from pathlib import Path

from sqlalchemy import create_engine, text


MIGRATION_PATH = Path(__file__).parents[1] / "migrations" / "versions" / "045_account_levels.py"
SPEC = importlib.util.spec_from_file_location("migration_045_account_levels", MIGRATION_PATH)
MIGRATION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MIGRATION)


def test_backfill_promotes_legacy_admin_and_preserves_assigned_admin_level():
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("ATTACH DATABASE ':memory:' AS catalogo"))
        connection.execute(text(
            "CREATE TABLE catalogo.usuarios (id TEXT, global_admin BOOLEAN, account_level TEXT)"
        ))
        connection.execute(text(
            "INSERT INTO catalogo.usuarios VALUES "
            "('legacy-admin', 1, 'usuario'), ('regular', 0, 'usuario'), "
            "('new-admin', 1, 'admin'), ('superadmin', 1, 'superadmin')"
        ))
        MIGRATION.backfill_legacy_levels(connection)
        rows = connection.execute(text(
            "SELECT id, account_level FROM catalogo.usuarios ORDER BY id"
        )).all()
    engine.dispose()
    assert rows == [
        ("legacy-admin", "superadmin"),
        ("new-admin", "admin"),
        ("regular", "usuario"),
        ("superadmin", "superadmin"),
    ]
