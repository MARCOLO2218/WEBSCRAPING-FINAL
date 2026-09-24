"""Tablas preparatorias de identidad; Alembic las crea sólo con autorización."""

from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, ForeignKey, Index, MetaData,
    String, Table, Text, UniqueConstraint,
)

from .db.country_models import countries

auth_metadata = MetaData(schema="catalogo")
# Se copia para resolver FKs en metadatos; no forma parte de la migración auth.
countries.to_metadata(auth_metadata)

users = Table(
    "usuarios", auth_metadata,
    Column("id", String(36), primary_key=True),
    Column("username", String(128), nullable=False),
    Column("password_hash", Text, nullable=False),
    Column("enabled", Boolean, nullable=False, default=True),
    Column("global_admin", Boolean, nullable=False, default=False),
    Column("created_at", DateTime(timezone=True), nullable=False),
    UniqueConstraint("username", name="uq_usuarios_username"),
)

user_country_roles = Table(
    "usuario_paises", auth_metadata,
    Column("user_id", String(36), ForeignKey("catalogo.usuarios.id", ondelete="CASCADE"),
           primary_key=True),
    Column("country_code", Text, ForeignKey("catalogo.paises.codigo", ondelete="RESTRICT"),
           primary_key=True),
    Column("role", String(32), nullable=False),
    CheckConstraint("role IN ('lector','operador')", name="ck_usuario_pais_role"),
)

sessions = Table(
    "sesiones_app", auth_metadata,
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
Index("ix_sesiones_app_user_expiry", sessions.c.user_id, sessions.c.expires_at)


def tables() -> tuple[Table, Table, Table]:
    """Tablas nuevas de identidad (no incluye catalogo.paises)."""
    return users, user_country_roles, sessions
