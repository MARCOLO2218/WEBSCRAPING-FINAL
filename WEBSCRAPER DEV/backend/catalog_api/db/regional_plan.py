"""Plan integral readonly compacto; no contiene opción de aplicación."""
import hashlib
import json
import re
from collections import Counter, defaultdict
from sqlalchemy import text
from .connection import readonly_engine, schema_name
from .regional_classification import RULE_VERSION, classify_product, normalize


def build_plan(products, runs, snapshots):
    runs = [dict(row) for row in runs]
    snapshots = [dict(row) for row in snapshots]
    run_map = {row['id']: row for row in runs}
    run_counts = Counter()
    states, countries, reasons = Counter(), Counter(), Counter()
    examples = defaultdict(list)
    run_countries = defaultdict(set)
    store_runs = defaultdict(lambda: {'countries': set(), 'pending': 0, 'non_product': 0})
    stores = defaultdict(Counter)
    anomalies = Counter()
    digest = hashlib.sha256(RULE_VERSION.encode())
    for row in products:
        row = dict(row)
        digest.update(json.dumps(row, sort_keys=True, default=str, ensure_ascii=False).encode())
        digest.update(b'\n')
        result = classify_product(row)
        run_id = row['run_id']
        run_counts[run_id] += 1
        if run_id not in run_map:
            anomalies['run_ausente'] += 1
        elif str(row.get('run_uuid')) != str(run_map[run_id]['run_uuid']):
            anomalies['run_uuid_discordante'] += 1
        states[result.status] += 1
        reasons[result.reason] += 1
        store = row.get('sitio_fuente') or '(sin tienda)'
        stores[store][result.country or result.status] += 1
        if len(examples[result.reason]) < 5:
            examples[result.reason].append(row['id'])
        publication = store_runs[(run_id, normalize(store))]
        if result.country:
            countries[result.country] += 1
            run_countries[run_id].add(result.country)
            publication['countries'].add(result.country)
        elif result.status == 'revision':
            publication['pending'] += 1
        else:
            publication['non_product'] += 1
    for row in runs:
        if run_counts[row['id']] != row['total_products']:
            anomalies['total_run_discordante'] += 1
    publication_plan = []
    for row in snapshots:
        state = store_runs.get((row['run_id'], normalize(row['store_key'])))
        publication_plan.append({'store_key': row['store_key'], 'run_id': row['run_id'],
            'paises_detectados': sorted(state['countries']) if state else [],
            'pendientes': state['pending'] if state else None,
            'no_productos': state['non_product'] if state else None,
            'requiere_revision': not state or state['pending'] > 0 or len(state['countries']) != 1})
    for collection in (runs, snapshots):
        digest.update(json.dumps(collection, sort_keys=True, default=str, ensure_ascii=False).encode())
    return {'status': 'plan_readonly', 'reglas': RULE_VERSION, 'huella_datos': digest.hexdigest(),
        'productos_total': sum(states.values()), 'estados': dict(states), 'paises': dict(countries),
        'motivos': dict(reasons), 'ejemplos_ids': dict(examples), 'anomalias': dict(anomalies),
        'tiendas': dict(stores), 'ejecuciones_total': len(runs),
        'ejecuciones_mixtas': [{'run_id': run_id, 'paises': sorted(values)}
            for run_id, values in sorted(run_countries.items()) if len(values) > 1],
        'publicaciones': publication_plan,
        'aplicable': False,
        'nota': 'Plan no ejecutable. Pendientes y enlaces no se borran; falta transición de lectores y workers.'}


def run(connection):
    connection.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'))
    revision = list(connection.execute(text('SELECT version_num FROM catalogo.alembic_version')).scalars())
    if revision != ['037_countries']:
        raise ValueError('Revisión no compatible')
    captured = connection.execute(text('SELECT CURRENT_TIMESTAMP')).scalar_one()
    runs = connection.execute(text('SELECT id, run_uuid, total_products FROM catalogo.scraping_runs ORDER BY id')).mappings().all()
    snapshots = connection.execute(text('SELECT * FROM catalogo.catalog_display_snapshots ORDER BY store_key')).mappings().all()
    with connection.execute(text('SELECT id, run_id, run_uuid, sitio_fuente, url_fuente, url_producto, '
                                 'precio_regular, precio_oferta FROM catalogo.productos_catalogo ORDER BY id')
                            .execution_options(yield_per=2000)) as cursor:
        report = build_plan(cursor.mappings(), runs, snapshots)
    report.update(captured_at=str(captured), revision=revision[0])
    return report


def main():
    engine = None
    try:
        if schema_name() != 'catalogo':
            raise ValueError('Sólo catalogo está auditado')
        engine = readonly_engine()
        with engine.connect() as connection:
            report = run(connection)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except Exception as error:
        state = getattr(getattr(error, 'orig', error), 'sqlstate', None)
        state = state if isinstance(state, str) and re.fullmatch(r'[A-Z0-9]{5}', state) else None
        print(json.dumps({'status': 'error', 'sqlstate': state,
                          'message': 'Plan incompleto; revisar conexión DEV, revisión 037 y tablas. Sin escrituras.'}))
        return 2
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())
