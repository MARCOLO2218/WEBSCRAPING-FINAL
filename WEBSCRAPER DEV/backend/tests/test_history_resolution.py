import pytest
from catalog_api.db.history_resolution import plan_resolution


def report():
    return dict(revision='037_countries', rutas_completas_agrupadas=[], anomalias={},
        captured_at='fixture', productos_total=4,
        ejecuciones=[dict(id=2, productos_observados=4)],
        portal_sleepgallery_sin_ruta_gt=[dict(id=i, run_id=2,
            ruta_fuente='paises.sleepgalleryca.com/', ruta_producto=url,
            precio_regular=price, precio_oferta=None) for i, url, price in (
            (1, 'sleepgalleryca.com/sv/producto/cama/', '$100'),
            (2, 'sleepgalleryca.com/sv/', None),
            (3, 'sleepgalleryca.com/sv/producto/otra/', 'Q100'),
            (4, 'www.instagram.com/sleepgallerysv', '$100'))])


def test_plan_requires_concordant_product_evidence_and_keeps_pending():
    result = plan_resolution(report())
    assert [r['id'] for r in result['candidatos_sv']] == [1]
    assert result['portal_pendiente_ids'] == [2, 3, 4]
    assert result['ejecuciones_con_sv'] == [dict(run_id=2, candidatos_sv=1, productos_observados=4)]
    assert result['status'] == 'plan_parcial_no_aplicable'


def test_plan_rejects_incomplete_audit_and_duplicate_ids():
    value = report()
    del value['rutas_completas_agrupadas']
    with pytest.raises(ValueError):
        plan_resolution(value)
    value = report()
    value['portal_sleepgallery_sin_ruta_gt'].append(value['portal_sleepgallery_sin_ruta_gt'][0])
    with pytest.raises(ValueError, match='repetido'):
        plan_resolution(value)
