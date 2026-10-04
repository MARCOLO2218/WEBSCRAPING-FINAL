"""Servicios de autenticación con repositorio SQLAlchemy inyectado.

Este módulo no abre conexiones, crea tablas ni instala rutas al importarse.
"""

import hashlib
import re
import secrets
import unicodedata
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hmac import compare_digest
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from sqlalchemy import and_, delete, insert, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from .access.policy import AccessSnapshot, CountryGrant, CountryRole, CountryState, SessionState
from .auth_models import admin_audit_events, sessions as session_table
from .auth_models import user_country_roles, users
from .db.country_models import countries

_USERNAME_PATTERN = re.compile(r"[^\s\x00-\x1f\x7f]+")
_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_-]{43}")
_ROLES = {role.value: role for role in CountryRole}


class InvalidCredentials(Exception):
    """Credenciales no válidas; no indica si la cuenta existe."""


class InvalidCsrf(Exception):
    pass


class AdminActorInvalid(Exception):
    """El actor perdió su nivel o habilitación antes de confirmar la operación."""


@dataclass(frozen=True)
class LoginSession:
    user_id: str
    session_token: str
    csrf_token: str
    expires_at: datetime


def normalize_username(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("Nombre de usuario inválido")
    normalized = unicodedata.normalize("NFKC", value).strip().casefold()
    if (not 1 <= len(normalized) <= 128 or not _USERNAME_PATTERN.fullmatch(normalized)):
        raise ValueError("Nombre de usuario inválido")
    return normalized


def validate_new_password(password: str) -> None:
    if not isinstance(password, str):
        raise ValueError("Contraseña inválida")
    try:
        encoded = password.encode("utf-8", errors="strict")
    except UnicodeEncodeError as error:
        raise ValueError("Contraseña inválida") from error
    if len(password) < 12 or len(encoded) > 1024:
        raise ValueError("La contraseña debe tener 12 caracteres y máximo 1024 bytes")


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("ascii", errors="strict")).hexdigest()


def _valid_token(value: str | None) -> bool:
    return isinstance(value, str) and _TOKEN_PATTERN.fullmatch(value) is not None


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    """SQLite may return naive values for DateTime(timezone=True); writes are UTC."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class AuthRepository:
    """Operaciones aisladas; el caller debe inyectar una sesión SQLAlchemy."""

    def __init__(self, session_factory: sessionmaker[Session], *,
                 password_hasher: Any | None = None,
                 session_ttl: timedelta = timedelta(hours=8),
                 clock=_now_utc):
        if session_ttl <= timedelta(0) or session_ttl > timedelta(days=1):
            raise ValueError("La sesión debe expirar entre 0 y 24 horas")
        self._sessions = session_factory
        self._hasher = password_hasher or PasswordHasher()
        self._ttl = session_ttl
        self._clock = clock
        self._dummy_hash: str | None = None

    @property
    def session_ttl(self) -> timedelta:
        return self._ttl

    def now(self) -> datetime:
        return self._clock()

    def create_user(self, username: str, password: str, *,
                    enabled: bool = True, global_admin: bool = False,
                    account_level: str | None = None,
                    audit_actor_id: str | None = None) -> str:
        """Provisioning interno; no hay ruta HTTP de alta ni valores por defecto."""
        normalized = normalize_username(username)
        validate_new_password(password)
        level = account_level or ("superadmin" if global_admin else "usuario")
        if level not in {"superadmin", "admin", "usuario"}:
            raise ValueError("Nivel de cuenta inválido")
        user_id = str(uuid.uuid4())
        try:
            with self._sessions.begin() as db:
                db.execute(users.insert().values(
                    id=user_id, username=normalized,
                    password_hash=self._hasher.hash(password),
                    enabled=enabled is True, global_admin=level in {"superadmin", "admin"},
                    account_level=level,
                    created_at=self._clock(),
                ))
                if audit_actor_id is not None:
                    self._record_admin_event(
                        db, audit_actor_id, user_id, "usuario_creado",
                        {"account_level": level}, superadmin_only=True,
                    )
        except IntegrityError as error:
            raise ValueError("El usuario ya existe") from error
        return user_id

    def assign_country(self, user_id: str, country_code: str, role: CountryRole) -> None:
        if not isinstance(role, CountryRole) or not re.fullmatch(r"[A-Z]{2}", country_code or ""):
            raise ValueError("Asignación regional inválida")
        with self._sessions.begin() as db:
            exists = db.execute(select(users.c.id).where(users.c.id == user_id)).scalar_one_or_none()
            country = db.execute(select(countries.c.codigo).where(
                countries.c.codigo == country_code)).scalar_one_or_none()
            if exists is None or country is None:
                raise ValueError("Usuario o país desconocido")
            existing = db.execute(select(user_country_roles.c.user_id).where(
                user_country_roles.c.user_id == user_id,
                user_country_roles.c.country_code == country_code,
            )).scalar_one_or_none()
            if existing is None:
                db.execute(user_country_roles.insert().values(
                    user_id=user_id, country_code=country_code, role=role.value,
                ))
            else:
                db.execute(update(user_country_roles).where(
                    user_country_roles.c.user_id == user_id,
                    user_country_roles.c.country_code == country_code,
                ).values(role=role.value))

    def list_users_for_admin(self) -> dict[str, list[dict[str, Any]]]:
        """Return safe account/grant metadata and the full country catalog."""
        with self._sessions() as db:
            user_rows = db.execute(select(
                users.c.id, users.c.username, users.c.enabled,
                users.c.global_admin, users.c.account_level, users.c.created_at,
            ).order_by(users.c.username, users.c.id)).mappings().all()
            assignment_rows = db.execute(select(
                user_country_roles.c.user_id,
                user_country_roles.c.country_code,
                user_country_roles.c.role,
                countries.c.nombre,
                countries.c.moneda,
                countries.c.habilitado,
            ).join(countries, countries.c.codigo == user_country_roles.c.country_code)
             .order_by(user_country_roles.c.user_id, user_country_roles.c.country_code)
            ).mappings().all()
            country_rows = db.execute(select(
                countries.c.codigo, countries.c.nombre, countries.c.moneda,
                countries.c.habilitado,
            ).order_by(countries.c.codigo)).mappings().all()

        permissions: dict[str, list[dict[str, Any]]] = {}
        for assignment in assignment_rows:
            permissions.setdefault(assignment["user_id"], []).append({
                "country_code": assignment["country_code"],
                "country_name": assignment["nombre"],
                "currency": assignment["moneda"],
                "country_enabled": assignment["habilitado"] is True,
                "role": assignment["role"],
            })
        return {
            "users": [{
                "id": row["id"],
                "username": row["username"],
                "enabled": row["enabled"] is True,
                "global_admin": row["global_admin"] is True,
                "account_level": row["account_level"],
                "created_at": _as_utc(row["created_at"]).isoformat(),
                "country_permissions": permissions.get(row["id"], []),
            } for row in user_rows],
            "countries": [{
                "code": row["codigo"], "name": row["nombre"],
                "currency": row["moneda"], "enabled": row["habilitado"] is True,
            } for row in country_rows],
        }

    def replace_country_permissions(
        self,
        user_id: str,
        assignments: list[tuple[str, CountryRole]],
        *,
        audit_actor_id: str | None = None,
    ) -> None:
        """Atomically replace only regional grants; never changes global-admin."""
        if not isinstance(user_id, str) or not user_id.strip():
            raise ValueError("Usuario desconocido")
        if not isinstance(assignments, list):
            raise ValueError("Permisos regionales inválidos")
        normalized: list[dict[str, str]] = []
        seen: set[str] = set()
        for country_code, role in assignments:
            if (not isinstance(country_code, str)
                    or not re.fullmatch(r"[A-Z]{2}", country_code)
                    or country_code in seen
                    or not isinstance(role, CountryRole)):
                raise ValueError("Permisos regionales inválidos")
            seen.add(country_code)
            normalized.append({"country_code": country_code, "role": role.value})
        with self._sessions.begin() as db:
            target = db.execute(select(users.c.id, users.c.account_level).where(
                users.c.id == user_id,
            )).mappings().one_or_none()
            if target is None:
                raise LookupError("Usuario desconocido")
            if audit_actor_id is not None and target["account_level"] != "usuario":
                actor_level = db.execute(select(users.c.account_level).where(
                    users.c.id == audit_actor_id, users.c.enabled.is_(True),
                )).scalar_one_or_none()
                if actor_level != "superadmin":
                    raise AdminActorInvalid
            requested = {item["country_code"] for item in normalized}
            known = set(db.execute(select(countries.c.codigo).where(
                countries.c.codigo.in_(requested) if requested else countries.c.codigo == "",
            )).scalars().all())
            if requested != known:
                raise ValueError("País desconocido")
            db.execute(delete(user_country_roles).where(
                user_country_roles.c.user_id == user_id,
            ))
            if normalized:
                db.execute(insert(user_country_roles), [
                    {"user_id": user_id, **item} for item in normalized
                ])
            if audit_actor_id is not None:
                self._record_admin_event(
                    db, audit_actor_id, user_id, "permisos_cambiados",
                    {"permissions": normalized}, superadmin_only=False,
                )

    def change_account_level(self, user_id: str, account_level: str, *, audit_actor_id: str) -> None:
        if account_level not in {"admin", "usuario"}:
            raise ValueError("Nivel no permitido")
        with self._sessions.begin() as db:
            target_level = db.execute(select(users.c.account_level).where(
                users.c.id == user_id,
            )).scalar_one_or_none()
            if target_level is None:
                raise LookupError("Usuario desconocido")
            if target_level == "superadmin" or user_id == audit_actor_id:
                raise AdminActorInvalid
            self._record_admin_event(db, audit_actor_id, user_id, "nivel_cambiado",
                                     {"previous": target_level, "account_level": account_level},
                                     superadmin_only=True)
            db.execute(update(users).where(users.c.id == user_id).values(
                account_level=account_level, global_admin=account_level == "admin",
            ))
            db.execute(update(session_table).where(
                session_table.c.user_id == user_id, session_table.c.revoked_at.is_(None),
            ).values(revoked_at=self._clock()))

    def reset_user_password(self, user_id: str, password: str, *,
                            audit_actor_id: str | None = None) -> None:
        validate_new_password(password)
        with self._sessions.begin() as db:
            target_level = db.execute(select(users.c.account_level).where(
                users.c.id == user_id,
            )).scalar_one_or_none()
            if target_level is None:
                raise LookupError("Usuario desconocido")
            if audit_actor_id is not None:
                actor_level = db.execute(select(users.c.account_level).where(
                    users.c.id == audit_actor_id, users.c.enabled.is_(True),
                )).scalar_one_or_none()
                if actor_level != "superadmin" and not (actor_level == "admin" and target_level == "usuario"):
                    raise AdminActorInvalid
                self._record_admin_event(
                    db, audit_actor_id, user_id, "contrasena_restablecida", {},
                    superadmin_only=False,
                )
            result = db.execute(update(users).where(users.c.id == user_id).values(
                password_hash=self._hasher.hash(password),
            ))
            if result.rowcount != 1:
                raise LookupError("Usuario desconocido")
            db.execute(update(session_table).where(
                session_table.c.user_id == user_id,
                session_table.c.revoked_at.is_(None),
            ).values(revoked_at=self._clock()))

    def set_user_enabled(self, user_id: str, enabled: bool, *,
                         audit_actor_id: str | None = None) -> str:
        if enabled is not True and enabled is not False:
            raise ValueError("Estado de cuenta inválido")
        with self._sessions.begin() as db:
            row = db.execute(select(users.c.account_level).where(
                users.c.id == user_id,
            )).scalar_one_or_none()
            if row is None:
                raise LookupError("Usuario desconocido")
            if row == "superadmin":
                raise ValueError("La cuenta superadmin está protegida")
            if audit_actor_id is not None:
                event_type = "cuenta_desbloqueada" if enabled else "cuenta_bloqueada"
                self._record_admin_event(
                    db, audit_actor_id, user_id, event_type, {"enabled": enabled},
                    superadmin_only=True,
                )
            db.execute(update(users).where(users.c.id == user_id).values(enabled=enabled))
            if not enabled:
                db.execute(update(session_table).where(
                    session_table.c.user_id == user_id,
                    session_table.c.revoked_at.is_(None),
                ).values(revoked_at=self._clock()))
            return row

    def _record_admin_event(self, db: Session, actor_id: str, target_id: str,
                            event_type: str, details: dict[str, Any], *,
                            superadmin_only: bool) -> None:
        actor_level = db.execute(select(users.c.account_level).where(
            users.c.id == actor_id, users.c.enabled.is_(True),
        )).scalar_one_or_none()
        allowed = {"superadmin"} if superadmin_only else {"superadmin", "admin"}
        if actor_level not in allowed:
            raise AdminActorInvalid
        db.execute(admin_audit_events.insert().values(
            id=str(uuid.uuid4()), actor_user_id=actor_id, target_user_id=target_id,
            event_type=event_type, details=details, created_at=self._clock(),
        ))

    def list_admin_events(self, limit: int = 100) -> list[dict[str, Any]]:
        if not isinstance(limit, int) or not 1 <= limit <= 500:
            raise ValueError("Límite de auditoría inválido")
        with self._sessions() as db:
            rows = db.execute(select(
                admin_audit_events.c.id, admin_audit_events.c.actor_user_id,
                admin_audit_events.c.target_user_id, admin_audit_events.c.event_type,
                admin_audit_events.c.details, admin_audit_events.c.created_at,
            ).order_by(admin_audit_events.c.created_at.desc(),
                       admin_audit_events.c.id.desc()).limit(limit)).mappings().all()
        return [{
            "id": row["id"], "actor_user_id": row["actor_user_id"],
            "target_user_id": row["target_user_id"], "event_type": row["event_type"],
            "details": row["details"], "created_at": _as_utc(row["created_at"]).isoformat(),
        } for row in rows]

    def login(self, username: str, password: str) -> LoginSession:
        try:
            normalized = normalize_username(username)
            valid_input = isinstance(password, str) and len(password.encode("utf-8")) <= 1024
        except (ValueError, UnicodeEncodeError):
            normalized, valid_input = "", False

        with self._sessions() as db:
            record = db.execute(select(
                users.c.id, users.c.password_hash, users.c.enabled,
            ).where(users.c.username == normalized)).mappings().one_or_none()

        stored_hash = record["password_hash"] if record is not None else self._get_dummy_hash()
        password_ok = False
        try:
            password_ok = self._hasher.verify(stored_hash, password if valid_input else "")
        except (VerifyMismatchError, VerificationError):
            pass
        if not valid_input or record is None or record["enabled"] is not True or not password_ok:
            raise InvalidCredentials

        now = self._clock()
        expires_at = now + self._ttl
        token = secrets.token_urlsafe(32)
        csrf_token = secrets.token_urlsafe(32)
        with self._sessions.begin() as db:
            # Recheck enabled to close the password-verify/write race.
            active = db.execute(select(users.c.enabled).where(
                users.c.id == record["id"])).scalar_one_or_none()
            if active is not True:
                raise InvalidCredentials
            if self._hasher.check_needs_rehash(stored_hash):
                db.execute(update(users).where(users.c.id == record["id"]).values(
                    password_hash=self._hasher.hash(password)))
            db.execute(session_table.insert().values(
                id=str(uuid.uuid4()), user_id=record["id"], token_hash=_digest(token),
                csrf_hash=_digest(csrf_token), created_at=now, expires_at=expires_at,
                revoked_at=None,
            ))
        return LoginSession(record["id"], token, csrf_token, expires_at)

    def _get_dummy_hash(self) -> str:
        # Nunca se compara como cuenta válida; se iguala el costo del camino sin usuario.
        if self._dummy_hash is None:
            self._dummy_hash = self._hasher.hash(secrets.token_urlsafe(32))
        return self._dummy_hash

    def read_access(self, opaque_token: str) -> AccessSnapshot | None:
        if not _valid_token(opaque_token):
            return None
        token_hash = _digest(opaque_token)
        now = self._clock()
        with self._sessions() as db:
            # PostgreSQL recibe una fotografía coherente de sesión/usuario/permisos.
            if db.get_bind().dialect.name == "postgresql":
                db.connection(execution_options={"isolation_level": "REPEATABLE READ"})
            joined = db.execute(select(
                session_table.c.expires_at, session_table.c.revoked_at,
                users.c.id, users.c.enabled, users.c.global_admin, users.c.account_level,
            ).join(users, users.c.id == session_table.c.user_id).where(
                session_table.c.token_hash == token_hash,
            )).mappings().one_or_none()
            if joined is None:
                return None
            grants: tuple[CountryGrant, ...] = ()
            countries_out: tuple[CountryState, ...] = ()
            expiry = _as_utc(joined["expires_at"])
            if joined["revoked_at"] is None and expiry > now:
                rows = db.execute(
                    select(
                    countries.c.codigo.label("country_code"),
                    user_country_roles.c.role,
                    countries.c.nombre,
                    countries.c.moneda,
                    countries.c.habilitado,
                    ).select_from(countries.outerjoin(user_country_roles, and_(
                        countries.c.codigo == user_country_roles.c.country_code,
                        user_country_roles.c.user_id == joined["id"],
                    ))).order_by(countries.c.codigo)
                ).mappings().all()
                grants = tuple(CountryGrant(
                    row["country_code"], _ROLES.get(row["role"], row["role"]),
                ) for row in rows if row["role"] is not None)
                countries_out = tuple(CountryState(
                    row["country_code"], row["moneda"], row["habilitado"], row["nombre"],
                ) for row in rows)
        account_level = joined["account_level"]
        # Interpretar datos pre-045 como superadmin hasta que corra el backfill.
        if account_level == "usuario" and joined["global_admin"] is True:
            account_level = "superadmin"
        return AccessSnapshot(SessionState(
            joined["id"], expiry, joined["enabled"] is True,
            joined["revoked_at"] is not None, grants,
            joined["global_admin"] is True,
            account_level,
        ), countries_out)

    def logout(self, opaque_token: str | None, csrf_token: str | None) -> bool:
        if not _valid_token(opaque_token) or not isinstance(csrf_token, str) or not _valid_token(csrf_token):
            return False
        token_hash, csrf_hash = _digest(opaque_token), _digest(csrf_token)
        now = self._clock()
        with self._sessions.begin() as db:
            record = db.execute(select(
                session_table.c.id, session_table.c.csrf_hash,
                session_table.c.revoked_at, session_table.c.expires_at,
            ).where(session_table.c.token_hash == token_hash)).mappings().one_or_none()
            if (record is None or record["revoked_at"] is not None
                    or _as_utc(record["expires_at"]) <= now
                    or not compare_digest(record["csrf_hash"], csrf_hash)):
                return False
            db.execute(update(session_table).where(
                session_table.c.id == record["id"],
                session_table.c.revoked_at.is_(None),
            ).values(revoked_at=now))
        return True

    def csrf_matches_session(self, opaque_token: str | None,
                             csrf_token: str | None) -> bool:
        """Comprueba el double-submit contra el hash de la sesión activa."""
        if (not _valid_token(opaque_token) or not isinstance(csrf_token, str)
                or not _valid_token(csrf_token)):
            return False
        now = self._clock()
        token_hash = _digest(opaque_token)
        with self._sessions() as db:
            record = db.execute(select(
                session_table.c.csrf_hash, session_table.c.expires_at,
                session_table.c.revoked_at, users.c.enabled,
            ).select_from(session_table.join(
                users, users.c.id == session_table.c.user_id,
            )).where(session_table.c.token_hash == token_hash)).mappings().one_or_none()
        return bool(
            record is not None
            and record["revoked_at"] is None
            and record["enabled"] is True
            and _as_utc(record["expires_at"]) > now
            and compare_digest(record["csrf_hash"], _digest(csrf_token))
        )
