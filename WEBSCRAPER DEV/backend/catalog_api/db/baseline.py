"""Adopción acotada del esquema auditado; no es un ejecutor general de migraciones."""
import argparse
import json
import re
from pathlib import Path
from sqlalchemy import create_engine, text
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from .audit import inventory
from .connection import database_url, readonly_engine, schema_name

REVISION = "036_existing"
REFERENCE = Path(__file__).with_name("baseline_reference.json")
BACKEND = Path(__file__).resolve().parents[2]

def reference():
    return json.loads(REFERENCE.read_text(encoding="utf-8"))

def comparable(value):
    # Omitir comentarios y opciones vacías añadidas por versiones del inspector.
    if isinstance(value, dict):
        return {k: comparable(v) for k, v in value.items()
                if k not in {"comment", "issues"} and v not in (None, [], {})}
    if isinstance(value, (list, tuple)):
        items = [comparable(v) for v in value]
        return sorted(items, key=lambda v: v["name"]) if items and all(
            isinstance(v, dict) and "name" in v for v in items) else items
    return value

def validate(report):
    expected = reference()
    problems = []
    if report.get("schema") != "catalogo" or report.get("audit_version") != 2:
        problems.append("Esquema o versión de auditoría no compatible")
    if set(report.get("schema_tables", [])) - {"alembic_version"} != set(expected["schema_tables"]):
        problems.append("Lista de tablas diferente")
    for table, baseline in expected["tables"].items():
        actual = report.get("tables", {}).get(table, {})
        if actual.get("issues") or comparable(actual) != comparable(baseline):
            problems.append(f"Metadatos diferentes: {table}")
    return problems

def register(connection, schema):
    context = MigrationContext.configure(connection, opts={"version_table_schema": schema})
    heads = context.get_current_heads()
    if heads == (REVISION,):
        return "ya_registrado"
    if heads:
        raise ValueError("Existe otra revisión Alembic; no se reemplaza")
    config = Config(str(BACKEND / "alembic.ini"))
    config.attributes.update(connection=connection, baseline_schema=schema,
                             baseline_registration=True)
    command.stamp(config, REVISION)
    if context.get_current_heads() != (REVISION,):
        raise RuntimeError("No se confirmó la revisión")
    return "registrado"

def run(engine, apply=False):
    with engine.begin() as connection:
        if apply:
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            connection.execute(text("SELECT pg_advisory_xact_lock(360036)"))
            # Nombres fijos del esquema validado; bloquea ALTER/DROP, permite DML.
            connection.execute(text("LOCK TABLE catalogo.scraping_runs, "
                "catalogo.productos_catalogo, catalogo.catalog_display_snapshots IN ACCESS SHARE MODE"))
        report = inventory(connection, "catalogo")
        problems = validate(report)
        if problems:
            return {"status": "diferencias", "issues": problems}, 1
        status = register(connection, "catalogo") if apply else "listo_para_registrar"
        return {"status": status, "revision": REVISION}, 0

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Registrar únicamente la versión Alembic")
    args = parser.parse_args(argv)
    engine = None
    try:
        if schema_name() != "catalogo":
            raise ValueError("Sólo se auditó catalogo")
        if args.apply:
            import os
            engine = create_engine(database_url(), hide_parameters=True, connect_args={
                "connect_timeout": 10, "options": "-c statement_timeout=30000",
                "sslmode": "require" if os.environ.get("PGSSL", "").lower() == "true" else "disable"})
        else:
            engine = readonly_engine()
        result, code = run(engine, args.apply)
        print(json.dumps(result, ensure_ascii=False))
        return code
    except Exception as error:
        state = getattr(getattr(error, "orig", error), "sqlstate", None)
        state = state if isinstance(state, str) and re.fullmatch(r"[A-Z0-9]{5}", state) else None
        print(json.dumps({"status": "error", "sqlstate": state,
            "message": "Registro no completado; transacción revertida. Revisar configuración o versión existente."}))
        return 2
    finally:
        if engine is not None:
            engine.dispose()

if __name__ == "__main__":
    raise SystemExit(main())
