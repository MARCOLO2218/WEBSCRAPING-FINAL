"""SPEC-101, primera fase: identidad compartida en el ensayo, nunca en DEV operativo.

Invoca psql dentro de tickets_it_db. No lee contraseñas de PostgreSQL ni .env.
El plan muestra sólo conteos/huellas. --apply requiere identidad exacta del plan.
"""
import argparse
import hashlib
import json
import subprocess

from sqlalchemy import MetaData
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable

from ..auth_models import auth_metadata
from ..auth_throttle_models import login_attempts


SOURCE = "catalogocomercial_identidad_101"
TARGET = "catalogocomercial_ensayo_101"
TABLES = ("paises", "usuarios", "usuario_paises", "sesiones_app",
          "login_intentos", "admin_eventos")


def psql(database, sql):
    if database not in {SOURCE, TARGET}:
        raise ValueError("Base fuera del ensayo autorizado")
    command = ["sudo", "-n", "docker", "exec", "-i", "tickets_it_db", "sh", "-c",
               'exec psql -X -qAt -U "${POSTGRES_USER:-postgres}" -d "$1" '
               '-v ON_ERROR_STOP=1', "sh", database]
    result = subprocess.run(command, input=sql, text=True, encoding="utf-8",
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        # psql puede incluir datos de una fila rechazada: no imprimir stderr.
        raise RuntimeError("Consulta/DDL de ensayo rechazada; revisar sudo -v, bases y precondiciones")
    return result.stdout.strip()


def literal(value):
    if "\x00" in value:
        raise ValueError("Valor incompatible con PostgreSQL")
    return "'" + value.replace("'", "''") + "'"


def identity_snapshot():
    parts = ",".join(
        f"'{name}', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),"
        f"'[]'::jsonb) FROM catalogo.{name} t)" for name in TABLES)
    raw = psql(SOURCE, "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;"
               "DO $$ BEGIN IF (SELECT version_num FROM catalogo.alembic_version) "
               "IS DISTINCT FROM '047_admin_level_event' THEN "
               "RAISE EXCEPTION 'Revision incompatible'; END IF; END $$;"
               f"SELECT jsonb_build_object({parts}); COMMIT;")
    data = json.loads(raw)
    if set(data) != set(TABLES) or not data["usuarios"]:
        raise ValueError("Identidad incompleta")
    if not any(u["enabled"] and u["account_level"] == "superadmin" for u in data["usuarios"]):
        raise ValueError("No hay superadmin habilitado en el ensayo de identidad")
    content = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return data, hashlib.sha256(content.encode("utf-8")).hexdigest()


def destination_state():
    return json.loads(psql(TARGET, "BEGIN TRANSACTION READ ONLY; SELECT jsonb_build_object("
        "'database',current_database(),"
        "'productos',(SELECT count(*) FROM catalogo.productos_catalogo),"
        "'runs',(SELECT count(*) FROM catalogo.scraping_runs),"
        "'publicaciones',(SELECT count(*) FROM catalogo.catalog_display_snapshots),"
        "'esquemas_existentes',(SELECT coalesce(jsonb_agg(nspname),'[]'::jsonb) "
        "FROM pg_namespace WHERE nspname IN ('administracion','guatemala','nicaragua'))"
        "); COMMIT;"))


def target_metadata():
    metadata = MetaData(schema="administracion")
    for table in auth_metadata.tables.values():
        table.to_metadata(metadata, schema="administracion",
                          referred_schema_fn=lambda *args: "administracion")
    login_attempts.to_metadata(metadata, schema="administracion")
    if {t.name for t in metadata.tables.values()} != set(TABLES):
        raise ValueError("Los modelos de identidad cambiaron; revisar la fase 101")
    return metadata


def build_sql(data, fingerprint, state):
    dialect = postgresql.dialect()
    metadata = target_metadata()
    statements = ["BEGIN; SET LOCAL lock_timeout='10s';",
                  "SET LOCAL standard_conforming_strings=on;",
                  "SELECT pg_advisory_xact_lock(101,1);",
                  "DO $$ BEGIN "
                  f"IF current_database() <> '{TARGET}' THEN RAISE EXCEPTION 'Destino incorrecto'; END IF; "
                  "IF EXISTS (SELECT FROM pg_namespace WHERE nspname IN "
                  "('administracion','guatemala','nicaragua')) THEN "
                  "RAISE EXCEPTION 'Los esquemas destino ya existen'; END IF; END $$;",
                  "LOCK TABLE catalogo.productos_catalogo,catalogo.scraping_runs,"
                  "catalogo.catalog_display_snapshots IN SHARE MODE;"]
    for table, key in (("productos_catalogo", "productos"), ("scraping_runs", "runs"),
                       ("catalog_display_snapshots", "publicaciones")):
        expected = int(state[key])
        statements.append(f"DO $$ BEGIN IF (SELECT count(*) FROM catalogo.{table}) <> {expected} "
                          "THEN RAISE EXCEPTION 'El ensayo comercial cambio'; END IF; END $$;")
    statements.extend(f"CREATE SCHEMA {name};" for name in
                      ("administracion", "guatemala", "nicaragua"))
    for table in metadata.sorted_tables:
        statements.append(str(CreateTable(table).compile(dialect=dialect)) + ";")
        for index in sorted(table.indexes, key=lambda idx: idx.name):
            statements.append(str(CreateIndex(index).compile(dialect=dialect)) + ";")
        rows = data[table.name]
        expected_columns = set(table.c.keys())
        if any(set(row) != expected_columns for row in rows):
            raise ValueError("Columnas fuente divergentes: " + table.name)
        payload = literal(json.dumps(rows, ensure_ascii=False, separators=(",", ":")))
        statements.append(f"INSERT INTO administracion.{table.name} "
                          f"SELECT * FROM jsonb_populate_recordset(NULL::administracion.{table.name},"
                          f"{payload}::jsonb);")
        statements.append(f"DO $$ BEGIN IF (SELECT count(*) FROM administracion.{table.name}) "
                          f"<> {len(rows)} THEN RAISE EXCEPTION 'Conteo identidad divergente'; END IF; END $$;")
    statements.extend([
        "SELECT setval(pg_get_serial_sequence('administracion.paises','id'), "
        "coalesce((SELECT max(id) FROM administracion.paises),1), "
        "EXISTS(SELECT FROM administracion.paises));",
        "CREATE FUNCTION administracion.rechazar_cambio_admin_eventos() RETURNS trigger "
        "LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'admin_eventos es append-only'; END $$;",
        "CREATE TRIGGER trg_admin_eventos_append_only BEFORE UPDATE OR DELETE ON "
        "administracion.admin_eventos FOR EACH ROW EXECUTE FUNCTION "
        "administracion.rechazar_cambio_admin_eventos();",
        "CREATE TRIGGER trg_admin_eventos_no_truncate BEFORE TRUNCATE ON "
        "administracion.admin_eventos FOR EACH STATEMENT EXECUTE FUNCTION "
        "administracion.rechazar_cambio_admin_eventos();",
        "CREATE TABLE administracion.migraciones_ensayo ("
        "fase text PRIMARY KEY, origen text NOT NULL, huella_identidad text NOT NULL, "
        "aplicada_en timestamptz NOT NULL DEFAULT now());",
        "INSERT INTO administracion.migraciones_ensayo(fase,origen,huella_identidad) VALUES "
        f"('101_administracion','{SOURCE}',{literal(fingerprint)});",
        # Sin permisos públicos sobre identidad, sesiones o futuras tablas comerciales.
        "REVOKE ALL ON SCHEMA administracion,guatemala,nicaragua FROM PUBLIC;",
        "REVOKE ALL ON ALL TABLES IN SCHEMA administracion FROM PUBLIC;",
        "COMMIT;",
    ])
    return "\n".join(statements)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm-rehearsal", action="store_true")
    parser.add_argument("--expected-identity-sha256")
    args = parser.parse_args(argv)
    try:
        data, fingerprint = identity_snapshot()
        state = destination_state()
        if state["esquemas_existentes"]:
            raise ValueError("Existen esquemas de destino; no sobrescribir ni repetir la fase")
        sql = build_sql(data, fingerprint, state)
        report = {"source": SOURCE, "target": TARGET, "identity_sha256": fingerprint,
                  "identity_counts": {name: len(data[name]) for name in TABLES},
                  "commercial_counts": state,
                  "country_tables_created": False, "application_switched": False}
        if args.apply:
            if not args.confirm_rehearsal or args.expected_identity_sha256 != fingerprint:
                raise ValueError("Se requiere --confirm-rehearsal y huella exacta del plan")
            psql(TARGET, sql)
            print(json.dumps({"status": "administracion_ensayo_aplicada", **report}, ensure_ascii=False))
        else:
            print(json.dumps({"status": "plan_preparado", **report}, ensure_ascii=False, indent=2))
    except Exception as error:
        print(json.dumps({"status": "error", "message": str(error)
              if isinstance(error, (ValueError, RuntimeError)) else "Fase de ensayo no confirmada"},
              ensure_ascii=False))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
