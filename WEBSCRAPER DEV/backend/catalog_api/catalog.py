"""Lecturas PostgreSQL y complemento FACENCO compatibles con Node."""
import math
import os
import re
import unicodedata
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from openpyxl import load_workbook

DEV_ROOT = Path(__file__).resolve().parents[2]
SQL_DIR = Path(__file__).parent / "sql"


def normalize(value):
    return " ".join("".join(c for c in unicodedata.normalize("NFD", str(value or ""))
                            if unicodedata.category(c) != "Mn").lower().split())


def first_price(*values):
    for value in values:
        if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
            if math.isfinite(float(value)):
                return float(value)
        if isinstance(value, str):
            tokens = re.findall(r"(?:Q|GTQ)?\s*\d[\d,]*(?:\.\d+)?", value, re.I)
            numbers = [float(re.sub(r"[^\d.]", "", token)) for token in tokens]
            if numbers:
                return min(numbers)
    return None


def price(row):
    return first_price(*(row.get(k) for k in (
        "precio_oferta_min", "precio_regular_min", "precio_oferta", "precio_regular")))


def compare(rows):
    reference = {normalize(r.get("producto") or r.get("titulo")): price(r)
                 for r in rows if normalize(r.get("sitio_fuente")) == "facenco" and price(r) is not None}
    result = []
    for row in rows:
        value = price(row)
        baseline = reference.get(normalize(row.get("producto") or row.get("titulo")))
        difference = value - baseline if value is not None and baseline is not None else None
        label = "Sin referencia" if difference is None else (
            "Mas barato" if difference < 0 else "Mas caro" if difference > 0 else "Igual a FACENCO")
        result.append({**row, "precio_numero": value, "diferencia_facenco": difference,
                       "etiqueta_diferencia": label})
    return result


def serialize(row):
    result = {}
    for key, value in row.items():
        if key in ("id", "run_id") and value is not None:
            value = str(value)
        elif isinstance(value, datetime):
            value = value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        elif isinstance(value, date):
            value = value.isoformat()
        elif isinstance(value, Decimal):
            value = float(value)
        result[key] = value
    return result


def excel_rows(template, path):
    if not path.exists():
        return []
    book = load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = book["Precios FACENCO"] if "Precios FACENCO" in book.sheetnames else book.worksheets[0]
        headers = {str(c.value).strip().lower(): i for i, c in enumerate(sheet[4]) if c.value is not None}
        latest = max(template, key=lambda r: int(r.get("run_id") or 0), default={})
        rows = []
        for number, cells in enumerate(sheet.iter_rows(min_row=5, values_only=True), 5):
            def get(key):
                i = headers.get(key)
                value = cells[i] if i is not None and i < len(cells) else None
                return str(value).strip() if value is not None and str(value).strip() else None
            if (get("activo") or "SI").upper() == "NO" or not get("producto"):
                continue
            product, code = get("producto"), get("codigo_producto")
            def money(key):
                text = get(key)
                if text is None:
                    return None
                try:
                    amount = float(re.sub(r"[^\d.\-]", "", text) or "0")
                    return "Q" + f"{amount:,.2f}".rstrip("0").rstrip(".")
                except ValueError:
                    return text
            regular, offer = money("precio_regular"), money("precio_oferta")
            row = {k: None for k in (
                "descuento", "cuotas", "url_producto", "garantia", "beneficios", "url_imagen", "texto_imagen")}
            row.update({k: latest.get(k) for k in (
                "run_id", "semana_run", "semana_inicio", "creado_en", "run_uuid")})
            row.update(id=f"FAC-{code or number}", sitio_fuente="FACENCO", marca=get("marca") or "FACENCO",
                       linea=get("linea"), categoria=get("categoria") or "Colchones", producto=product,
                       disponibilidad=get("disponibilidad") or "Listado en archivo FACENCO",
                       precio_regular=regular, precio_oferta=offer,
                       precio_regular_min=first_price(regular), precio_regular_max=first_price(regular),
                       precio_oferta_min=first_price(offer), precio_oferta_max=first_price(offer),
                       url_fuente="data/precios_facenco.xlsx", titulo=f"{code} - {product}" if code else product,
                       descripcion=get("observaciones"), fecha_scraping=get("fecha_vigencia") or latest.get("fecha_scraping"),
                       registro_uuid=code or f"FACENCO-EXCEL-{number}")
            rows.append(row)
        return rows
    finally:
        book.close()


def merge(rows, extra):
    by_name = {normalize(r.get("producto") or r.get("titulo")): r for r in extra}
    used, result = set(), []
    fields = ("marca", "linea", "categoria", "disponibilidad", "precio_regular", "precio_oferta",
              "precio_regular_min", "precio_regular_max", "precio_oferta_min", "precio_oferta_max",
              "descripcion", "titulo", "registro_uuid")
    for row in rows:
        key = normalize(row.get("producto") or row.get("titulo"))
        update = by_name.get(key) if normalize(row.get("sitio_fuente")) == "facenco" else None
        if update:
            used.add(key)
            row = {**row, **{k: update[k] for k in fields if update.get(k) is not None
                            and (update[k] != "")}}
        result.append(row)
    return result + [r for r in extra if normalize(r.get("producto") or r.get("titulo")) not in used]


def build_filters(params):
    clauses, values = [], []
    for key, column in [("semana", "p.semana_run::text"), ("tienda", "p.sitio_fuente"),
                        ("marca", "p.marca"), ("categoria", "p.categoria"), ("disponibilidad", "p.disponibilidad")]:
        if params.get(key):
            clauses.append(f"{column} = %s")
            values.append(params[key])
    if params.get("q"):
        clauses.append("(p.producto ILIKE %s OR p.marca ILIKE %s OR p.sitio_fuente ILIKE %s)")
        values.extend([f"%{params['q']}%"] * 3)
    return ("WHERE " + " AND ".join(clauses) if clauses else ""), values


class CatalogRepository:
    def __init__(self, connect=None, price_file=None):
        self.connect = connect or self._connect
        self.price_file = price_file or DEV_ROOT / "data" / "precios_facenco.xlsx"

    @staticmethod
    def _connect():
        # Explicit environment; never print credentials or load PROD configuration.
        return psycopg.connect(host=os.environ.get("PGHOST", "localhost"),
            port=int(os.environ.get("PGPORT", "5432")), dbname=os.environ.get("PGDATABASE"),
            user=os.environ.get("PGUSER"), password=os.environ.get("PGPASSWORD"),
            sslmode="require" if os.environ.get("PGSSL", "").lower() == "true" else "disable",
            connect_timeout=10, options="-c statement_timeout=30000", row_factory=dict_row)

    @staticmethod
    def schema():
        schema = os.environ.get("PGSCHEMA", "catalogo")
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", schema):
            raise ValueError("PGSCHEMA inválido")
        return schema

    def products(self, params):
        schema = self.schema()
        where, values = build_filters(params)
        with self.connect() as connection:
            for name in ("snapshots", "seed_snapshots"):
                connection.execute((SQL_DIR / f"{name}.sql").read_text().format(schema=schema))
            query = (SQL_DIR / "products.sql").read_text().format(schema=schema, where=where)
            # psycopg escapes literal percent signs when parameters are supplied.
            query = query.replace("LIKE 'La Colchoner%'", "LIKE 'La Colchoner%%'")
            rows = [serialize(r) for r in connection.execute(query, values).fetchall()]
        return compare(merge(rows, excel_rows(rows, self.price_file)))

    def latest_run(self):
        schema = self.schema()
        with self.connect() as connection:
            row = connection.execute(f"SELECT id AS run_id, semana_run, semana_inicio, started_at, total_products FROM {schema}.scraping_runs ORDER BY id DESC LIMIT 1").fetchone()
        return serialize(row) if row else None
