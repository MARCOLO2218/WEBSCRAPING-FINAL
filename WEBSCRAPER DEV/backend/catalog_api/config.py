"""Configuración exclusiva de la API piloto DEV, sin cargar el .env de Node."""

import os
from dataclasses import dataclass
from collections.abc import Mapping


@dataclass(frozen=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 8000


def load_settings(env: Mapping[str, str] | None = None) -> Settings:
    values = os.environ if env is None else env
    host = values.get("CATALOG_API_HOST", "127.0.0.1").strip()
    if not host:
        raise ValueError("CATALOG_API_HOST no puede estar vacío")
    try:
        port = int(values.get("CATALOG_API_PORT", "8000"))
    except ValueError as error:
        raise ValueError("CATALOG_API_PORT debe ser un entero") from error
    if not 1 <= port <= 65535:
        raise ValueError("CATALOG_API_PORT debe estar entre 1 y 65535")
    return Settings(host=host, port=port)
