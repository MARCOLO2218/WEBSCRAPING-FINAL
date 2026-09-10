"""Consulta piloto aislada; no sustituye aún CatalogRepository."""
from sqlalchemy import select
from .models import ScrapingRun

def latest_run(session):
    return session.scalars(select(ScrapingRun).order_by(ScrapingRun.id.desc()).limit(1)).first()
