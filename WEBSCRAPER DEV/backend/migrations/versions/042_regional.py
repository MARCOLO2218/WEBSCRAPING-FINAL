"""Expansión complementaria, sin ALTER ni UPDATE de historia."""
from alembic import op
from catalog_api.db.regional_expansion_v1 import tables

revision = '042_regional'
down_revision = '037_countries'
branch_labels = None
depends_on = None


def upgrade():
    if not op.get_context().config.attributes.get('regional_migration'):
        raise RuntimeError('Usar regional-migration-dev con preflight')
    for table in tables(op.get_context().opts['version_table_schema']):
        table.create(op.get_bind(), checkfirst=False)


def downgrade():
    if not op.get_context().config.attributes.get('regional_rollback'):
        raise RuntimeError('Reversión requiere validación de lote y conservación')
    for table in reversed(tables(op.get_context().opts['version_table_schema'])):
        table.drop(op.get_bind(), checkfirst=False)
