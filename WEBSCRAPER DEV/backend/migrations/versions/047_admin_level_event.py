"""Admitir cambio de nivel en auditoría; no ejecutar automáticamente."""
from alembic import op
import sqlalchemy as sa

revision = "047_admin_level_event"
down_revision = "046_admin_audit"
branch_labels = None
depends_on = None

OLD = "event_type IN ('usuario_creado','permisos_cambiados','contrasena_restablecida','cuenta_bloqueada','cuenta_desbloqueada')"
NEW = "event_type IN ('usuario_creado','permisos_cambiados','contrasena_restablecida','cuenta_bloqueada','cuenta_desbloqueada','nivel_cambiado')"

def replace_constraint(expression):
    connection = op.get_bind()
    if connection.dialect.name == 'sqlite':
        current = next(item for item in sa.inspect(connection).get_check_constraints('admin_eventos', schema='catalogo') if item['name'] == 'ck_admin_eventos_event_type')
        if ('nivel_cambiado' in current['sqltext']) == ('nivel_cambiado' in expression):
            return
        triggers = connection.execute(sa.text("SELECT sql FROM catalogo.sqlite_master WHERE type='trigger' AND tbl_name='admin_eventos'")).scalars().all()
        with op.batch_alter_table('admin_eventos', schema='catalogo') as batch:
            batch.drop_constraint('ck_admin_eventos_event_type', type_='check')
            batch.create_check_constraint('ck_admin_eventos_event_type', expression)
        for sql in triggers:
            # SQLite stores unqualified CREATE TRIGGER; restore into attached schema.
            connection.execute(sa.text(sql.replace('CREATE TRIGGER ', 'CREATE TRIGGER catalogo.', 1)))
    else:
        op.drop_constraint('ck_admin_eventos_event_type', 'admin_eventos', schema='catalogo', type_='check')
        op.create_check_constraint('ck_admin_eventos_event_type', 'admin_eventos', expression, schema='catalogo')

def upgrade():
    if not op.get_context().config.attributes.get("admin_audit_schema_migration"):
        raise RuntimeError('La revisión 047 requiere el flujo autorizado de esquema de autenticación')
    replace_constraint(NEW)

def downgrade():
    if not op.get_context().config.attributes.get("admin_audit_schema_rollback"):
        raise RuntimeError('La revisión 047 requiere el flujo autorizado de esquema de autenticación')
    # No borrar evidencia para poder retroceder.
    count = op.get_bind().execute(sa.text("SELECT count(*) FROM catalogo.admin_eventos WHERE event_type = 'nivel_cambiado'")).scalar_one()
    if count:
        raise RuntimeError('Existen eventos de cambio de nivel; no se permite downgrade')
    replace_constraint(OLD)
