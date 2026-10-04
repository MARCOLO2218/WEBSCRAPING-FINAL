"""API aislada para administrar usuarios y permisos regionales."""

from collections.abc import Iterable
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field, SecretStr

from .access.dependencies import SESSION_COOKIE
from .access.policy import AccessDenied, authenticate, authorize_admin
from .auth import AdminActorInvalid, AuthRepository
from .auth_routes import CSRF_COOKIE, CSRF_HEADER, _approved_origin
from .access.policy import CountryRole


class CountryPermissionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    country_code: str = Field(pattern=r"^[A-Z]{2}$")
    role: Literal["lector", "operador"]


class ReplacePermissionsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    permissions: list[CountryPermissionInput]


class CreateUserRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=128)
    password: SecretStr
    account_level: Literal["admin", "usuario"]


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: SecretStr


class AccountStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool


class AccountLevelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    account_level: Literal["admin", "usuario"]


class CountrySummary(BaseModel):
    code: str
    name: str
    currency: str
    enabled: bool


class UserPermission(BaseModel):
    country_code: str
    country_name: str
    currency: str
    country_enabled: bool
    role: Literal["lector", "operador"]


class AdminUser(BaseModel):
    id: str
    username: str
    enabled: bool
    global_admin: bool
    account_level: Literal["superadmin", "admin", "usuario"]
    created_at: str
    country_permissions: list[UserPermission]


class AdminUsersResponse(BaseModel):
    users: list[AdminUser]
    countries: list[CountrySummary]


class AdminEvent(BaseModel):
    id: str
    actor_user_id: str
    target_user_id: str
    event_type: str
    details: dict
    created_at: str


def create_auth_admin_router(
    repository: AuthRepository,
    *,
    allowed_origins: Iterable[str],
) -> APIRouter:
    origins = frozenset(allowed_origins)
    if not origins or any(not _approved_origin(origin, origins) for origin in origins):
        raise ValueError("Debe configurarse una lista de orígenes HTTPS válidos")

    router = APIRouter(prefix="/auth/admin/users", tags=["Administración de usuarios"])

    def require_admin(request: Request) -> tuple[str, str]:
        token = request.cookies.get(SESSION_COOKIE)
        if not token:
            raise HTTPException(401, detail={"code": "sesion_no_valida"})
        try:
            snapshot = repository.read_access(token)
        except Exception:
            raise HTTPException(503, detail={"code": "acceso_no_disponible"}) from None
        now = repository.now()
        try:
            session = authenticate(snapshot, now)
            user_id = authorize_admin(snapshot, now)
            return user_id, session.account_level
        except AccessDenied as error:
            raise HTTPException(error.status_code, detail={"code": error.code}) from None

    def require_write_protection(request: Request) -> None:
        if not _approved_origin(request.headers.get("origin"), origins):
            raise HTTPException(403, detail={"code": "origen_no_permitido"})
        csrf_cookie = request.cookies.get(CSRF_COOKIE)
        csrf_header = request.headers.get(CSRF_HEADER)
        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            raise HTTPException(403, detail={"code": "csrf_no_valido"})
        try:
            valid_session_token = repository.csrf_matches_session(
                request.cookies.get(SESSION_COOKIE), csrf_header,
            )
        except Exception:
            raise HTTPException(503, detail={"code": "acceso_no_disponible"}) from None
        if not valid_session_token:
            raise HTTPException(403, detail={"code": "csrf_no_valido"})

    @router.get("", response_model=AdminUsersResponse)
    def list_users(request: Request, response: Response):
        require_admin(request)
        try:
            result = repository.list_users_for_admin()
        except Exception:
            raise HTTPException(503, detail={"code": "administracion_no_disponible"}) from None
        response.headers["Cache-Control"] = "no-store"
        return result

    @router.put("/{user_id}/country-permissions", response_model=AdminUser)
    def replace_user_permissions(
        user_id: str,
        body: ReplacePermissionsRequest,
        request: Request,
        response: Response,
    ):
        actor_id, actor_level = require_admin(request)
        require_write_protection(request)
        codes = [entry.country_code for entry in body.permissions]
        if len(codes) != len(set(codes)):
            raise HTTPException(422, detail={"code": "pais_duplicado"})
        try:
            target = next((user for user in repository.list_users_for_admin()["users"]
                           if user["id"] == user_id), None)
            if target is None:
                raise LookupError
            if actor_level == "admin" and target["account_level"] != "usuario":
                raise AccessDenied(403, "accion_restringida_superadmin")
            repository.replace_country_permissions(user_id, [
                (entry.country_code, CountryRole(entry.role)) for entry in body.permissions
            ], audit_actor_id=actor_id)
            result = repository.list_users_for_admin()
        except LookupError:
            raise HTTPException(404, detail={"code": "usuario_no_encontrado"}) from None
        except AccessDenied as error:
            raise HTTPException(error.status_code, detail={"code": error.code}) from None
        except AdminActorInvalid:
            raise HTTPException(403, detail={"code": "sesion_administrativa_revocada"}) from None
        except ValueError:
            raise HTTPException(422, detail={"code": "permisos_invalidos"}) from None
        except Exception:
            raise HTTPException(503, detail={"code": "administracion_no_disponible"}) from None
        response.headers["Cache-Control"] = "no-store"
        return next(user for user in result["users"] if user["id"] == user_id)

    @router.put("/{user_id}/level", response_model=AdminUser)
    def change_level(user_id: str, body: AccountLevelRequest,
                     request: Request, response: Response):
        actor_id, actor_level = require_admin(request)
        require_write_protection(request)
        if actor_level != "superadmin":
            raise HTTPException(403, detail={"code": "accion_restringida_superadmin"})
        try:
            repository.change_account_level(user_id, body.account_level, audit_actor_id=actor_id)
            result = repository.list_users_for_admin()
        except LookupError:
            raise HTTPException(404, detail={"code": "usuario_no_encontrado"}) from None
        except AdminActorInvalid:
            raise HTTPException(403, detail={"code": "accion_restringida_superadmin"}) from None
        except ValueError:
            raise HTTPException(422, detail={"code": "nivel_invalido"}) from None
        except Exception:
            raise HTTPException(503, detail={"code": "administracion_no_disponible"}) from None
        response.headers["Cache-Control"] = "no-store"
        return next(user for user in result["users"] if user["id"] == user_id)

    @router.post("", response_model=AdminUser, status_code=201)
    def create_user(body: CreateUserRequest, request: Request, response: Response):
        _actor_id, actor_level = require_admin(request)
        require_write_protection(request)
        if actor_level != "superadmin":
            raise HTTPException(403, detail={"code": "accion_restringida_superadmin"})
        try:
            user_id = repository.create_user(
                body.username, body.password.get_secret_value(),
                account_level=body.account_level,
                audit_actor_id=_actor_id,
            )
            result = repository.list_users_for_admin()
        except ValueError:
            raise HTTPException(422, detail={"code": "datos_usuario_invalidos"}) from None
        except AdminActorInvalid:
            raise HTTPException(403, detail={"code": "sesion_administrativa_revocada"}) from None
        except Exception:
            raise HTTPException(503, detail={"code": "administracion_no_disponible"}) from None
        response.headers["Cache-Control"] = "no-store"
        return next(user for user in result["users"] if user["id"] == user_id)

    @router.put("/{user_id}/password", status_code=204)
    def reset_password(user_id: str, body: ResetPasswordRequest,
                       request: Request, response: Response):
        _actor_id, actor_level = require_admin(request)
        require_write_protection(request)
        try:
            repository.reset_user_password(
                user_id, body.password.get_secret_value(), audit_actor_id=_actor_id,
            )
        except LookupError:
            raise HTTPException(404, detail={"code": "usuario_no_encontrado"}) from None
        except ValueError:
            raise HTTPException(422, detail={"code": "contrasena_invalida"}) from None
        except AdminActorInvalid:
            raise HTTPException(403, detail={"code": "sesion_administrativa_revocada"}) from None
        except Exception:
            raise HTTPException(503, detail={"code": "administracion_no_disponible"}) from None
        response.headers["Cache-Control"] = "no-store"
        response.status_code = 204
        return None

    @router.patch("/{user_id}/status", response_model=AdminUser)
    def set_account_status(user_id: str, body: AccountStatusRequest,
                           request: Request, response: Response):
        actor_id, actor_level = require_admin(request)
        require_write_protection(request)
        if actor_level != "superadmin":
            raise HTTPException(403, detail={"code": "accion_restringida_superadmin"})
        if user_id == actor_id:
            raise HTTPException(422, detail={"code": "no_puede_bloquearse_a_si_mismo"})
        try:
            repository.set_user_enabled(user_id, body.enabled, audit_actor_id=actor_id)
            result = repository.list_users_for_admin()
        except LookupError:
            raise HTTPException(404, detail={"code": "usuario_no_encontrado"}) from None
        except ValueError:
            raise HTTPException(403, detail={"code": "proteccion_superadmin"}) from None
        except AdminActorInvalid:
            raise HTTPException(403, detail={"code": "sesion_administrativa_revocada"}) from None
        except Exception:
            raise HTTPException(503, detail={"code": "administracion_no_disponible"}) from None
        response.headers["Cache-Control"] = "no-store"
        return next(user for user in result["users"] if user["id"] == user_id)

    @router.get("/audit-events", response_model=list[AdminEvent])
    def list_audit_events(request: Request, response: Response,
                          limit: int = Query(default=100, ge=1, le=500)):
        _actor_id, actor_level = require_admin(request)
        if actor_level != "superadmin":
            raise HTTPException(403, detail={"code": "accion_restringida_superadmin"})
        try:
            result = repository.list_admin_events(limit)
        except Exception:
            raise HTTPException(503, detail={"code": "auditoria_no_disponible"}) from None
        response.headers["Cache-Control"] = "no-store"
        return result

    return router
