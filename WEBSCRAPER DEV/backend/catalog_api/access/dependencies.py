"""Dependencias FastAPI sin proveedor por defecto ni rutas operativas.

El adaptador futuro resolverá token, usuario, permisos y países con una lectura
coherente por petición. No cachear este estado entre peticiones.
"""

from datetime import datetime, timezone
from typing import Protocol

from fastapi import Depends, HTTPException, Request

from .policy import (
    AccessDenied, AccessSnapshot, Action, CountryContext, authenticate,
    authorize_admin, authorize_country, available_countries,
)

SESSION_COOKIE = "__Host-catalog_session"


class AccessProvider(Protocol):
    def read_access(self, opaque_token: str) -> AccessSnapshot | None:
        """Releer sesión y permisos vigentes del servidor; None si no existe."""
        ...


def get_access_provider() -> AccessProvider | None:
    # La ausencia del adaptador nunca habilita una identidad de desarrollo.
    return None


def access_clock() -> datetime:
    return datetime.now(timezone.utc)


def _http_error(error: AccessDenied) -> HTTPException:
    return HTTPException(error.status_code, detail={"code": error.code})


def load_access_snapshot(request: Request,
                         provider: AccessProvider | None = Depends(get_access_provider),
                         now: datetime = Depends(access_clock)) -> AccessSnapshot:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(401, detail={"code": "sesion_no_valida"})
    if provider is None:
        raise HTTPException(503, detail={"code": "acceso_no_disponible"})
    try:
        snapshot = provider.read_access(token)
    except Exception:
        # No serializar excepciones del adaptador: pueden contener tokens/DSN.
        raise HTTPException(503, detail={"code": "acceso_no_disponible"}) from None
    try:
        authenticate(snapshot, now)
    except AccessDenied as error:
        raise _http_error(error) from None
    return snapshot


def snapshot_dependency_for(provider_dependency):
    """Build a request dependency around an explicitly injected access provider."""
    if not callable(provider_dependency):
        raise TypeError("Se requiere una dependencia de proveedor de acceso")
    if provider_dependency is get_access_provider:
        return load_access_snapshot

    def load_injected_access(request: Request,
                             provider=Depends(provider_dependency),
                             now: datetime = Depends(access_clock)) -> AccessSnapshot:
        return load_access_snapshot(request, provider, now)

    return load_injected_access


def require_country(action: Action, *, snapshot_dependency=load_access_snapshot):
    """El nombre del parámetro de ruta debe ser country_code; nunca usa query."""
    if not isinstance(action, Action):
        raise ValueError("Acción regional no reconocida")
    if not callable(snapshot_dependency):
        raise TypeError("Se requiere una dependencia de acceso")

    def dependency(request: Request,
                   snapshot: AccessSnapshot = Depends(snapshot_dependency),
                   now: datetime = Depends(access_clock)) -> CountryContext:
        try:
            return authorize_country(snapshot, request.path_params.get("country_code"), action, now)
        except AccessDenied as error:
            raise _http_error(error) from None

    return dependency


def require_admin(snapshot: AccessSnapshot = Depends(load_access_snapshot),
                  now: datetime = Depends(access_clock)) -> str:
    try:
        return authorize_admin(snapshot, now)
    except AccessDenied as error:
        raise _http_error(error) from None


def authorized_countries(snapshot: AccessSnapshot = Depends(load_access_snapshot),
                         now: datetime = Depends(access_clock)) -> tuple[CountryContext, ...]:
    try:
        return available_countries(snapshot, now)
    except AccessDenied as error:
        raise _http_error(error) from None
