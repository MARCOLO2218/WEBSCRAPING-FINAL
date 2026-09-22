"""DDL congelado de 042_regional. No reutilizar para cambios futuros."""
from sqlalchemy import (MetaData, Table, Column, Text, BigInteger, Integer,
                        ForeignKey, ForeignKeyConstraint, CheckConstraint, UniqueConstraint, Index)


def tables(schema='catalogo'):
    m = MetaData(schema=schema)
    Table('paises', m, Column('codigo', Text, primary_key=True))
    Table('scraping_runs', m, Column('id', BigInteger, primary_key=True))
    Table('productos_catalogo', m, Column('id', BigInteger, primary_key=True))
    fk = lambda name: f'{schema}.{name}'
    batch = Table('regional_lotes', m,
        Column('id', Integer, primary_key=True, autoincrement=False),
        Column('plan_hash', Text, nullable=False),
        Column('source_hash', Text, nullable=False),
        Column('rules', Text, nullable=False),
        CheckConstraint('id = 1', name='ck_regional_lote_unico'))
    runs = Table('scraping_run_paises', m,
        Column('run_id', BigInteger, ForeignKey(fk('scraping_runs.id')), primary_key=True),
        Column('pais_codigo', Text, ForeignKey(fk('paises.codigo')), primary_key=True))
    stores = Table('tiendas_paises', m,
        Column('pais_codigo', Text, ForeignKey(fk('paises.codigo')), primary_key=True),
        Column('store_key', Text, primary_key=True))
    products = Table('productos_paises', m,
        Column('producto_id', BigInteger, ForeignKey(fk('productos_catalogo.id')), primary_key=True),
        Column('run_id', BigInteger, ForeignKey(fk('scraping_runs.id'))),
        Column('pais_codigo', Text, ForeignKey(fk('paises.codigo'))),
        Column('store_key', Text),
        Column('estado', Text, nullable=False),
        Column('motivo', Text, nullable=False),
        Column('source_hash', Text, nullable=False),
        CheckConstraint("(estado = 'asignado' AND pais_codigo IS NOT NULL AND "
                        "run_id IS NOT NULL AND store_key IS NOT NULL) OR "
                        "(estado IN ('revision','no_producto') AND pais_codigo IS NULL)",
                        name='ck_regional_producto_estado'),
        ForeignKeyConstraint(['run_id', 'pais_codigo'],
            [fk('scraping_run_paises.run_id'), fk('scraping_run_paises.pais_codigo')]),
        ForeignKeyConstraint(['pais_codigo', 'store_key'],
            [fk('tiendas_paises.pais_codigo'), fk('tiendas_paises.store_key')]))
    snapshots = Table('publicaciones_paises', m,
        Column('store_key', Text, primary_key=True),
        Column('run_id', BigInteger, ForeignKey(fk('scraping_runs.id')), nullable=False),
        Column('pais_codigo', Text, ForeignKey(fk('paises.codigo'))),
        Column('estado', Text, nullable=False),
        Column('source_payload', Text, nullable=False),
        Column('candidate_count', Integer, nullable=False),
        UniqueConstraint('pais_codigo', 'store_key', name='uq_publicacion_pais_tienda'),
        CheckConstraint("(estado = 'candidata' AND pais_codigo IS NOT NULL) OR "
                        "(estado = 'revision' AND pais_codigo IS NULL)", name='ck_publicacion_estado'),
        CheckConstraint('candidate_count >= 0', name='ck_publicacion_conteo'),
        ForeignKeyConstraint(['run_id', 'pais_codigo'],
            [fk('scraping_run_paises.run_id'), fk('scraping_run_paises.pais_codigo')]),
        ForeignKeyConstraint(['pais_codigo', 'store_key'],
            [fk('tiendas_paises.pais_codigo'), fk('tiendas_paises.store_key')]))
    Index('ix_regional_producto_pais_run', products.c.pais_codigo, products.c.run_id)
    return [batch, runs, stores, products, snapshots]
