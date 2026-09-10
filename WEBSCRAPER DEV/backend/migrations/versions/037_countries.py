"""Catálogo extensible de países, sin alterar productos históricos."""
from alembic import op
import sqlalchemy as sa

revision = "037_countries"
down_revision = "036_existing"
branch_labels = None
depends_on = None

def upgrade():
    # La definición se congela aquí; no importar modelos mutables.
    schema = op.get_context().opts["version_table_schema"]
    table = op.create_table("paises",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("codigo", sa.Text, nullable=False),
        sa.Column("nombre", sa.Text, nullable=False),
        sa.Column("moneda", sa.Text, nullable=False),
        sa.Column("habilitado", sa.Boolean, nullable=False),
        sa.UniqueConstraint("codigo", name="uq_paises_codigo"),
        sa.CheckConstraint("length(codigo) = 2 AND codigo = upper(codigo)", name="ck_paises_codigo"),
        sa.CheckConstraint("length(moneda) = 3 AND moneda = upper(moneda)", name="ck_paises_moneda"),
        sa.CheckConstraint("length(trim(nombre)) > 0", name="ck_paises_nombre"), schema=schema)
    op.bulk_insert(table, [
        {"codigo": "GT", "nombre": "Guatemala", "moneda": "GTQ", "habilitado": True},
        {"codigo": "HN", "nombre": "Honduras", "moneda": "HNL", "habilitado": False},
        {"codigo": "SV", "nombre": "El Salvador", "moneda": "USD", "habilitado": False},
        {"codigo": "NC", "nombre": "Nicaragua", "moneda": "NIO", "habilitado": False}])

def downgrade():
    raise RuntimeError("No borrar países: preparar una reversión revisada si fuera necesaria")
