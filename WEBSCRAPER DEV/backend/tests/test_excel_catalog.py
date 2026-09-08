from openpyxl import Workbook
from catalog_api.catalog import excel_rows, merge, compare


def test_excel_price_merge_keeps_identity_and_reference(tmp_path):
    path = tmp_path / "prices.xlsx"
    book = Workbook()
    sheet = book.active
    sheet.title = "Precios FACENCO"
    for column, value in enumerate(["producto", "precio_regular", "precio_oferta", "activo", "codigo_producto"], 1):
        sheet.cell(4, column, value)
    for column, value in enumerate(["Colchón", 3000, 2500, "SI", "C1"], 1):
        sheet.cell(5, column, value)
    sheet.cell(6, 1, "Inactivo")
    sheet.cell(6, 4, "NO")
    book.save(path)
    source = [{"id": "11", "run_id": "20", "producto": "COLCHON", "sitio_fuente": "FACENCO"}]
    loaded = excel_rows(source, path)
    assert len(loaded) == 1
    assert loaded[0]["precio_oferta"] == "Q2,500"
    result = compare(merge(source, loaded))
    assert len(result) == 1
    assert result[0]["id"] == "11"
    assert result[0]["precio_numero"] == 2500
    assert result[0]["etiqueta_diferencia"] == "Igual a FACENCO"
