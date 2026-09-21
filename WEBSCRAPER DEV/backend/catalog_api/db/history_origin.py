"""Evidencia histórica para SPEC-038; nunca infiere ni escribe países."""
import json
import re
from collections import Counter
from urllib.parse import urlsplit

from sqlalchemy import text
from .connection import readonly_engine, schema_name


def url_evidence(value):
    if not value or not value.strip():
        return "ausente", ""
    try:
        parsed = urlsplit(value.strip())
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return "invalida", ""
        # No credenciales, query ni fragmento en el informe.
        host = parsed.hostname.lower()
        return host, host + parsed.path[:240]
    except ValueError:
        return "invalida", ""


def summarize(products, runs, snapshots):
    run_map = {row["id"]: dict(row) for row in runs}
    counts = Counter()
    groups = {}
    anomalies = Counter()
    samples = {}
    for row in products:
        run_id = row["run_id"]
        counts[run_id] += 1
        source, source_path = url_evidence(row["url_fuente"])
        product, product_path = url_evidence(row["url_producto"])
        key = (run_id, row["sitio_fuente"], source, product)
        group = groups.setdefault(key, {"run_id": run_id, "tienda": row["sitio_fuente"],
            "origen_fuente": source, "origen_producto": product, "productos": 0,
            "ejemplos": [], "id_min": row["id"], "id_max": row["id"]})
        group["productos"] += 1
        group["id_min"] = min(group["id_min"], row["id"])
        group["id_max"] = max(group["id_max"], row["id"])
        example = [source_path, product_path]
        if example not in group["ejemplos"] and len(group["ejemplos"]) < 3:
            group["ejemplos"].append(example)
        issues = []
        if run_id is None:
            issues.append("productos_sin_run")
        elif run_id not in run_map:
            issues.append("productos_run_huerfano")
        elif row["run_uuid"] is not None and str(row["run_uuid"]) != str(run_map[run_id]["run_uuid"]):
            issues.append("productos_uuid_discordante")
        if row["run_uuid"] is None:
            issues.append("productos_sin_run_uuid")
        for issue in issues:
            anomalies[issue] += 1
            sample = samples.setdefault(issue, [])
            if len(sample) < 20:
                sample.append(row["id"])
    for run in run_map.values():
        run["productos_observados"] = counts[run["id"]]
    publications = [dict(row, run_existe=row["run_id"] in run_map,
                         productos_en_run=counts[row["run_id"]]) for row in snapshots]
    return {"status": "evidencia_pendiente_de_revision", "pais_asignado": False,
        "productos_total": sum(counts.values()), "anomalias": dict(anomalies),
        "ejemplos_ids_anomalos": samples, "grupos_origen": list(groups.values()),
        "ejecuciones": list(run_map.values()), "publicaciones": publications,
        "advertencia": "Dominios y ejemplos no prueban país; revisar rutas regionales y ejecuciones mixtas."}


def audit(connection):
    connection.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"))
    revision = list(connection.execute(text("SELECT version_num FROM catalogo.alembic_version")).scalars())
    if revision != ["037_countries"]:
        raise ValueError("Se requiere revisión 037_countries; no ejecutar baseline")
    captured = connection.execute(text("SELECT CURRENT_TIMESTAMP")).scalar_one()
    runs = connection.execute(text("SELECT id, run_uuid, source_process, started_at, total_products "
                                   "FROM catalogo.scraping_runs ORDER BY id")).mappings().all()
    snapshots = connection.execute(text("SELECT * FROM catalogo.catalog_display_snapshots ORDER BY store_key")).mappings().all()
    with connection.execute(text("SELECT id, run_id, run_uuid, sitio_fuente, url_fuente, url_producto "
                                 "FROM catalogo.productos_catalogo ORDER BY id").execution_options(yield_per=2000)) as result:
        report = summarize(result.mappings(), runs, snapshots)
    report.update(revision=revision[0], captured_at=captured)
    return report


def main():
    engine = None
    try:
        if schema_name() != "catalogo":
            raise ValueError("Sólo catalogo está auditado")
        engine = readonly_engine()
        with engine.connect() as connection:
            report = audit(connection)
        print(json.dumps(report, ensure_ascii=False, indent=2, default=str))
        return 0
    except Exception as error:
        state = getattr(getattr(error, "orig", error), "sqlstate", None)
        state = state if isinstance(state, str) and re.fullmatch(r"[A-Z0-9]{5}", state) else None
        print(json.dumps({"status": "error", "sqlstate": state,
            "message": "Auditoría incompleta. Revisar revisión 037, esquema y acceso readonly; no se asignaron países."}))
        return 2
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
