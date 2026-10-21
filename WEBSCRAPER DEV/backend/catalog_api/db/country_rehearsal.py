"""SPEC-101 fase comercial: únicamente catalogocomercial_ensayo_101.

Plan de sólo lectura por defecto. Conserva catalogo como legado íntegro, separa
productos GT clasificados e importa snapshot NC sin inventar autores históricos.
No cambia configuración de la aplicación ni revisión Alembic del legado.
"""
import argparse
from collections import Counter
from datetime import datetime
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urlsplit
from uuid import NAMESPACE_URL, uuid5

from .administration_rehearsal import TARGET, literal, psql
from . import regional_classification as rules

STORES = {
    "la-curacao": ("la-curacao-nc", "La Curacao Nicaragua", "www.lacuracaonline.com"),
    "el-gallo": ("el-gallo-nc", "El Gallo mas Gallo Nicaragua", "www.elgallomasgallo.com.ni"),
    "siman": ("siman-nc", "Siman Nicaragua", "ni.siman.com"),
    "walmart": ("walmart-nc", "Walmart Nicaragua", "www.walmart.com.ni"),
    "maxipali": ("maxipali-nc", "Maxi Pali Nicaragua", "maxipali.com.ni"),
}


def sha(value):
    return hashlib.sha256(value).hexdigest()


def utc_date(value):
    if not isinstance(value, str):
        raise ValueError("Fecha NC ausente")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.utcoffset() is None:
        raise ValueError("Fecha NC requiere zona horaria")
    return value


def price(text, numeric):
    if not isinstance(text, str):
        raise ValueError("Precio NC requiere texto original")
    if not text.strip():
        if numeric is not None:
            raise ValueError("Precio numerico NC sin texto")
        return
    match = re.fullmatch(r"C\$\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)", text.strip())
    if not match or numeric is None or isinstance(numeric, bool):
        raise ValueError("Precio NIO incompatible con snapshot normalizado")
    amount = Decimal(match[1].replace(",", ""))
    if not amount.is_finite() or not 0 < amount < Decimal("10000000000") \
            or amount != Decimal(str(numeric)):
        raise ValueError("Importe NIO divergente")


def snapshot(path, expected):
    raw = path.read_bytes()
    fingerprint = sha(raw)
    if fingerprint != expected:
        raise ValueError("El SHA256 del respaldo NC no coincide")
    data = json.loads(raw)
    if data.get("version") != 1 or data.get("country") != "NC" or data.get("currency") != "NIO":
        raise ValueError("Snapshot fuera de NC/NIO version 1")
    utc_date(data.get("scrapedAt"))
    stores = data.get("stores")
    products = data.get("products")
    if not isinstance(stores, list) or not isinstance(products, list) or not products \
            or len(stores) != 5 or {s.get("store") for s in stores} != set(STORES):
        raise ValueError("Snapshot NC incompleto")
    seen = set()
    counts = Counter()
    priced = Counter()
    for row in products:
        key = next((k for k, v in STORES.items() if v[0] == row.get("store_id")), None)
        if key is None or row.get("country") != "NC" or row.get("currency") != "NIO" \
                or row.get("source_site") != STORES[key][1] or not row.get("product_name", "").strip():
            raise ValueError("Identidad de producto NC invalida")
        for field in ("source_url", "product_url"):
            url = urlsplit(row[field])
            if url.scheme != "https" or url.hostname != STORES[key][2] or url.port \
                    or url.username or url.password \
                    or (key == "la-curacao" and not url.path.startswith("/nicaragua/")):
                raise ValueError("Procedencia NC invalida")
        identity = (row["store_id"], row["product_url"])
        if identity in seen:
            raise ValueError("Producto NC duplicado")
        seen.add(identity)
        counts[key] += 1
        price(row.get("regular_price"), row.get("regular_price_value"))
        price(row.get("sale_price"), row.get("sale_price_value"))
        if row.get("regular_price_value") is not None or row.get("sale_price_value") is not None:
            priced[key] += 1
        utc_date(row.get("scraped_at"))
    for store in stores:
        if store.get("status") != "ok" or store.get("count") != counts[store["store"]] \
                or store.get("priced") != priced[store["store"]]:
            raise ValueError("Conteo/estado NC no coincide con los productos respaldados")
        utc_date(store.get("scrapedAt"))
        store["import_uuid"] = str(uuid5(NAMESPACE_URL, fingerprint + ":" + store["store"]))
    for row in products:
        store = next(s for s in stores if STORES[s["store"]][0] == row["store_id"])
        row["import_uuid"] = store["import_uuid"]
        row["registro_uuid"] = str(uuid5(NAMESPACE_URL,
            fingerprint + ":" + row["store_id"] + ":" + row["product_url"]))
    return data, fingerprint


def inspect_target():
    return json.loads(psql(TARGET, "BEGIN TRANSACTION READ ONLY; SET LOCAL TIME ZONE 'UTC';"
        "SELECT jsonb_build_object("
        "'productos',(SELECT count(*) FROM catalogo.productos_catalogo),"
        "'runs',(SELECT count(*) FROM catalogo.scraping_runs),"
        "'run_hash',(SELECT md5(string_agg(md5(to_jsonb(r)::text),'' ORDER BY id)) "
        "FROM catalogo.scraping_runs r),"
        "'snapshot_hash',(SELECT md5(string_agg(md5(to_jsonb(s)::text),'' ORDER BY store_key)) "
        "FROM catalogo.catalog_display_snapshots s),"
        "'fase_identidad',(SELECT huella_identidad FROM administracion.migraciones_ensayo "
        "WHERE fase='101_administracion'),"
        "'objetos_pais',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
        "WHERE n.nspname IN ('guatemala','nicaragua'))"
        "); COMMIT;"))


def classify():
    command = ["sudo", "-n", "docker", "exec", "-i", "tickets_it_db", "sh", "-c",
               'exec psql -X -qAt -U "${POSTGRES_USER:-postgres}" -d "$1" '
               '-v ON_ERROR_STOP=1', "sh", TARGET]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, text=True, encoding="utf-8")
    records = []
    counts = Counter()
    digest = hashlib.sha256()
    try:
        process.stdin.write("BEGIN TRANSACTION READ ONLY; SET LOCAL TIME ZONE 'UTC'; "
            "SELECT jsonb_build_object('row',to_jsonb(p),'hash',md5(to_jsonb(p)::text)) "
            "FROM catalogo.productos_catalogo p ORDER BY id; COMMIT;")
        process.stdin.close()
        for line in process.stdout:
            item = json.loads(line)
            row = item["row"]
            result = rules.classify_product(row)
            status, country, reason = result.status, result.country, result.reason
            if status == "asignado" and row["run_id"] is None:
                status, country, reason = "revision", None, "ejecucion_legacy_ausente"
            record = (row["id"], item["hash"], status, country, reason, rules.RULE_VERSION)
            digest.update(json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode() + b"\n")
            records.append(record)
            counts[(country or "sin_pais") + "/" + status] += 1
        if process.wait() != 0:
            raise RuntimeError("No se pudo completar la lectura comercial del ensayo")
    finally:
        process.stdout.close()
        if process.poll() is None:
            process.terminate()
            process.wait()
    return records, dict(sorted(counts.items())), digest.hexdigest()


def country_sql(schema, code, currency):
    return f"""
CREATE TABLE {schema}.tiendas (
 store_key text PRIMARY KEY, nombre text NOT NULL,
 pais_codigo text NOT NULL DEFAULT '{code}' CHECK(pais_codigo='{code}')
 REFERENCES administracion.paises(codigo));
CREATE TABLE {schema}.ejecuciones (
 id uuid PRIMARY KEY, legacy_run_id bigint UNIQUE,
 usuario_id varchar(36) REFERENCES administracion.usuarios(id) ON DELETE RESTRICT,
 origen text NOT NULL CHECK(origen IN ('historico','importacion_snapshot','manual','programado')),
 estado text NOT NULL CHECK(estado IN ('historica','importada','encolada','ejecutando',
 'completada','parcial','fallida','interrumpida')),
 inicio_original timestamp, inicio timestamptz, fin timestamptz,
 observada_en timestamptz, total_productos integer NOT NULL CHECK(total_productos>=0),
 total_original integer, importado_en timestamptz NOT NULL DEFAULT now(), source_payload jsonb NOT NULL,
 CHECK(origen NOT IN ('manual','programado') OR usuario_id IS NOT NULL),
 CHECK(fin IS NULL OR (inicio IS NOT NULL AND fin>=inicio)), UNIQUE(id,legacy_run_id));
CREATE INDEX ON {schema}.ejecuciones(usuario_id,importado_en);
CREATE TABLE {schema}.productos (
 LIKE catalogo.productos_catalogo,
 store_key text NOT NULL REFERENCES {schema}.tiendas(store_key),
 ejecucion_uuid uuid NOT NULL REFERENCES {schema}.ejecuciones(id),
 pais_codigo text NOT NULL DEFAULT '{code}' CHECK(pais_codigo='{code}')
 REFERENCES administracion.paises(codigo),
 moneda text NOT NULL DEFAULT '{currency}' CHECK(moneda='{currency}'),
 fecha_scraping_utc timestamptz, PRIMARY KEY(id), UNIQUE(registro_uuid),
 FOREIGN KEY(ejecucion_uuid,run_id) REFERENCES {schema}.ejecuciones(id,legacy_run_id));
ALTER TABLE {schema}.productos ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;
ALTER TABLE {schema}.productos ALTER COLUMN registro_uuid SET DEFAULT pg_catalog.gen_random_uuid();
ALTER TABLE {schema}.productos ALTER COLUMN creado_en SET DEFAULT now();
CREATE INDEX ON {schema}.productos(ejecucion_uuid,store_key);
CREATE TABLE {schema}.publicaciones (
 store_key text PRIMARY KEY REFERENCES {schema}.tiendas(store_key),
 ejecucion_uuid uuid NOT NULL REFERENCES {schema}.ejecuciones(id),
 product_count integer NOT NULL CHECK(product_count>=0), source_count integer,
 observada_en timestamptz, locked_at timestamptz, lock_until timestamptz,
 source_payload jsonb NOT NULL);
CREATE VIEW {schema}.v_productos_cubo AS SELECT p.id, p.registro_uuid,
 p.pais_codigo,p.moneda,p.store_key,p.producto,p.marca,p.categoria,p.url_producto,
 p.precio_regular,p.precio_oferta,p.precio_regular_min,p.precio_regular_max,
 p.precio_oferta_min,p.precio_oferta_max,p.fecha_scraping,p.fecha_scraping_utc,
 e.id AS ejecucion_uuid,e.legacy_run_id,e.usuario_id,
 coalesce(u.username,'Sin usuario registrado') AS usuario,e.origen,e.estado
 FROM {schema}.productos p JOIN {schema}.ejecuciones e ON e.id=p.ejecucion_uuid
 LEFT JOIN administracion.usuarios u ON u.id=e.usuario_id;
CREATE VIEW {schema}.v_ejecuciones_cubo AS SELECT '{code}'::text AS pais_codigo,
 '{currency}'::text AS moneda,e.id AS ejecucion_uuid,e.legacy_run_id,e.usuario_id,
 coalesce(u.username,'Sin usuario registrado') AS usuario,e.origen,e.estado,
 e.inicio,e.fin,e.inicio_original,e.observada_en,e.total_productos
 FROM {schema}.ejecuciones e LEFT JOIN administracion.usuarios u ON u.id=e.usuario_id;
"""


def build_sql(state, records, nc, nc_sha, plan_sha):
    key = "CASE WHEN p.sitio_fuente LIKE 'La Colchoner%' THEN 'La Colchoneria Guatemala' ELSE p.sitio_fuente END"
    sql = ["BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL TIME ZONE 'UTC'; "
           "SET LOCAL standard_conforming_strings=on; SELECT pg_advisory_xact_lock(101,1);",
           f"DO $$ BEGIN IF current_database()<>'{TARGET}' THEN RAISE EXCEPTION 'Destino incorrecto'; END IF; "
           "IF EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
           "WHERE n.nspname IN ('guatemala','nicaragua')) THEN "
           "RAISE EXCEPTION 'Esquemas comerciales no vacios'; END IF; END $$;",
           "LOCK TABLE catalogo.productos_catalogo,catalogo.scraping_runs,"
           "catalogo.catalog_display_snapshots IN SHARE MODE;",
           "DO $$ BEGIN IF (SELECT count(*) FROM catalogo.productos_catalogo)<>"
           f"{int(state['productos'])} OR (SELECT count(*) FROM catalogo.scraping_runs)<>"
           f"{int(state['runs'])} THEN RAISE EXCEPTION 'Cambian conteos'; END IF; "
           "IF (SELECT md5(string_agg(md5(to_jsonb(r)::text),'' ORDER BY id)) "
           "FROM catalogo.scraping_runs r) IS DISTINCT FROM " + literal(state["run_hash"]) +
           " OR (SELECT md5(string_agg(md5(to_jsonb(s)::text),'' ORDER BY store_key)) "
           "FROM catalogo.catalog_display_snapshots s) IS DISTINCT FROM " + literal(state["snapshot_hash"]) +
           " THEN RAISE EXCEPTION 'Cambio del historial o publicaciones'; END IF; END $$;",
           "CREATE TABLE administracion.clasificacion_productos_101 ("
           "producto_id bigint PRIMARY KEY REFERENCES catalogo.productos_catalogo(id),source_hash text NOT NULL,"
           "estado text NOT NULL CHECK(estado IN ('asignado','revision','no_producto')),"
           "pais_codigo text REFERENCES administracion.paises(codigo),motivo text NOT NULL,regla text NOT NULL,"
           "CHECK((estado='asignado' AND pais_codigo IS NOT NULL) OR "
           "(estado<>'asignado' AND pais_codigo IS NULL)));",
           "COPY administracion.clasificacion_productos_101 FROM STDIN;"]
    def copy_value(value):
        return r"\N" if value is None else str(value).replace("\\", "\\\\").replace("\t", r"\t").replace("\n", r"\n").replace("\r", r"\r")
    sql.extend("\t".join(copy_value(value) for value in row) for row in records)
    sql.extend([r"\.", "DO $$ BEGIN IF EXISTS(SELECT FROM catalogo.productos_catalogo p "
        "LEFT JOIN administracion.clasificacion_productos_101 c ON c.producto_id=p.id "
        "WHERE c.producto_id IS NULL OR c.source_hash<>md5(to_jsonb(p)::text)) THEN "
        "RAISE EXCEPTION 'Cambio del contenido comercial'; END IF; END $$;",
        country_sql("guatemala", "GT", "GTQ"), country_sql("nicaragua", "NC", "NIO"),
        f"INSERT INTO guatemala.tiendas SELECT DISTINCT {key},{key},'GT' "
        "FROM catalogo.productos_catalogo p JOIN administracion.clasificacion_productos_101 c "
        "ON c.producto_id=p.id WHERE c.pais_codigo='GT' AND c.estado='asignado';",
        "INSERT INTO guatemala.ejecuciones(id,legacy_run_id,origen,estado,inicio_original,"
        "total_productos,total_original,source_payload) "
        "SELECT r.run_uuid,r.id,'historico','historica',r.started_at,count(*)::integer,"
        "r.total_products,to_jsonb(r) FROM catalogo.scraping_runs r "
        "JOIN catalogo.productos_catalogo p ON p.run_id=r.id "
        "JOIN administracion.clasificacion_productos_101 c ON c.producto_id=p.id "
        "WHERE c.pais_codigo='GT' AND c.estado='asignado' GROUP BY r.id;",
        f"INSERT INTO guatemala.productos SELECT p.*,{key},r.run_uuid,'GT','GTQ',NULL::timestamptz "
        "FROM catalogo.productos_catalogo p JOIN catalogo.scraping_runs r ON r.id=p.run_id "
        "JOIN administracion.clasificacion_productos_101 c ON c.producto_id=p.id "
        "WHERE c.pais_codigo='GT' AND c.estado='asignado';",
        "SELECT setval(pg_get_serial_sequence('guatemala.productos','id'),"
        "coalesce((SELECT max(id) FROM guatemala.productos),1),EXISTS(SELECT FROM guatemala.productos));",
        "INSERT INTO guatemala.publicaciones SELECT s.store_key,e.id,count(p.id)::integer,"
        "s.product_count,NULL::timestamptz,s.locked_at,s.lock_until,to_jsonb(s) "
        "FROM catalogo.catalog_display_snapshots s JOIN guatemala.ejecuciones e ON e.legacy_run_id=s.run_id "
        "JOIN guatemala.productos p ON p.ejecucion_uuid=e.id AND p.store_key=s.store_key "
        "GROUP BY s.store_key,e.id;",
        "CREATE TEMP TABLE nc_101(payload jsonb) ON COMMIT DROP;",
        "INSERT INTO nc_101 VALUES (" + literal(json.dumps(nc, ensure_ascii=False, allow_nan=False)) + "::jsonb);"])
    for store in nc["stores"]:
        store_id, name, _ = STORES[store["store"]]
        sql.append("INSERT INTO nicaragua.tiendas VALUES (" + literal(store_id) + "," + literal(name) + ",'NC');")
        sql.append("INSERT INTO nicaragua.ejecuciones(id,origen,estado,observada_en,total_productos,source_payload) "
                   "VALUES (" + literal(store["import_uuid"]) + ",'importacion_snapshot','importada'," +
                   literal(store["scrapedAt"]) + "::timestamptz," + str(store["count"]) + "," +
                   literal(json.dumps(store, ensure_ascii=False)) + "::jsonb);")
    # Columnas de texto originales conservadas junto a los cuatro importes numéricos.
    text_map = {"sitio_fuente": "source_site", "marca": "brand", "linea": "line", "categoria": "category",
        "producto": "product_name", "disponibilidad": "availability", "precio_regular": "regular_price",
        "precio_oferta": "sale_price", "descuento": "discount", "cuotas": "installment",
        "url_producto": "product_url", "url_fuente": "source_url", "titulo": "headline",
        "descripcion": "description", "garantia": "warranty", "beneficios": "benefits",
        "url_imagen": "image_url", "texto_imagen": "image_alt"}
    columns = ["registro_uuid", "run_uuid", "ejecucion_uuid", "store_key", "pais_codigo", "moneda",
               "fecha_scraping", "fecha_scraping_utc", "precio_regular_min", "precio_regular_max",
               "precio_oferta_min", "precio_oferta_max", *text_map]
    values = ["(p->>'registro_uuid')::uuid", "(p->>'import_uuid')::uuid", "(p->>'import_uuid')::uuid",
              "p->>'store_id'", "'NC'", "'NIO'", "(p->>'scraped_at')::timestamptz AT TIME ZONE 'UTC'",
              "(p->>'scraped_at')::timestamptz", "(p->>'regular_price_value')::numeric",
              "(p->>'regular_price_value')::numeric", "(p->>'sale_price_value')::numeric",
              "(p->>'sale_price_value')::numeric", *(f"p->>'{value}'" for value in text_map.values())]
    sql.append(f"INSERT INTO nicaragua.productos({','.join(columns)}) SELECT {','.join(values)} "
               "FROM nc_101 CROSS JOIN LATERAL jsonb_array_elements(payload->'products') p;")
    sql.extend(["INSERT INTO nicaragua.publicaciones SELECT t.store_key,e.id,e.total_productos,"
        "e.total_productos,e.observada_en,NULL,NULL,e.source_payload FROM nicaragua.tiendas t "
        "JOIN nicaragua.productos p ON p.store_key=t.store_key "
        "JOIN nicaragua.ejecuciones e ON e.id=p.ejecucion_uuid "
        "GROUP BY t.store_key,e.id;",
        "CREATE VIEW administracion.v_productos_cubo AS SELECT * FROM guatemala.v_productos_cubo "
        "UNION ALL SELECT * FROM nicaragua.v_productos_cubo;",
        "CREATE VIEW administracion.v_ejecuciones_cubo AS SELECT * FROM guatemala.v_ejecuciones_cubo "
        "UNION ALL SELECT * FROM nicaragua.v_ejecuciones_cubo;",
        "DO $$ BEGIN IF (SELECT count(*) FROM guatemala.productos)<>(SELECT count(*) "
        "FROM administracion.clasificacion_productos_101 WHERE estado='asignado' AND pais_codigo='GT') "
        f"OR (SELECT count(*) FROM nicaragua.productos)<>{len(nc['products'])} THEN "
        "RAISE EXCEPTION 'Conteo por pais divergente'; END IF; END $$;",
        "REVOKE ALL ON ALL TABLES IN SCHEMA administracion,guatemala,nicaragua FROM PUBLIC;",
        "INSERT INTO administracion.migraciones_ensayo(fase,origen,huella_identidad) VALUES "
        "('101_comercial','catalogo + snapshot NC'," + literal(plan_sha) + ");",
        "COMMIT;"])
    return "\n".join(sql)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--nc-snapshot", type=Path, required=True)
    parser.add_argument("--expected-nc-sha256", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm-rehearsal", action="store_true")
    parser.add_argument("--expected-plan-sha256")
    args = parser.parse_args(argv)
    try:
        if rules.RULE_VERSION != '038-origin-v3':
            raise ValueError('Esta fase requiere 038-origin-v3; actualizar reglas antes de generar o aplicar el plan')
        nc, nc_sha = snapshot(args.nc_snapshot, args.expected_nc_sha256)
        state = inspect_target()
        if not state["fase_identidad"] or state["objetos_pais"]:
            raise ValueError("Requiere fase administrativa y esquemas comerciales vacios")
        records, counts, content_sha = classify()
        if len(records) != state["productos"] or not counts.get("GT/asignado"):
            raise ValueError("Lectura comercial incompleta o sin productos GT")
        facts = {"target": TARGET, "source_state": state, "classification_counts": counts,
                 "classification_sha256": content_sha, "nc_sha256": nc_sha,
                 "rule": rules.RULE_VERSION, "rule_code_sha256": sha(Path(rules.__file__).read_bytes()),
                 "migration_code_sha256": sha(Path(__file__).read_bytes())}
        plan_sha = sha(json.dumps(facts, sort_keys=True, separators=(",", ":")).encode())
        report = {"plan_sha256": plan_sha, **facts, "nc_products": len(nc["products"]),
                  "nc_priced": sum(store["priced"] for store in nc["stores"]),
                  "historical_author": None, "legacy_preserved": True, "application_switched": False}
        if args.apply:
            if not args.confirm_rehearsal or args.expected_plan_sha256 != plan_sha:
                raise ValueError("Requiere confirmacion de ensayo y SHA256 exacto del plan")
            psql(TARGET, build_sql(state, records, nc, nc_sha, plan_sha))
            print(json.dumps({"status": "paises_ensayo_aplicados", **report}, ensure_ascii=False))
        else:
            print(json.dumps({"status": "plan_preparado", **report}, ensure_ascii=False, indent=2))
    except Exception as error:
        print(json.dumps({"status": "error", "message": str(error)
              if isinstance(error, (ValueError, RuntimeError)) else "Ensayo comercial no confirmado"},
              ensure_ascii=False))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
