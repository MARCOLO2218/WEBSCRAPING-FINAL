"""Bitácora append-only para acciones de administración de cuentas."""

from alembic import op

from catalog_api.auth_models import admin_audit_events

revision = "046_admin_audit"
down_revision = "045_account_levels"
branch_labels = None
depends_on = None


def upgrade():
    if not op.get_context().config.attributes.get("admin_audit_schema_migration"):
        raise RuntimeError("La revisión 046 requiere el flujo autorizado de esquema de autenticación")
    connection = op.get_bind()
    admin_audit_events.create(connection, checkfirst=False)
    if connection.dialect.name == "postgresql":
        op.execute("""
            CREATE FUNCTION catalogo.rechazar_cambio_admin_eventos()
            RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                RAISE EXCEPTION 'catalogo.admin_eventos es append-only';
            END;
            $$
        """)
        op.execute("""
            CREATE TRIGGER trg_admin_eventos_append_only
            BEFORE UPDATE OR DELETE ON catalogo.admin_eventos
            FOR EACH ROW EXECUTE FUNCTION catalogo.rechazar_cambio_admin_eventos()
        """)
        op.execute("""
            CREATE TRIGGER trg_admin_eventos_no_truncate
            BEFORE TRUNCATE ON catalogo.admin_eventos
            FOR EACH STATEMENT EXECUTE FUNCTION catalogo.rechazar_cambio_admin_eventos()
        """)
    elif connection.dialect.name == "sqlite":
        op.execute("""
            CREATE TRIGGER catalogo.trg_admin_eventos_no_update
            BEFORE UPDATE ON admin_eventos
            BEGIN SELECT RAISE(ABORT, 'catalogo.admin_eventos es append-only'); END
        """)
        op.execute("""
            CREATE TRIGGER catalogo.trg_admin_eventos_no_delete
            BEFORE DELETE ON admin_eventos
            BEGIN SELECT RAISE(ABORT, 'catalogo.admin_eventos es append-only'); END
        """)


def downgrade():
    if not op.get_context().config.attributes.get("admin_audit_schema_rollback"):
        raise RuntimeError("Revertir 046 elimina la bitácora administrativa; requiere autorización explícita")
    connection = op.get_bind()
    if connection.dialect.name == "postgresql":
        op.execute("DROP TRIGGER trg_admin_eventos_no_truncate ON catalogo.admin_eventos")
        op.execute("DROP TRIGGER trg_admin_eventos_append_only ON catalogo.admin_eventos")
        op.execute("DROP FUNCTION catalogo.rechazar_cambio_admin_eventos()")
    elif connection.dialect.name == "sqlite":
        op.execute("DROP TRIGGER catalogo.trg_admin_eventos_no_update")
        op.execute("DROP TRIGGER catalogo.trg_admin_eventos_no_delete")
    admin_audit_events.drop(connection, checkfirst=False)
