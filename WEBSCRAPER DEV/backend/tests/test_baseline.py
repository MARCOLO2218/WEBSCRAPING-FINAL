from copy import deepcopy
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects.postgresql import dialect
from catalog_api.db import baseline
from catalog_api.db.models import runs, products

def test_postgres_uuid_defaults_match_observed_schema():
    for table, column in ((runs, "run_uuid"), (products, "registro_uuid")):
        assert f"{column} UUID DEFAULT gen_random_uuid() NOT NULL" in str(
            CreateTable(table).compile(dialect=dialect()))
    assert products.c.run_uuid.server_default is None

def test_observed_reference_passes_and_alembic_table_is_allowed():
    report = baseline.reference()
    assert baseline.validate(report) == []
    report["schema_tables"].append("alembic_version")
    assert baseline.validate(report) == []

@pytest.mark.parametrize("section", ["columns", "generation", "id_sequence",
    "primary_key", "foreign_keys", "indexes", "check_constraints"])
def test_adoption_rejects_changed_metadata(section):
    report = deepcopy(baseline.reference())
    report["tables"]["productos_catalogo"][section] = {"changed": True}
    assert baseline.validate(report)

def test_adoption_rejects_unknown_table_and_schema():
    report = baseline.reference()
    report["schema_tables"].append("paises")
    report["schema"] = "other"
    assert len(baseline.validate(report)) == 2

def test_real_alembic_stamp_is_idempotent_and_preserves_other_tables():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE preserved (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO preserved VALUES (9)"))
        assert baseline.register(conn, "main") == "registrado"
        assert baseline.register(conn, "main") == "ya_registrado"
        assert conn.execute(text("SELECT id FROM preserved")).scalar_one() == 9
        assert conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == baseline.REVISION
        conn.execute(text("UPDATE alembic_version SET version_num='unknown'"))
        with pytest.raises(ValueError):
            baseline.register(conn, "main")
    engine.dispose()

def test_drift_blocks_stamp(monkeypatch):
    engine = create_engine("sqlite://")
    monkeypatch.setattr(baseline, "inventory", lambda *args: {})
    monkeypatch.setattr(baseline, "register", lambda *args: pytest.fail("must not register"))
    result, code = baseline.run(engine)
    assert code == 1 and result["status"] == "diferencias"
    engine.dispose()
