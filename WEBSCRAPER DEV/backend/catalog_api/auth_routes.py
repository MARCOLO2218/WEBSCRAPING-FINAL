"""Rutas preparatorias de autenticación; no incluidas en main.py."""

from collections.abc import Iterable
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field, SecretStr

from .access.dependencies import SESSION_COOKIE
from .access.policy import AccessDenied, AccessSnapshot, available_countries, authenticate
from .auth import AuthRepository, InvalidCredentials
from .auth_throttle import LoginThrottle, LoginThrottleUnavailable

CSRF_COOKIE = "catalog_csrf"
CSRF_HEADER = "X-CSRF-Token"


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: SecretStr


class LoginResponse(BaseModel):
    user_id: str
    csrf_token: str
    expires_at: str


class CountryOption(BaseModel):
    code: str
    currency: str


class AuthContextResponse(BaseModel):
    user_id: str
    countries: list[CountryOption]


def _approved_origin(origin: str | None, allowed: frozenset[str]) -> bool:
    if not origin or origin not in allowed:
        return False
    parsed = urlsplit(origin)
    return parsed.scheme == "https" and bool(parsed.netloc) and parsed.path in ("", "/") \
        and not parsed.query and not parsed.fragment and parsed.username is None


def create_auth_router(repository: AuthRepository, *, allowed_origins: Iterable[str],
                       throttle: LoginThrottle | None = None) -> APIRouter:
    """Crea rutas con repo, límite compartido y orígenes HTTPS explícitos."""
    origins = frozenset(allowed_origins)
    if any(not _approved_origin(origin, origins) for origin in origins):
        raise ValueError("Cada origen permitido debe ser HTTPS y canónico")
    if not origins:
        raise ValueError("Debe configurarse al menos un origen HTTPS")
    if throttle is None:
        raise ValueError("El login requiere un limitador compartido de intentos")

    router = APIRouter(prefix="/auth", tags=["Autenticación regional"])

    def require_origin(request: Request) -> None:
        if not _approved_origin(request.headers.get("origin"), origins):
            raise HTTPException(403, detail={"code": "origen_no_permitido"})

    @router.post("/login", response_model=LoginResponse)
    def login(body: LoginRequest, request: Request, response: Response):
        require_origin(request)
        client_ip = request.client.host if request.client is not None else None
        try:
            if not client_ip:
                raise LoginThrottleUnavailable
            retry_after = throttle.claim_attempt(body.username, client_ip, repository.now())
        except Exception:
            raise HTTPException(503, detail={"code": "autenticacion_no_disponible"}) from None
        if retry_after is not None:
            raise HTTPException(429, detail={"code": "intento_temporalmente_bloqueado"},
                                headers={"Retry-After": str(retry_after)})
        try:
            issued = repository.login(body.username, body.password.get_secret_value())
        except InvalidCredentials:
            raise HTTPException(401, detail={"code": "credenciales_no_validas"}) from None
        except Exception:
            # No revelar hashes, DSN, parámetros del driver ni contraseñas.
            raise HTTPException(503, detail={"code": "autenticacion_no_disponible"}) from None
        try:
            throttle.clear_account(body.username)
        except Exception:
            # No entregar una sesión nueva si no se pudo completar el flujo protegido.
            try:
                repository.logout(issued.session_token, issued.csrf_token)
            except Exception:
                pass
            raise HTTPException(503, detail={"code": "autenticacion_no_disponible"}) from None
        response.set_cookie(
            SESSION_COOKIE, issued.session_token, max_age=int(repository.session_ttl.total_seconds()),
            path="/", secure=True, httponly=True, samesite="lax",
        )
        # Double-submit token: no es una credencial y se valida además contra el hash en DB.
        response.set_cookie(
            CSRF_COOKIE, issued.csrf_token, max_age=int(repository.session_ttl.total_seconds()),
            path="/", secure=True, httponly=False, samesite="lax",
        )
        return LoginResponse(
            user_id=issued.user_id, csrf_token=issued.csrf_token,
            expires_at=issued.expires_at.isoformat(),
        )

    @router.get("/me", response_model=AuthContextResponse)
    def current_session(request: Request):
        token = request.cookies.get(SESSION_COOKIE)
        try:
            snapshot = repository.read_access(token or "")
        except Exception:
            raise HTTPException(503, detail={"code": "autenticacion_no_disponible"}) from None
        now = repository.now()
        try:
            session = authenticate(snapshot, now)
            options = available_countries(snapshot, now)
        except AccessDenied as error:
            raise HTTPException(error.status_code, detail={"code": error.code}) from None
        return AuthContextResponse(
            user_id=session.user_id,
            countries=[CountryOption(code=c.country_code, currency=c.currency) for c in options],
        )

    @router.post("/logout", status_code=204)
    def logout(request: Request, response: Response):
        require_origin(request)
        csrf_cookie = request.cookies.get(CSRF_COOKIE)
        csrf_header = request.headers.get(CSRF_HEADER)
        token = request.cookies.get(SESSION_COOKIE)
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            raise HTTPException(403, detail={"code": "csrf_no_valido"})
        if not repository.logout(token, csrf_header):
            raise HTTPException(401, detail={"code": "sesion_no_valida"})
        response.delete_cookie(SESSION_COOKIE, path="/", secure=True,
                               httponly=True, samesite="lax")
        response.delete_cookie(CSRF_COOKIE, path="/", secure=True,
                               httponly=False, samesite="lax")
        response.status_code = 204
        return None

    return router
