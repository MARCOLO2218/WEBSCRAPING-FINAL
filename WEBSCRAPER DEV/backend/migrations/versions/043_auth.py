"""Cuentas, asignaciones explícitas y sesiones revocables (sin datos seed)."""

from alembic import op
from catalog_api.auth_models import tables

revision = "043_auth"
down_revision = "042_regional"
branch_labels = None
depends_on = None


def upgrade():
    if not op.get_context().config.attributes.get("auth_schema_migration"):
        raise RuntimeError("La revisión 043 requiere el flujo autorizado de esquema de autenticación")
    for table in tables():
        table.create(op.get_bind(), checkfirst=False)


def downgrade():
    if not op.get_context().config.attributes.get("auth_schema_rollback"):
        raise RuntimeError("Revertir 043 elimina cuentas, asignaciones y sesiones; requiere autorización explícita")
    for table in reversed(tables()):
        table.drop(op.get_bind(), checkfirst=False)
