"""Plan integral readonly compacto; no contiene opción de aplicación."""
import argparse
import hashlib
import json
import re
from collections import Counter, defaultdict
from urllib.parse import urlsplit, urlunsplit
from sqlalchemy import text
from .connection import readonly_engine, schema_name
from .regional_classification import RULE_VERSION, classify_product, normalize


def diagnostic_url(value):
    if not value:
        return None
    try:
        url = urlsplit(value)
        if url.scheme not in ('https', 'http') or not url.hostname:
            return '[URL inválida]'
        # No publicar credenciales, query o fragmentos en muestras compartibles.
        host = url.hostname
        if ':' in host:
            host = '[' + host + ']'
        if url.port:
            host += ':' + str(url.port)
        return urlunsplit((url.scheme, host, url.path, '', ''))
    except ValueError:
        return '[URL inválida]'


def diagnostic_sample(row):
    return {key: row.get(key) for key in ('id', 'run_id', 'producto', 'precio_regular', 'precio_oferta')} | {
        'url_fuente': diagnostic_url(row.get('url_fuente')),
        'url_producto': diagnostic_url(row.get('url_producto'))}


def add_sample(samples, sample, limit=3):
    # Entrada ordenada por id: conservar el primero y los últimos dos casos distintos.
    fields = ('producto', 'precio_regular', 'precio_oferta', 'url_fuente', 'url_producto')
    key = tuple(sample.get(field) for field in fields)
    if any(tuple(existing.get(field) for field in fields) == key for existing in samples):
        return
    samples.append(sample)
    if len(samples) > limit:
        samples.pop(1)


def build_plan(products, runs, snapshots, include_details=False):
    runs = [dict(row) for row in runs]
    snapshots = [dict(row) for row in snapshots]
    run_map = {row['id']: row for row in runs}
    published = {(row['run_id'], normalize(row['store_key'])) for row in snapshots}
    details = {}
    run_counts = Counter()
    states, countries, reasons = Counter(), Counter(), Counter()
    examples = defaultdict(list)
    run_countries = defaultdict(set)
    store_runs = defaultdict(lambda: {'countries': set(), 'pending': 0, 'non_product': 0})
    stores = defaultdict(Counter)
    anomalies = Counter()
    digest = hashlib.sha256(('plan-v2:' + RULE_VERSION).encode())
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
        if include_details and result.status == 'revision':
            group = details.setdefault((store, result.reason), {
                'tienda': store, 'motivo': result.reason, 'total': 0, 'publicados': 0,
                'muestras_publicadas': [], 'muestras_historicas': []})
            group['total'] += 1
            current = (run_id, normalize(store)) in published
            group['publicados'] += int(current)
            add_sample(group['muestras_publicadas' if current else 'muestras_historicas'],
                       diagnostic_sample(row))
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
    report = {'status': 'plan_readonly', 'formato_plan': 2, 'reglas': RULE_VERSION, 'huella_datos': digest.hexdigest(),
        'productos_total': sum(states.values()), 'estados': dict(states), 'paises': dict(countries),
        'motivos': dict(reasons), 'ejemplos_ids': dict(examples), 'anomalias': dict(anomalies),
        'tiendas': dict(stores), 'ejecuciones_total': len(runs),
        'ejecuciones_mixtas': [{'run_id': run_id, 'paises': sorted(values)}
            for run_id, values in sorted(run_countries.items()) if len(values) > 1],
        'publicaciones': publication_plan,
        'aplicable': False,
        'nota': 'Plan no ejecutable. Pendientes y enlaces no se borran; falta transición de lectores y workers.'}
    if include_details:
        report['detalle_pendientes'] = sorted(details.values(),
            key=lambda group: (-group['publicados'], group['tienda'], group['motivo']))
        report['criterio_muestras'] = ('Hasta 3 casos distintos históricos y 3 publicados por tienda/motivo; '
            'primero y últimos dos por ID. Los conteos incluyen todos los pendientes; '
            'URLs sin credenciales, query ni fragmento. Las muestras no sustituyen revisión de cada fila.')
    return report


def run(connection, include_details=False):
    connection.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'))
    revision = list(connection.execute(text('SELECT version_num FROM catalogo.alembic_version')).scalars())
    if revision != ['037_countries']:
        raise ValueError('Revisión no compatible')
    captured = connection.execute(text('SELECT CURRENT_TIMESTAMP')).scalar_one()
    runs = connection.execute(text('SELECT id, run_uuid, total_products FROM catalogo.scraping_runs ORDER BY id')).mappings().all()
    snapshots = connection.execute(text('SELECT * FROM catalogo.catalog_display_snapshots ORDER BY store_key')).mappings().all()
    with connection.execute(text('SELECT id, run_id, run_uuid, sitio_fuente, producto, url_fuente, url_producto, '
                                 'precio_regular, precio_oferta FROM catalogo.productos_catalogo ORDER BY id')
                            .execution_options(yield_per=2000)) as cursor:
        report = build_plan(cursor.mappings(), runs, snapshots, include_details)
    report.update(captured_at=str(captured), revision=revision[0])
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--details', action='store_true', help='Muestras de pendientes por tienda y motivo')
    args = parser.parse_args(argv)
    engine = None
    try:
        if schema_name() != 'catalogo':
            raise ValueError('Sólo catalogo está auditado')
        engine = readonly_engine()
        with engine.connect() as connection:
            report = run(connection, args.details)
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
