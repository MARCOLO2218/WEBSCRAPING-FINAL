"""Esquema candidato aislado; NO se importa en Alembic ni modifica metadata histórica."""
from sqlalchemy import (MetaData, Table, Column, Text, BigInteger, ForeignKey,
                        ForeignKeyConstraint, CheckConstraint, Index)
from sqlalchemy.orm import registry

regional_metadata = MetaData(schema='catalogo')
regional_registry = registry(metadata=regional_metadata)
# Contratos mínimos para probar restricciones; no son instaladores del esquema real.
Table('paises', regional_metadata, Column('codigo', Text, primary_key=True))
Table('scraping_runs', regional_metadata, Column('id', BigInteger, primary_key=True))
run_countries = Table('scraping_run_paises', regional_metadata,
    Column('run_id', BigInteger, ForeignKey('catalogo.scraping_runs.id'), primary_key=True),
    Column('pais_codigo', Text, ForeignKey('catalogo.paises.codigo'), primary_key=True))
regional_products = Table('productos_catalogo', regional_metadata,
    Column('id', BigInteger, primary_key=True),
    Column('run_id', BigInteger, ForeignKey('catalogo.scraping_runs.id')),
    Column('pais_codigo', Text, ForeignKey('catalogo.paises.codigo')),
    Column('origen_estado', Text, nullable=False),
    Column('origen_motivo', Text, nullable=False),
    CheckConstraint("(origen_estado = 'asignado' AND pais_codigo IS NOT NULL) OR "
                    "(origen_estado IN ('revision','no_producto') AND pais_codigo IS NULL)",
                    name='ck_producto_origen_pais'),
    ForeignKeyConstraint(['run_id', 'pais_codigo'],
        ['catalogo.scraping_run_paises.run_id', 'catalogo.scraping_run_paises.pais_codigo'],
        name='fk_producto_run_pais'))
regional_snapshots = Table('catalog_display_snapshots', regional_metadata,
    Column('pais_codigo', Text, ForeignKey('catalogo.paises.codigo'), primary_key=True),
    Column('store_key', Text, primary_key=True),
    Column('run_id', BigInteger, nullable=False),
    ForeignKeyConstraint(['run_id', 'pais_codigo'],
        ['catalogo.scraping_run_paises.run_id', 'catalogo.scraping_run_paises.pais_codigo'],
        name='fk_publicacion_run_pais'))
Index('ix_producto_pais_run', regional_products.c.pais_codigo, regional_products.c.run_id)


@regional_registry.mapped
class RunCountry:
    __table__ = run_countries
