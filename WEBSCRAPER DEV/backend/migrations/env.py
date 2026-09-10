"""Sólo admite la adopción programática, con conexión previamente validada."""
from alembic import context

config = context.config
connection = config.attributes.get("connection")
if connection is None or not (config.attributes.get("baseline_registration") or
                              config.attributes.get("countries_migration")):
    raise RuntimeError("Usar los comandos DEV de baseline o countries")
context.configure(connection=connection,
                  version_table_schema=config.attributes["baseline_schema"])
with context.begin_transaction():
    context.run_migrations()
