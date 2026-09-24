"""Rate-limit de autenticación compartido entre procesos."""

from alembic import op
from catalog_api.auth_throttle_models import login_attempts

revision = "044_login_throttle"
down_revision = "043_auth"
branch_labels = None
depends_on = None


def upgrade():
    if not op.get_context().config.attributes.get("auth_throttle_schema_migration"):
        raise RuntimeError("La revisión 044 requiere el flujo autorizado de esquema de autenticación")
    login_attempts.create(op.get_bind(), checkfirst=False)


def downgrade():
    if not op.get_context().config.attributes.get("auth_throttle_schema_rollback"):
        raise RuntimeError("Revertir 044 elimina los contadores compartidos; requiere autorización explícita")
    login_attempts.drop(op.get_bind(), checkfirst=False)
