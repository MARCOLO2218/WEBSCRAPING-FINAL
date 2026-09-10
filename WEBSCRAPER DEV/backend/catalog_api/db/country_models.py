"""Catálogo regional; separado de los modelos históricos auditados."""
from sqlalchemy import Boolean, CheckConstraint, Column, Integer, MetaData, Table, Text, UniqueConstraint
from sqlalchemy.orm import registry

country_metadata = MetaData(schema="catalogo")
country_registry = registry(metadata=country_metadata)
countries = Table("paises", country_metadata,
    Column("id", Integer, primary_key=True),
    Column("codigo", Text, nullable=False),
    Column("nombre", Text, nullable=False),
    Column("moneda", Text, nullable=False),
    Column("habilitado", Boolean, nullable=False),
    UniqueConstraint("codigo", name="uq_paises_codigo"),
    CheckConstraint("length(codigo) = 2 AND codigo = upper(codigo)", name="ck_paises_codigo"),
    CheckConstraint("length(moneda) = 3 AND moneda = upper(moneda)", name="ck_paises_moneda"),
    CheckConstraint("length(trim(nombre)) > 0", name="ck_paises_nombre"))

@country_registry.mapped
class Country:
    __table__ = countries
