import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects.postgresql import dialect
from catalog_api.db.connection import database_url, schema_name, readonly_engine
from catalog_api.db.models import runs, products, snapshots, ScrapingRun
from catalog_api.db.repository import latest_run
from catalog_api.db.audit import differences

def test_audit_engine_enforces_readonly_on_every_connection(monkeypatch):
    from catalog_api.db import connection
    captured = {}
    def capture(url, **kwargs):
        captured.update(kwargs)
        return None
    monkeypatch.setattr(connection, "create_engine", capture)
    readonly_engine({"PGDATABASE": "dev", "PGUSER": "test", "PGPASSWORD": "secret"})
    assert "default_transaction_read_only=on" in captured["connect_args"]["options"]
    assert "statement_timeout=30000" in captured["connect_args"]["options"]
    assert captured["hide_parameters"] is True

def test_connection_preserves_special_password_and_rejects_bad_schema():
    env = {"PGDATABASE": "dev", "PGUSER": "test", "PGPASSWORD": "a@:/#%"}
    assert database_url(env).password == env["PGPASSWORD"]
    assert env["PGPASSWORD"] not in str(database_url(env))
    with pytest.raises(ValueError):
        schema_name({"PGSCHEMA": "a;drop schema b"})
    engine = readonly_engine(env)
    assert engine.get_execution_options()["schema_translate_map"] == {"catalogo": "catalogo"}
    engine.dispose()

def test_declared_postgres_types_preserve_legacy_contract():
    sql = str(CreateTable(products).compile(dialect=dialect()))
    assert "BIGSERIAL" in sql
    assert "NUMERIC(12, 2)" in sql
    assert "TIMESTAMP WITHOUT TIME ZONE" in sql
    assert "REFERENCES catalogo.scraping_runs (id)" in sql
    assert not snapshots.c.run_id.foreign_keys
    assert snapshots.c.lock_until.type.timezone
    assert products.c.run_id.nullable

def test_audit_reports_missing_extra_and_changed_columns():
    assert differences({"a": 1, "b": 2}, {"a": 3, "c": 4}) == [
        "Columna adicional: c", "Columna diferente: a", "Falta columna: b"]
    assert differences({"a": 1}, {"a": 1}) == []

def test_orm_reads_latest_id_and_empty_database():
    engine = create_engine("sqlite://", execution_options={"schema_translate_map": {"catalogo": None}})
    runs.create(engine)
    with Session(engine) as session:
        assert latest_run(session) is None
        session.add_all([ScrapingRun(id=8, total_products=10), ScrapingRun(id=3, total_products=99)])
        session.commit()
        result = latest_run(session)
        assert (result.id, result.total_products) == (8, 10)
    engine.dispose()
