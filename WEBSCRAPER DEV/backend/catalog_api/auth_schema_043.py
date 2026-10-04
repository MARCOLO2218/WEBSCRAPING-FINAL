"""Snapshot inmutable del esquema introducido por Alembic 043_auth."""

from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, ForeignKey, Index, MetaData,
    String, Table, Text, UniqueConstraint,
)

from .db.country_models import countries

metadata = MetaData(schema="catalogo")
countries.to_metadata(metadata)

users_043 = Table(
    "usuarios", metadata,
    Column("id", String(36), primary_key=True),
    Column("username", String(128), nullable=False),
    Column("password_hash", Text, nullable=False),
    Column("enabled", Boolean, nullable=False, default=True),
    Column("global_admin", Boolean, nullable=False, default=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    UniqueConstraint("username", name="uq_usuarios_username"),
)
user_country_roles_043 = Table(
    "usuario_paises", metadata,
    Column("user_id", String(36), ForeignKey("catalogo.usuarios.id", ondelete="CASCADE"),
           primary_key=True),
    Column("country_code", Text, ForeignKey("catalogo.paises.codigo", ondelete="RESTRICT"),
           primary_key=True),
    Column("role", String(32), nullable=False),
    CheckConstraint("role IN ('lector','operador')", name="ck_usuario_pais_role"),
)
sessions_043 = Table(
    "sesiones_app", metadata,
    Column("id", String(36), primary_key=True),
    Column("user_id", String(36), ForeignKey("catalogo.usuarios.id", ondelete="CASCADE"),
           nullable=False),
    Column("token_hash", String(64), nullable=False),
    Column("csrf_hash", String(64), nullable=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("revoked_at", DateTime(timezone=True)),
    UniqueConstraint("token_hash", name="uq_sesiones_app_token_hash"),
)
Index("ix_sesiones_app_user_expiry", sessions_043.c.user_id, sessions_043.c.expires_at)

tables_043 = (users_043, user_country_roles_043, sessions_043)
