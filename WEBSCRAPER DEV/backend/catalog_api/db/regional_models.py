"""Modelos ORM de la expansión; no activan lectores ni escrituras del catálogo."""
from sqlalchemy.orm import registry
from .regional_expansion_v1 import tables

regional_tables = {table.name: table for table in tables()}
regional_registry = registry(metadata=regional_tables['regional_lotes'].metadata)


@regional_registry.mapped
class RegionalBatch:
    __table__ = regional_tables['regional_lotes']


@regional_registry.mapped
class RunCountry:
    __table__ = regional_tables['scraping_run_paises']


@regional_registry.mapped
class StoreCountry:
    __table__ = regional_tables['tiendas_paises']


@regional_registry.mapped
class ProductCountry:
    __table__ = regional_tables['productos_paises']


@regional_registry.mapped
class PublicationCountry:
    __table__ = regional_tables['publicaciones_paises']
