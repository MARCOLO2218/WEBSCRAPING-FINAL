"""Punto de partida del esquema existente auditado en Ubuntu DEV.

Se adopta mediante baseline --apply. No es un instalador de base vacía.
"""
revision = "036_existing"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    raise RuntimeError("Adoptar con python -m catalog_api.db.baseline --apply")

def downgrade():
    raise RuntimeError("No se elimina el esquema histórico mediante downgrade")
