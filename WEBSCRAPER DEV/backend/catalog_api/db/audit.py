"""python -m catalog_api.db.audit: metadatos solamente, sin baseline automático."""
import json
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import dialect
from .connection import readonly_engine, schema_name
from .models import metadata

def type_name(value):
    return str(value.compile(dialect=dialect()))

def differences(expected, actual):
    issues = []
    for name, column in expected.items():
        if name not in actual:
            issues.append(f"Falta columna: {name}")
        elif column != actual[name]:
            issues.append(f"Columna diferente: {name}")
    issues.extend(f"Columna adicional: {name}" for name in actual.keys() - expected.keys())
    return sorted(issues)

def inventory(connection, schema):
    inspector = inspect(connection)
    existing = set(inspector.get_table_names(schema=schema))
    report = {"schema": schema, "baseline_validated": False, "tables": {}}
    for table in metadata.sorted_tables:
        if table.name not in existing:
            report["tables"][table.name] = {"issues": ["Falta tabla"]}
            continue
        columns = inspector.get_columns(table.name, schema=schema)
        expected = {c.name: {"type": type_name(c.type), "nullable": c.nullable} for c in table.columns}
        actual = {c["name"]: {"type": type_name(c["type"]), "nullable": c["nullable"]} for c in columns}
        report["tables"][table.name] = {
            "columns": actual, "issues": differences(expected, actual),
            "primary_key": inspector.get_pk_constraint(table.name, schema=schema),
            "foreign_keys": inspector.get_foreign_keys(table.name, schema=schema),
            "indexes": inspector.get_indexes(table.name, schema=schema),
            "unique_constraints": inspector.get_unique_constraints(table.name, schema=schema)}
    return report

def main():
    engine = None
    try:
        engine = readonly_engine()
        with engine.connect() as connection:
            report = inventory(connection, schema_name())
        print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
        return 1 if any(t["issues"] for t in report["tables"].values()) else 0
    except Exception:
        # Los mensajes del driver pueden incluir host, usuario o credenciales.
        print("No se pudo auditar PostgreSQL. Revisa variables PG, conectividad y permisos de DEV.")
        return 2
    finally:
        if engine is not None:
            engine.dispose()

if __name__ == "__main__":
    raise SystemExit(main())
