"""Niveles globales jerárquicos para administración de cuentas."""

from alembic import op
import sqlalchemy as sa

revision = "045_account_levels"
down_revision = "044_login_throttle"
branch_labels = None
depends_on = None


def backfill_legacy_levels(connection):
    """Promote only legacy global admins; preserve already assigned new levels."""
    connection.execute(sa.text(
        "UPDATE catalogo.usuarios SET account_level = 'superadmin' "
        "WHERE global_admin IS TRUE AND account_level = 'usuario'"
    ))


def upgrade():
    if not op.get_context().config.attributes.get("account_levels_schema_migration"):
        raise RuntimeError("La revisión 045 requiere el flujo autorizado de esquema de autenticación")
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("usuarios", schema="catalogo")}
    if "account_level" not in columns:
        op.add_column("usuarios", sa.Column(
            "account_level", sa.String(16), nullable=False,
            server_default="usuario",
        ), schema="catalogo")
    backfill_legacy_levels(bind)
    constraints = {item["name"] for item in inspector.get_check_constraints(
        "usuarios", schema="catalogo"
    )}
    if "ck_usuarios_account_level" not in constraints:
        with op.batch_alter_table("usuarios", schema="catalogo") as batch:
            batch.create_check_constraint(
                "ck_usuarios_account_level",
                "account_level IN ('superadmin','admin','usuario')",
            )


def downgrade():
    if not op.get_context().config.attributes.get("account_levels_schema_rollback"):
        raise RuntimeError("Revertir 045 elimina los niveles jerárquicos; requiere autorización explícita")
    bind = op.get_bind()
    bind.execute(sa.text(
        "UPDATE catalogo.usuarios SET global_admin = account_level IN ('superadmin','admin')"
    ))
    with op.batch_alter_table("usuarios", schema="catalogo") as batch:
        batch.drop_constraint("ck_usuarios_account_level", type_="check")
        batch.drop_column("account_level")
