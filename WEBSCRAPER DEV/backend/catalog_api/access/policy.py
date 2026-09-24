"""Política sin I/O. Los datos de acceso deben venir del servidor, no del cliente."""

import re
from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class Action(str, Enum):
    READ = "consultar"
    EXPORT = "exportar"
    UPLOAD_PRICES = "cargar_precios"
    RUN_SCRAPER = "ejecutar_scraper"


class CountryRole(str, Enum):
    READER = "lector"
    OPERATOR = "operador"


_PERMISSIONS = {
    CountryRole.READER: frozenset({Action.READ, Action.EXPORT}),
    CountryRole.OPERATOR: frozenset({
        Action.READ, Action.EXPORT, Action.UPLOAD_PRICES, Action.RUN_SCRAPER,
    }),
}


@dataclass(frozen=True)
class CountryGrant:
    country_code: str
    role: CountryRole


@dataclass(frozen=True)
class SessionState:
    user_id: str
    expires_at: datetime
    user_enabled: bool
    revoked: bool
    grants: tuple[CountryGrant, ...]
    global_admin: bool = False

    def __post_init__(self):
        object.__setattr__(self, "grants", tuple(self.grants))


@dataclass(frozen=True)
class CountryState:
    code: str
    currency: str
    enabled: bool


@dataclass(frozen=True)
class AccessSnapshot:
    session: SessionState | None
    countries: tuple[CountryState, ...]

    def __post_init__(self):
        object.__setattr__(self, "countries", tuple(self.countries))


@dataclass(frozen=True)
class CountryContext:
    user_id: str
    country_code: str
    currency: str
    role: CountryRole


class AccessDenied(Exception):
    def __init__(self, status_code: int, code: str):
        super().__init__(code)
        self.status_code = status_code
        self.code = code


def authenticate(snapshot: AccessSnapshot | None, now: datetime) -> SessionState:
    if now.utcoffset() is None:
        raise ValueError("El reloj del servidor debe tener zona horaria")
    session = snapshot.session if snapshot is not None else None
    if (session is None or not session.user_id.strip()
            or session.user_enabled is not True or session.revoked is not False
            or session.expires_at.utcoffset() is None or session.expires_at <= now):
        raise AccessDenied(401, "sesion_no_valida")
    return session


def authorize_country(snapshot: AccessSnapshot | None, selected_country: str | None,
                      action: Action, now: datetime) -> CountryContext:
    session = authenticate(snapshot, now)
    if not selected_country:
        raise AccessDenied(400, "pais_requerido")
    if not re.fullmatch(r"[A-Z]{2}", selected_country):
        raise AccessDenied(400, "pais_invalido")

    countries = [c for c in snapshot.countries if c.code == selected_country]
    grants = [g for g in session.grants if g.country_code == selected_country]
    # Duplicados de catálogo/asignación no se resuelven tomando el más permisivo.
    if len(countries) != 1 or len(grants) != 1:
        raise AccessDenied(403, "acceso_denegado")
    country, grant = countries[0], grants[0]
    if (country.enabled is not True
            or not re.fullmatch(r"[A-Z]{3}", country.currency)
            or action not in _PERMISSIONS.get(grant.role, ())):
        raise AccessDenied(403, "acceso_denegado")
    return CountryContext(session.user_id, country.code, country.currency, grant.role)


def available_countries(snapshot: AccessSnapshot | None,
                        now: datetime) -> tuple[CountryContext, ...]:
    authenticate(snapshot, now)
    contexts = []
    for code in sorted({c.code for c in snapshot.countries}):
        try:
            contexts.append(authorize_country(snapshot, code, Action.READ, now))
        except AccessDenied:
            continue
    return tuple(contexts)


def authorize_admin(snapshot: AccessSnapshot | None, now: datetime) -> str:
    session = authenticate(snapshot, now)
    if session.global_admin is not True:
        raise AccessDenied(403, "acceso_denegado")
    return session.user_id


def require_resource_country(context: CountryContext, resource_country: str | None) -> None:
    """El país del recurso debe obtenerse del repositorio, nunca del body/query."""
    if resource_country is None or resource_country != context.country_code:
        raise AccessDenied(403, "acceso_denegado")


def require_catalog_product(context: CountryContext, resource_country: str | None,
                            classification: str) -> None:
    require_resource_country(context, resource_country)
    if classification != "asignado":
        raise AccessDenied(403, "acceso_denegado")
