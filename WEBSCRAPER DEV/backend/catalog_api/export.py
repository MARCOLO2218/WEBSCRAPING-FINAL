"""Formato CSV compatible con src/server/catalog-service.ts."""
import math
from decimal import Decimal


CSV_COLUMNS = (
    "id", "run_id", "semana_run", "semana_inicio", "sitio_fuente", "marca",
    "categoria", "producto", "precio_regular", "precio_oferta",
    "precio_regular_min", "precio_regular_max", "precio_oferta_min",
    "precio_oferta_max", "diferencia_facenco", "etiqueta_diferencia",
    "disponibilidad", "fecha_scraping", "registro_uuid", "run_uuid",
)


def cell(value):
    if value is None:
        text = ""
    elif isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("CSV requiere numeros finitos")
        # JS String(number) no agrega .0 y usa decimal entre 1e-6 y 1e21.
        if value == 0:
            text = "0"
        elif 1e-6 <= abs(value) < 1e21:
            text = format(Decimal(str(value)), "f")
            if "." in text:
                text = text.rstrip("0").rstrip(".")
        else:
            mantissa, exponent = repr(value).split("e")
            text = mantissa.removesuffix(".0") + "e" + ("+" if int(exponent) >= 0 else "-") + str(abs(int(exponent)))
    else:
        text = str(value)
    return '"' + text.replace('"', '""') + '"'


def to_csv(rows):
    header = ",".join(cell(column) for column in CSV_COLUMNS)
    body = "\n".join(",".join(cell(row.get(column)) for column in CSV_COLUMNS) for row in rows)
    return "\ufeff" + header + "\n" + body + "\n"
