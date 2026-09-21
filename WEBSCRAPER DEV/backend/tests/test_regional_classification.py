import pytest
from catalog_api.db.regional_classification import classify_product
from catalog_api.db.regional_plan import build_plan, diagnostic_url


def product(**changes):
    value = dict(id=1, run_id=2, run_uuid='u', sitio_fuente='Sleep Gallery Guatemala',
        url_fuente='https://paises.sleepgalleryca.com/',
        url_producto='https://sleepgalleryca.com/sv/producto/cama/',
        precio_regular='$500', precio_oferta='$400 - $450')
    return value | changes


def test_sv_uses_real_route_not_guatemala_label():
    result = classify_product(product())
    assert (result.status, result.country) == ('asignado', 'SV')


@pytest.mark.parametrize('changes,reason', [
    ({'precio_regular': 'Q500'}, 'moneda_ausente_o_conflictiva'),
    ({'url_fuente': 'https://sleepgalleryca.com/gt/'}, 'conflicto_pais_fuente_producto'),
    ({'url_producto': 'https://sleepgalleryca.com/cr/producto/cama/'}, 'ruta_regional_no_verificada'),
    ({'url_producto': 'https://sleepgalleryca.com.evil.test/sv/producto/cama/'}, 'origen_no_verificado'),
    ({'url_producto': 'https://sleepgalleryca.com/sv/%2e%2e/gt/cama'}, 'url_ausente_o_invalida'),
    ({'url_producto': None}, 'url_ausente_o_invalida'),
])
def test_ambiguous_or_conflicting_evidence_stays_pending(changes, reason):
    result = classify_product(product(**changes))
    assert (result.status, result.country, result.reason) == ('revision', None, reason)


@pytest.mark.parametrize('url', ['https://www.instagram.com/sleepgallerysv',
    'https://sleepgalleryca.com/nc/', 'https://sleepgalleryca.com/sv/mi-cuenta/edit-account/',
    'https://sleepgalleryca.com/sv/categoria-producto/colchones/',
    'https://sleepgalleryca.com/sv/mi-cuenta-2/'])
def test_navigation_does_not_create_country_products(url):
    result = classify_product(product(url_producto=url))
    assert (result.status, result.country) == ('no_producto', None)


def test_generic_domain_needs_store_and_currency_evidence():
    row = product(sitio_fuente='FACENCO', url_fuente='https://camasfacenco.com/linea-energy/',
                  url_producto='https://camasfacenco.com/energy/', precio_regular='Q500', precio_oferta=None)
    assert classify_product(row).country == 'GT'
    assert classify_product(row | {'precio_regular': None}).status == 'revision'
    assert classify_product(row | {'sitio_fuente': 'Otra tienda'}).status == 'revision'


def test_full_plan_preserves_mixed_run_and_accounts_for_every_row():
    rows = [product(), product(id=2, sitio_fuente='MAX Guatemala',
        url_fuente='https://www.max.com.gt/search?q=cama', url_producto='https://www.max.com.gt/cama',
        precio_regular='Q500', precio_oferta=None),
        product(id=3, url_producto=None)]
    runs = [dict(id=2, run_uuid='u', total_products=3)]
    snapshots = [dict(store_key='Sleep Gallery Guatemala', run_id=2)]
    result = build_plan(rows, runs, snapshots)
    assert result['estados'] == {'asignado': 2, 'revision': 1}
    assert result['productos_total'] == 3
    assert result['ejecuciones_mixtas'] == [dict(run_id=2, paises=['GT', 'SV'])]
    assert result['publicaciones'][0]['requiere_revision'] is True
    assert result['anomalias'] == {}
    assert result['aplicable'] is False
    assert result['huella_datos'] == build_plan(rows, runs, snapshots)['huella_datos']
    assert result['huella_datos'] != build_plan(rows[:-1], runs, snapshots)['huella_datos']


def test_detail_counts_every_row_and_separates_published_from_history():
    rows = [product(id=i, run_id=2 if i <= 6 else 3, producto=f'Cama {i}',
                    precio_regular='Q500') for i in range(1, 11)]
    runs = [dict(id=2, run_uuid='u', total_products=6), dict(id=3, run_uuid='u', total_products=4)]
    snapshots = [dict(store_key='Sleep Gallery Guatemala', run_id=3)]
    plain = build_plan(rows, runs, snapshots)
    report = build_plan(iter(rows), runs, snapshots, True)
    group = report['detalle_pendientes'][0]
    assert group['total'] == 10
    assert group['publicados'] == 4
    assert [r['id'] for r in group['muestras_historicas']] == [1, 5, 6]
    assert [r['id'] for r in group['muestras_publicadas']] == [7, 9, 10]
    assert group['muestras_publicadas'][0]['precio_regular'] == 'Q500'
    assert report['huella_datos'] == plain['huella_datos']
    assert report['estados'] == plain['estados']
    assert 'detalle_pendientes' not in plain


def test_details_deduplicate_samples_without_losing_counts():
    rows = [product(id=i, precio_regular='Q500') for i in range(1, 10)]
    report = build_plan(rows, [dict(id=2, run_uuid='u', total_products=9)], [], True)
    assert report['detalle_pendientes'][0]['total'] == 9
    assert len(report['detalle_pendientes'][0]['muestras_historicas']) == 1


def test_diagnostic_urls_do_not_disclose_auth_or_parameters():
    assert diagnostic_url('https://user:secret@example.com/gt/cama?token=secret#secret') == 'https://example.com/gt/cama'
    assert diagnostic_url('https://[bad') == '[URL inválida]'
    assert diagnostic_url(None) is None
