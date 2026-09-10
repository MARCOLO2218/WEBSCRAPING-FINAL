"""python -m catalog_api.db.audit: metadatos solamente, sin baseline automático."""
import json
import re
from sqlalchemy import inspect, text
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

def sequence_metadata(connection, schema, table, column):
    # Identificadores citados por PostgreSQL; parámetros nunca interpolados.
    row = connection.execute(text("""
        SELECT n.nspname AS schema, c.relname AS name,
               format_type(s.seqtypid, NULL) AS data_type,
               s.seqstart AS start, s.seqincrement AS increment,
               s.seqmin AS minimum, s.seqmax AS maximum,
               s.seqcache AS cache, s.seqcycle AS cycle
        FROM pg_catalog.pg_sequence s
        JOIN pg_catalog.pg_class c ON c.oid = s.seqrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE s.seqrelid = pg_catalog.pg_get_serial_sequence(
            format('%I.%I', CAST(:schema AS TEXT), CAST(:table AS TEXT)),
            CAST(:column AS TEXT))::regclass
    """), {"schema": schema, "table": table, "column": column}).mappings().first()
    return dict(row) if row is not None else None

def inventory(connection, schema):
    inspector = inspect(connection)
    existing = set(inspector.get_table_names(schema=schema))
    report = {"schema": schema, "audit_version": 2, "baseline_validated": False,
              "schema_tables": sorted(existing), "tables": {}}
    for table in metadata.sorted_tables:
        if table.name not in existing:
            report["tables"][table.name] = {"issues": ["Falta tabla"]}
            continue
        columns = inspector.get_columns(table.name, schema=schema)
        expected = {c.name: {"type": type_name(c.type), "nullable": c.nullable} for c in table.columns}
        actual = {c["name"]: {"type": type_name(c["type"]), "nullable": c["nullable"]} for c in columns}
        report["tables"][table.name] = {
            "columns": actual, "issues": differences(expected, actual),
            "generation": {c["name"]: {
                "default": c.get("default"), "identity": c.get("identity"),
                "computed": c.get("computed")
            } for c in columns},
            "id_sequence": sequence_metadata(connection, schema, table.name, "id")
                if "id" in actual else None,
            "check_constraints": inspector.get_check_constraints(table.name, schema=schema),
            "primary_key": inspector.get_pk_constraint(table.name, schema=schema),
            "foreign_keys": inspector.get_foreign_keys(table.name, schema=schema),
            "indexes": inspector.get_indexes(table.name, schema=schema),
            "unique_constraints": inspector.get_unique_constraints(table.name, schema=schema)}
    return report

def main():
    engine = None
    phase = "configuracion"
    try:
        engine = readonly_engine()
        phase = "conexion"
        with engine.connect() as connection:
            phase = "metadatos"
            report = inventory(connection, schema_name())
        print(json.dumps(report, indent=2, ensure_ascii=False, default=str))
        return 1 if any(t["issues"] for t in report["tables"].values()) else 0
    except Exception as error:
        # Los mensajes del driver pueden incluir host, usuario o credenciales.
        state = getattr(getattr(error, "orig", error), "sqlstate", None)
        state = state if isinstance(state, str) and re.fullmatch(r"[A-Z0-9]{5}", state) else None
        print(json.dumps({"error": "No se pudo completar la auditoría",
                          "phase": phase, "sqlstate": state}, ensure_ascii=False))
        return 2
    finally:
        if engine is not None:
            engine.dispose()

if __name__ == "__main__":
    raise SystemExit(main())
