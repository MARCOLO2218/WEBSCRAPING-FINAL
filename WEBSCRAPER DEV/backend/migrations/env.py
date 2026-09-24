"""Sólo admite la adopción programática, con conexión previamente validada."""
from alembic import context

config = context.config
connection = config.attributes.get("connection")
if connection is None or not (config.attributes.get("baseline_registration") or
                              config.attributes.get("countries_migration") or
                              config.attributes.get("regional_migration") or
                              config.attributes.get("auth_schema_migration") or
                              config.attributes.get("auth_schema_rollback") or
                              config.attributes.get("auth_throttle_schema_migration") or
                              config.attributes.get("auth_throttle_schema_rollback")):
    raise RuntimeError("Usar los comandos DEV controlados; no iniciar migraciones Alembic genéricas")
context.configure(connection=connection,
                  version_table_schema=config.attributes["baseline_schema"])
with context.begin_transaction():
    context.run_migrations()
