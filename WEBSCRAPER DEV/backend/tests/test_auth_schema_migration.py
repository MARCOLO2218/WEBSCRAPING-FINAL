"""Flujo controlado 042 -> 046 en una base efímera."""

import hashlib
from pathlib import Path

from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.exc import IntegrityError

from catalog_api.db import auth_schema_migration as migration
from catalog_api.db.country_models import country_metadata

REGIONAL_HASH = "7" * 64


def test_diagnostic_does_not_expose_exception_or_credentials():
    class DatabaseError(Exception):
        sqlstate = "28P01"
    error = DatabaseError("password=super-secreto DSN=privado")
    diagnostic = migration.safe_diagnostic(error)
    assert diagnostic == {"categoria": "credenciales_rechazadas", "sqlstate": "28P01"}
    assert "super-secreto" not in str(diagnostic)
    assert migration.safe_diagnostic(RuntimeError("secreto"))["categoria"] == "error_de_preflight"


def test_connection_diagnostic_handles_libpq_without_sqlstate():
    from sqlalchemy.exc import OperationalError
    error = OperationalError("SQL privado", {}, Exception("password authentication failed for user privado"))
    assert migration.safe_diagnostic(error) == {"categoria": "credenciales_rechazadas", "sqlstate": None}
    error = OperationalError("SQL privado", {}, Exception("no pg_hba.conf entry for host privado"))
    assert migration.safe_diagnostic(error)["categoria"] == "conexion_rechazada_por_politica_postgresql"


@pytest.fixture
def db():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def attach_catalog(connection, _record):
        connection.execute("ATTACH DATABASE ':memory:' AS catalogo")

    with engine.begin() as connection:
        country_metadata.create_all(connection)
        connection.execute(text(
            "CREATE TABLE catalogo.alembic_version (version_num VARCHAR(32) PRIMARY KEY)"
        ))
        connection.execute(text(
            "INSERT INTO catalogo.alembic_version VALUES ('042_regional')"
        ))
        connection.execute(text(
            "CREATE TABLE catalogo.regional_lotes "
            "(id INTEGER PRIMARY KEY, plan_hash TEXT, source_hash TEXT, rules TEXT)"
        ))
        connection.execute(text(
            "INSERT INTO catalogo.regional_lotes VALUES "
            "(1, :plan_hash, :source_hash, '038-origin-v2')"
        ), {"plan_hash": REGIONAL_HASH, "source_hash": "8" * 64})
    yield engine
    engine.dispose()


def test_apply_verify_idempotence_and_empty_rollback(db):
    with db.begin() as connection:
        plan = migration.execute(connection)
        assert plan["revision_antes"] == migration.BASE
        assert plan["tablas"] == []

    with db.begin() as connection:
        applied = migration.execute(connection, "apply")
        assert applied["status"] == "aplicado"
        assert applied["revision_despues"] == migration.HEAD
        assert set(applied["tablas"]) == {
            "usuarios", "usuario_paises", "sesiones_app", "login_intentos",
            "admin_eventos",
        }
        assert set(applied["filas"].values()) == {0}

    with db.begin() as connection:
        assert migration.execute(connection, "apply")["status"] == "validado"
        assert migration.execute(connection, "verify")["status"] == "validado"

    with db.begin() as connection:
        rolled_back = migration.execute(connection, "rollback", allow_data_loss=True)
        assert rolled_back["status"] == "revertido"
        assert rolled_back["revision_despues"] == migration.BASE
        assert rolled_back["tablas"] == []


def test_rollback_rejects_existing_auth_data(db):
    with db.begin() as connection:
        migration.execute(connection, "apply")
        connection.execute(text(
            "INSERT INTO catalogo.usuarios "
            "(id,username,password_hash,enabled,global_admin,created_at) "
            "VALUES ('user-id','usuario','hash',1,0,'2026-09-24 12:00:00')"
        ))
    with pytest.raises(migration.Rejected, match="existen datos"), db.begin() as connection:
        migration.execute(connection, "rollback")


def test_existing_044_schema_is_inspectable_and_upgrades_to_046(db):
    with db.begin() as connection:
        migration.migrate(connection, migration.THROTTLE)
        connection.execute(text(
            "INSERT INTO catalogo.usuarios "
            "(id,username,password_hash,enabled,global_admin,created_at) "
            "VALUES ('legacy-admin','admin','synthetic-hash',1,1,'2026-09-27 12:00:00')"
        ))
    with db.begin() as connection:
        preflight = migration.execute(connection, "plan")
        assert preflight["revision_antes"] == migration.THROTTLE
        assert "admin_eventos" not in preflight["tablas"]
    with db.begin() as connection:
        applied = migration.execute(connection, "apply")
        assert applied["revision_antes"] == migration.THROTTLE
        assert applied["revision_despues"] == migration.HEAD
        assert "account_level" in {
            column["name"] for column in inspect(connection).get_columns(
                "usuarios", schema="catalogo"
            )
        }
        assert "admin_eventos" in applied["tablas"]
        level = connection.execute(text(
            "SELECT account_level FROM catalogo.usuarios WHERE id = 'legacy-admin'"
        )).scalar_one()
        assert level == "superadmin"


def test_admin_audit_events_reject_update_and_delete(db):
    with db.begin() as connection:
        migration.execute(connection, "apply")
        connection.execute(text(
            "INSERT INTO catalogo.admin_eventos "
            "(id,actor_user_id,target_user_id,event_type,details,created_at) "
            "VALUES ('event-1','actor-1','target-1','usuario_creado','{}',"
            "'2026-09-28 12:00:00')"
        ))
    for statement in (
        "UPDATE catalogo.admin_eventos SET event_type='cuenta_bloqueada' WHERE id='event-1'",
        "DELETE FROM catalogo.admin_eventos WHERE id='event-1'",
    ):
        with pytest.raises(IntegrityError), db.begin() as connection:
            connection.execute(text(statement))
    with db.connect() as connection:
        assert connection.execute(text(
            "SELECT count(*) FROM catalogo.admin_eventos WHERE id='event-1'"
        )).scalar_one() == 1


def test_postgresql_audit_migration_rejects_truncate():
    migration_source = (
        Path(__file__).parents[1] / "migrations" / "versions" / "046_admin_audit.py"
    ).read_text(encoding="utf-8")
    assert "BEFORE TRUNCATE ON catalogo.admin_eventos" in migration_source
    assert "trg_admin_eventos_no_truncate" in migration_source


def test_postgresql_rejects_any_other_database_or_role():
    connection = MagicMock()
    connection.dialect.name = "postgresql"
    connection.execute.return_value.mappings.return_value.one.return_value = {
        "db": "WEBSCRAPING_CAMAS_DEV",
        "role": "postgres",
    }
    with pytest.raises(migration.Rejected, match="sólo puede migrarse"):
        migration.execute(connection, "apply")
    assert connection.execute.call_count == 1


def test_partial_state_is_rejected(db):
    with db.begin() as connection:
        connection.execute(text("CREATE TABLE catalogo.usuarios (id VARCHAR(36))"))
    with pytest.raises(migration.Rejected, match="Estado parcial"), db.begin() as connection:
        migration.execute(connection)


def test_changed_regional_fingerprint_is_rejected(db):
    with pytest.raises(migration.Rejected, match="huella regional cambió"), db.begin() as connection:
        migration.execute(connection, expected_regional_hash="9" * 64)


def test_backup_requires_custom_header_and_exact_fingerprint(tmp_path):
    backup = tmp_path / "copy.dump"
    backup.write_bytes(b"PGDMPcontenido")
    expected = hashlib.sha256(backup.read_bytes()).hexdigest()
    assert migration.validate_backup(backup, expected) == expected
    with pytest.raises(migration.Rejected, match="huella del respaldo cambió"):
        migration.validate_backup(backup, "0" * 64)


def test_cli_refuses_unguarded_writes(monkeypatch):
    monkeypatch.setattr(migration, "create_engine", lambda *a, **kw: pytest.fail("No conectar"))
    with pytest.raises(SystemExit):
        migration.main(["--host", "127.0.0.1", "--apply"])
    with pytest.raises(SystemExit):
        migration.main([
            "--host", "127.0.0.1", "--rollback", "--confirm-dev", "--backup", "x.dump",
        ])
