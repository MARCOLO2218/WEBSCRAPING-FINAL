"""Composición de acceso aislada con dependencias explícitas; sin engine ni .env."""
from collections.abc import Iterable
from fastapi import FastAPI
from .auth import AuthRepository
from .auth_throttle import LoginThrottle
from .auth_routes import create_auth_router
from .auth_admin_routes import create_auth_admin_router


def create_auth_app(repository: AuthRepository, *, throttle: LoginThrottle,
                    allowed_origins: Iterable[str]) -> FastAPI:
    origins = tuple(allowed_origins)
    app = FastAPI(title="Acceso Catálogo Comercial", version="0.1.0")
    app.include_router(create_auth_router(repository, allowed_origins=origins, throttle=throttle))
    app.include_router(create_auth_admin_router(repository, allowed_origins=origins))
    return app
