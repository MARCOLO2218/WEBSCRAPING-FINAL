"""Migración acotada del catálogo regional, con revisión previa por defecto."""
import argparse
import json
import os
import re
from sqlalchemy import create_engine, inspect, text
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from .baseline import BACKEND, REVISION as BASELINE, validate
from .audit import inventory
from .connection import database_url, readonly_engine, schema_name

REVISION = "037_countries"

def migrate(connection, schema="catalogo", apply=False):
    heads = MigrationContext.configure(connection, opts={"version_table_schema": schema}).get_current_heads()
    if heads == (REVISION,):
        if not inspect(connection).has_table("paises", schema=schema):
            raise ValueError("Revisión registrada sin tabla paises")
        return "ya_aplicado"
    if heads != (BASELINE,):
        raise ValueError("Registrar SPEC-036 antes de SPEC-037")
    if inspect(connection).has_table("paises", schema=schema):
        raise ValueError("Ya existe paises sin esta revisión; revisar antes de continuar")
    if not apply:
        return "listo_para_crear_paises"
    config = Config(str(BACKEND / "alembic.ini"))
    config.attributes.update(connection=connection, baseline_schema=schema, countries_migration=True)
    command.upgrade(config, REVISION)
    return "aplicado"

def run(engine, apply=False):
    with engine.begin() as connection:
        if apply:
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
            connection.execute(text("SELECT pg_advisory_xact_lock(360036)"))
            connection.execute(text("LOCK TABLE catalogo.scraping_runs, catalogo.productos_catalogo, "
                                    "catalogo.catalog_display_snapshots IN ACCESS SHARE MODE"))
        heads = MigrationContext.configure(connection, opts={"version_table_schema": "catalogo"}).get_current_heads()
        if heads != (REVISION,):
            problems = validate(inventory(connection, "catalogo"))
            if problems:
                return {"status": "diferencias", "issues": problems}, 1
        status = migrate(connection, apply=apply)
        return {"status": status, "revision": REVISION}, 0

def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args(argv)
    engine = None
    try:
        if schema_name() != "catalogo":
            raise ValueError("Sólo se auditó catalogo")
        engine = create_engine(database_url(), hide_parameters=True, connect_args={
            "connect_timeout": 10, "options": "-c statement_timeout=30000",
            "sslmode": "require" if os.environ.get("PGSSL", "").lower() == "true" else "disable"
        }) if args.apply else readonly_engine()
        result, code = run(engine, args.apply)
        print(json.dumps(result, ensure_ascii=False))
        return code
    except Exception as error:
        state = getattr(getattr(error, "orig", error), "sqlstate", None)
        state = state if isinstance(state, str) and re.fullmatch(r"[A-Z0-9]{5}", state) else None
        print(json.dumps({"status": "error", "sqlstate": state,
            "message": "No se aplicó SPEC-037. Revisar baseline 036_existing, permisos y tablas existentes."}))
        return 2
    finally:
        if engine is not None:
            engine.dispose()

if __name__ == "__main__":
    raise SystemExit(main())
