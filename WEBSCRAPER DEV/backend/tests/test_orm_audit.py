from sqlalchemy import BigInteger, Text
from catalog_api.db import audit


def test_sequence_query_is_parameterized_and_does_not_advance_ids():
    class Result:
        def mappings(self):
            return self
        def first(self):
            return {"name": "runs_id_seq", "increment": 1}
    class Connection:
        def execute(self, statement, params):
            sql = str(statement)
            assert "nextval" not in sql and "setval" not in sql
            assert params == {"schema": "custom", "table": "scraping_runs", "column": "id"}
            assert ":schema" in sql and ":table" in sql
            return Result()
    assert audit.sequence_metadata(Connection(), "custom", "scraping_runs", "id") == {
        "name": "runs_id_seq", "increment": 1}


def test_inventory_reports_generation_checks_and_missing_tables(monkeypatch):
    class Inspector:
        def get_table_names(self, **kwargs):
            return ["scraping_runs", "extra_table"]
        def get_columns(self, table, **kwargs):
            return [{"name": "id", "type": BigInteger(), "nullable": False,
                     "default": "nextval('catalogo.scraping_runs_id_seq'::regclass)"},
                    {"name": "extra", "type": Text(), "nullable": True}]
        def get_pk_constraint(self, *args, **kwargs):
            return {"constrained_columns": ["id"]}
        def get_foreign_keys(self, *args, **kwargs):
            return []
        get_indexes = get_foreign_keys
        get_unique_constraints = get_foreign_keys
        def get_check_constraints(self, *args, **kwargs):
            return [{"name": "positive", "sqltext": "id > 0"}]
    monkeypatch.setattr(audit, "inspect", lambda connection: Inspector())
    monkeypatch.setattr(audit, "sequence_metadata", lambda *args: {"increment": 1})
    report = audit.inventory(object(), "catalogo")
    assert report["audit_version"] == 2
    assert report["baseline_validated"] is False
    assert report["schema_tables"] == ["extra_table", "scraping_runs"]
    run = report["tables"]["scraping_runs"]
    assert run["generation"]["id"]["default"].startswith("nextval(")
    assert run["generation"]["extra"]["identity"] is None
    assert run["id_sequence"] == {"increment": 1}
    assert run["check_constraints"][0]["name"] == "positive"
    assert "Columna adicional: extra" in run["issues"]
    assert report["tables"]["productos_catalogo"]["issues"] == ["Falta tabla"]
