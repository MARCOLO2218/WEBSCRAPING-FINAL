from typing import Literal

from fastapi import FastAPI, Depends
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from .catalog import CatalogRepository
from .models import ProductResponse, LatestRunResponse, SummaryResponse, ErrorResponse
from .export import to_csv


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["catalog-api"] = "catalog-api"
    environment: Literal["dev"] = "dev"


def create_app(repository=None) -> FastAPI:
    app = FastAPI(title="Catálogo Comercial API DEV", version="0.1.0")
    catalog = repository or CatalogRepository()

    def filters(semana: str = "", tienda: str = "", marca: str = "",
                categoria: str = "", disponibilidad: str = "", q: str = ""):
        return dict(semana=semana, tienda=tienda, marca=marca, categoria=categoria,
                    disponibilidad=disponibilidad, q=q)

    def failed():
        return JSONResponse(status_code=500, content={"error": "No se pudo cargar el catalogo. Revisa conexion PostgreSQL y archivo .env."})

    errors = {500: {"model": ErrorResponse, "description": "Error de lectura o contrato interno"}}

    @app.get("/api/products", tags=["Catálogo"], response_model=list[ProductResponse],
             response_model_exclude_unset=True, responses=errors)
    def products(params: dict = Depends(filters)):
        try:
            return [ProductResponse.model_validate(row) for row in catalog.products(params)]
        except Exception:
            return failed()

    @app.get("/api/latest-run", tags=["Catálogo"], response_model=LatestRunResponse | None,
             responses=errors)
    def latest_run():
        try:
            row = catalog.latest_run()
            return LatestRunResponse.model_validate(row) if row is not None else None
        except Exception:
            return failed()

    @app.get("/api/summary", tags=["Catálogo"], response_model=SummaryResponse, responses=errors)
    def summary(params: dict = Depends(filters)):
        try:
            rows = catalog.products(params)
            prices = [r["precio_numero"] for r in rows if r.get("precio_numero") is not None]
            return SummaryResponse.model_validate({"total": len(rows), "precio_promedio": sum(prices) / len(prices) if prices else None,
                    "mas_baratos": sum(r["etiqueta_diferencia"] == "Mas barato" for r in rows),
                    "mas_caros": sum(r["etiqueta_diferencia"] == "Mas caro" for r in rows),
                    "tiendas": len({r["sitio_fuente"] for r in rows if r.get("sitio_fuente")})})
        except Exception:
            return failed()

    @app.get("/api/export.csv", tags=["Catálogo"], response_class=Response,
             responses={**errors, 200: {
                 "description": "Catalogo CSV UTF-8 con BOM",
                 "content": {"text/csv": {"schema": {"type": "string"}}},
                 "headers": {"Content-Disposition": {"schema": {"type": "string"}}}}})
    def export_csv(params: dict = Depends(filters)):
        try:
            rows = catalog.products(params)
            return Response(to_csv(rows), media_type="text/csv",
                            headers={"Content-Disposition": 'attachment; filename="catalogo_comercial_comparativo.csv"'})
        except Exception:
            return failed()

    @app.get("/health", response_model=HealthResponse, tags=["Salud"])
    def health() -> HealthResponse:
        """Salud del proceso; no verifica PostgreSQL ni sitios externos."""
        return HealthResponse()

    return app


app = create_app()
