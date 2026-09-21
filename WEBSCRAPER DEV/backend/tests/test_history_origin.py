from catalog_api.db.history_origin import summarize, url_evidence, audit
import pytest


def test_urls_preserve_regional_path_without_secrets():
    assert url_evidence('https://user:secret@EXAMPLE.com/hn/camas?token=secret#private') == (
        'example.com', 'example.com/hn/camas')
    for value in (None, '', ' '):
        assert url_evidence(value) == ('ausente', '')
    for value in ('not a url', 'https://[bad', 'file:///tmp/data'):
        assert url_evidence(value) == ('invalida', '')


def test_history_keeps_mixed_evidence_orphans_and_empty_runs():
    runs = [dict(id=i, run_uuid=f'uuid-{i}', source_process='worker') for i in (1, 2)]
    products = [dict(id=i, run_id=run, run_uuid=uuid, sitio_fuente='Tienda',
                     url_fuente=url, url_producto=None) for i, run, uuid, url in (
        (1, 1, 'uuid-1', 'https://gt.example.com/camas'),
        (2, 1, 'different', 'https://hn.example.com/camas'),
        (3, None, None, None), (4, 99, None, 'invalid'))]
    report = summarize(iter(products), runs, [dict(store_key='tienda', run_id=99)])
    assert report['pais_asignado'] is False
    assert report['productos_total'] == 4
    assert len(report['grupos_origen']) == 4
    assert report['anomalias'] == dict(productos_uuid_discordante=1,
        productos_sin_run=1, productos_sin_run_uuid=2, productos_run_huerfano=1)
    assert report['ejecuciones'][1]['productos_observados'] == 0
    assert report['publicaciones'][0]['run_existe'] is False
    assert 'productos_observados' not in runs[0]


def test_audit_establishes_readonly_snapshot_before_reading_and_rejects_revision():
    class Result:
        def scalars(self):
            return ['036_existing']
    class Connection:
        def __init__(self):
            self.calls = []
        def execute(self, statement):
            self.calls.append(str(statement))
            return Result()
    connection = Connection()
    with pytest.raises(ValueError, match='037_countries'):
        audit(connection)
    assert connection.calls == [
        'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
        'SELECT version_num FROM catalogo.alembic_version']


def test_routes_count_country_path_even_after_first_three_samples():
    rows = [dict(id=i, run_id=1, run_uuid='u', sitio_fuente='Sleep Gallery Guatemala',
        url_fuente='https://paises.sleepgalleryca.com/',
        url_producto=f'https://sleepgalleryca.com/{country}/producto/{i}',
        producto='Cama', precio_regular='Q100', precio_oferta=None)
        for i, country in enumerate(['gt', 'gt', 'gt', 'sv'], 1)]
    report = summarize(rows, [dict(id=1, run_uuid='u')], [])
    assert len(report['grupos_origen']) == 1
    assert [(r['primer_segmento_producto'], r['productos'])
            for r in report['rutas_completas_agrupadas']] == [('gt', 3), ('sv', 1)]
    assert [r['id'] for r in report['portal_sleepgallery_sin_ruta_gt']] == [4]
    assert report['pais_asignado'] is False
