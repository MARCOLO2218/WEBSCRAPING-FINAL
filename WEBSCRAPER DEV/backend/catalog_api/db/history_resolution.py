"""Plan offline de excepciones verificables de SPEC-038. Sin conexión ni escrituras DB."""
from collections import Counter


def plan_resolution(report):
    if report.get('revision') != '037_countries' or 'rutas_completas_agrupadas' not in report:
        raise ValueError('Se requiere informe detallado de revisión 037_countries')
    if report.get('anomalias'):
        raise ValueError('Resolver anomalías referenciales antes de preparar asignaciones')
    exceptions = report['portal_sleepgallery_sin_ruta_gt']
    seen = set()
    candidates = []
    pending = []
    for row in exceptions:
        if row['id'] in seen:
            raise ValueError('ID repetido en evidencia detallada')
        seen.add(row['id'])
        prices = [str(row.get(key) or '').strip() for key in ('precio_regular', 'precio_oferta')]
        prices = [price for price in prices if price]
        # Evidencia concordante específica; no asignar por etiqueta de tienda o símbolo aislado.
        if (row['ruta_fuente'] == 'paises.sleepgalleryca.com/'
                and row['ruta_producto'].startswith('sleepgalleryca.com/sv/producto/')
                and prices and all(price.startswith('$') for price in prices)):
            candidates.append({'id': row['id'], 'run_id': row['run_id'],
                'pais_propuesto': 'SV', 'moneda_propuesta': 'USD',
                'evidencia': 'Ruta regional de producto y precios USD concordantes'})
        else:
            pending.append(row['id'])
    per_run = Counter(row['run_id'] for row in candidates)
    runs = {row['id']: row for row in report['ejecuciones']}
    for run_id in per_run:
        if run_id not in runs:
            raise ValueError('Candidato con ejecución ausente')
    return {'status': 'plan_parcial_no_aplicable', 'captured_at': report['captured_at'],
        'productos_auditados': report['productos_total'],
        'candidatos_sv': candidates, 'portal_pendiente_ids': pending,
        'ejecuciones_con_sv': [dict(run_id=run_id, candidatos_sv=count,
            productos_observados=runs[run_id]['productos_observados'])
            for run_id, count in sorted(per_run.items())],
        'advertencia': 'No cubre el resto del historial. Revalidar filas en PostgreSQL antes de migrar; no habilita SV.'}
