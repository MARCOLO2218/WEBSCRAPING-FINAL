"""Contratos de lectura; conservan el formato JSON del catalogo Node."""
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ProductResponse(BaseModel):
    # SELECT p.* puede incluir columnas adicionales durante la migracion.
    model_config = ConfigDict(extra="allow", strict=True)

    id: str
    run_id: str | None
    semana_run: int | None
    semana_inicio: str | None
    sitio_fuente: str | None
    marca: str | None
    linea: str | None
    categoria: str | None
    producto: str | None
    disponibilidad: str | None
    precio_regular: str | None
    precio_oferta: str | None
    precio_regular_min: float | None = None
    precio_regular_max: float | None = None
    precio_oferta_min: float | None = None
    precio_oferta_max: float | None = None
    descuento: str | None
    cuotas: str | None
    url_producto: str | None
    url_fuente: str | None
    titulo: str | None
    descripcion: str | None
    garantia: str | None
    beneficios: str | None
    url_imagen: str | None
    texto_imagen: str | None
    fecha_scraping: str | None
    creado_en: str | None
    registro_uuid: str | None
    run_uuid: str | None
    precio_numero: float | None
    diferencia_facenco: float | None
    etiqueta_diferencia: Literal["Mas barato", "Mas caro", "Igual a FACENCO", "Sin referencia"]


class LatestRunResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    run_id: str
    semana_run: int | None
    semana_inicio: str | None
    started_at: str | None
    total_products: int | None


class SummaryResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    total: int
    precio_promedio: float | None
    mas_baratos: int
    mas_caros: int
    tiendas: int


class ErrorResponse(BaseModel):
    error: str
