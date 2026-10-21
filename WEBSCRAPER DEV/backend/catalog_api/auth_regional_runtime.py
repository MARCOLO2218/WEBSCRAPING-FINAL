"""Arranque aislado auth en administracion. No altera runtime/servicio existente."""
import argparse
import json
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import URL

from .auth_runtime import compose, load_password, read_key, validate_origin
from .db.administration_rehearsal import target_metadata


def check_destination(connection):
    connection.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
    identity = connection.execute(text("SELECT current_database() AS db,current_user AS role")).mappings().one()
    if identity["db"] not in {"catalogocomercial_ensayo_101", "webscraper_dev"} \
            or identity["role"] != "webscraper_user":
        raise ValueError("Requiere base regional DEV y rol webscraper_user")
    phases = set(connection.execute(text("SELECT fase FROM administracion.migraciones_ensayo")).scalars())
    if not {"101_administracion", "101_comercial"} <= phases:
        raise ValueError("La base no completó las fases regionales de ensayo")
    metadata = target_metadata()
    inspector = inspect(connection)
    counts = {}
    for table in metadata.tables.values():
        columns = {column["name"] for column in inspector.get_columns(table.name, schema="administracion")}
        if columns != set(table.c.keys()):
            raise ValueError("Columnas administrativas incompatibles: " + table.name)
        counts[table.name] = connection.execute(text(f"SELECT count(*) FROM administracion.{table.name}")).scalar_one()
    for schema in ("guatemala", "nicaragua"):
        for table in ("productos", "ejecuciones", "tiendas", "publicaciones"):
            if not inspector.has_table(table, schema=schema):
                raise ValueError("Esquema comercial incompleto: " + schema)
    return {"status": "validado", "database": identity["db"], "auth_schema": "administracion",
            "filas": counts, "escritura_ejecutada": False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db-host", required=True)
    parser.add_argument("--db-port", type=int, default=5432)
    parser.add_argument("--database", choices=["catalogocomercial_ensayo_101", "webscraper_dev"], required=True)
    parser.add_argument("--password-file", type=Path)
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--https-origin")
    parser.add_argument("--hmac-file", type=Path)
    parser.add_argument("--port", type=int, default=8042)
    parser.add_argument("--trusted-local-proxy", action="store_true")
    args = parser.parse_args(argv)
    if not 1 <= args.db_port <= 65535 or not 1 <= args.port <= 65535 or args.port == 8041:
        parser.error("Puertos inválidos o puerto reservado para auth actual")
    if not args.check_only and (not args.https_origin or not args.hmac_file):
        parser.error("Arranque requiere --https-origin y --hmac-file")
    engine = None
    try:
        key = None
        if not args.check_only:
            validate_origin(args.https_origin)
            key = read_key(args.hmac_file)
        password = load_password(args.password_file)
        engine = create_engine(URL.create("postgresql+psycopg", username="webscraper_user",
            password=password, host=args.db_host, port=args.db_port, database=args.database),
            hide_parameters=True, pool_pre_ping=True,
            connect_args={"connect_timeout": 10, "application_name": "catalog_auth_regional_dev"},
            execution_options={"schema_translate_map": {"catalogo": "administracion"}})
        del password
        with engine.begin() as connection:
            report = check_destination(connection)
        if args.check_only:
            print(json.dumps(report, ensure_ascii=False))
            return 0
        import uvicorn
        uvicorn.run(compose(engine, args.https_origin, key), host="127.0.0.1", port=args.port,
                    proxy_headers=args.trusted_local_proxy, forwarded_allow_ips="127.0.0.1", access_log=False)
        return 0
    except Exception:
        print(json.dumps({"status": "error", "message": "Auth regional no iniciado; revisar destino, permisos y credenciales."}))
        return 1
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
