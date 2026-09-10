"""Conexión perezosa; el llamador aporta las variables PG de DEV."""
import os
import re
from sqlalchemy import URL, create_engine

def schema_name(env=None):
    values = os.environ if env is None else env
    schema = values.get("PGSCHEMA", "catalogo")
    if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", schema):
        raise ValueError("PGSCHEMA inválido")
    return schema

def database_url(env=None):
    values = os.environ if env is None else env
    for key in ("PGDATABASE", "PGUSER", "PGPASSWORD"):
        if not values.get(key):
            raise ValueError(f"Falta {key}")
    return URL.create("postgresql+psycopg", username=values["PGUSER"],
        password=values["PGPASSWORD"], host=values.get("PGHOST", "localhost"),
        port=int(values.get("PGPORT", "5432")), database=values["PGDATABASE"])

def readonly_engine(env=None):
    values = os.environ if env is None else env
    schema = schema_name(values)
    return create_engine(database_url(values), echo=False, hide_parameters=True,
        connect_args={"connect_timeout": 10,
            "sslmode": "require" if values.get("PGSSL", "").lower() == "true" else "disable",
            "options": "-c default_transaction_read_only=on -c statement_timeout=30000"},
        execution_options={"schema_translate_map": {"catalogo": schema}})
