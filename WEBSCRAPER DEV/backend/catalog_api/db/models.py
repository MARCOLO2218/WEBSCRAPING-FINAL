"""Modelo candidato basado en el DDL Node; contrastar con Ubuntu antes de migrar."""

from sqlalchemy import (BigInteger, Column, Date, DateTime, ForeignKey, Integer,
                        MetaData, Numeric, Table, Text, Uuid, func, Index)
from sqlalchemy.orm import registry

metadata = MetaData(schema="catalogo")
mapper_registry = registry(metadata=metadata)

runs = Table("scraping_runs", metadata,
    Column("id", BigInteger, primary_key=True),
    Column("run_uuid", Uuid, nullable=False, server_default=func.gen_random_uuid()), Column("semana_run", Integer),
    Column("semana_inicio", Date), Column("started_at", DateTime, server_default=func.now()),
    Column("source_process", Text), Column("total_products", Integer))

products = Table("productos_catalogo", metadata,
    Column("id", BigInteger, primary_key=True),
    Column("run_id", BigInteger, ForeignKey("catalogo.scraping_runs.id")),
    Column("run_uuid", Uuid), Column("registro_uuid", Uuid, nullable=False, server_default=func.gen_random_uuid()),
    Column("semana_run", Integer), Column("semana_inicio", Date),
    *(Column(name, Text) for name in (
        "sitio_fuente", "marca", "linea", "categoria", "producto", "disponibilidad",
        "precio_regular", "precio_oferta", "descuento", "cuotas", "url_producto",
        "url_fuente", "titulo", "descripcion", "garantia", "beneficios", "url_imagen", "texto_imagen")),
    Column("fecha_scraping", DateTime), Column("creado_en", DateTime, server_default=func.now()),
    *(Column(name, Numeric(12, 2)) for name in (
        "precio_regular_min", "precio_regular_max", "precio_oferta_min", "precio_oferta_max")))

snapshots = Table("catalog_display_snapshots", metadata,
    Column("store_key", Text, primary_key=True),
    Column("run_id", BigInteger, nullable=False),
    Column("product_count", Integer, nullable=False),
    Column("locked_at", DateTime(timezone=True), nullable=False, server_default=func.now()),
    Column("lock_until", DateTime(timezone=True), nullable=False),
    Column("updated_at", DateTime(timezone=True), nullable=False, server_default=func.now()))

Index("ux_scraping_runs_run_uuid", runs.c.run_uuid, unique=True)
Index("ix_scraping_runs_semana_inicio", runs.c.semana_inicio)
Index("ux_productos_catalogo_registro_uuid", products.c.registro_uuid, unique=True)
Index("ix_productos_catalogo_fecha_id", products.c.fecha_scraping.desc(), products.c.id.desc())
Index("ix_productos_catalogo_producto", products.c.producto)

@mapper_registry.mapped
class ScrapingRun:
    __table__ = runs

@mapper_registry.mapped
class Product:
    __table__ = products

@mapper_registry.mapped
class DisplaySnapshot:
    __table__ = snapshots
