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
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from .access.policy import AccessSnapshot, CountryGrant, CountryRole, CountryState, SessionState
from .auth_models import sessions as session_table
from .auth_models import user_country_roles, users
from .db.country_models import countries

_USERNAME_PATTERN = re.compile(r"[^\s\x00-\x1f\x7f]+")
_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_-]{43}")
_ROLES = {role.value: role for role in CountryRole}


class InvalidCredentials(Exception):
    """Credenciales no válidas; no indica si la cuenta existe."""


class InvalidCsrf(Exception):
    pass


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
                    enabled: bool = True, global_admin: bool = False) -> str:
        """Provisioning interno; no hay ruta HTTP de alta ni valores por defecto."""
        normalized = normalize_username(username)
        validate_new_password(password)
        user_id = str(uuid.uuid4())
        try:
            with self._sessions.begin() as db:
                db.execute(users.insert().values(
                    id=user_id, username=normalized,
                    password_hash=self._hasher.hash(password),
                    enabled=enabled is True, global_admin=global_admin is True,
                    created_at=self._clock(),
                ))
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
                users.c.id, users.c.enabled, users.c.global_admin,
            ).join(users, users.c.id == session_table.c.user_id).where(
                session_table.c.token_hash == token_hash,
            )).mappings().one_or_none()
            if joined is None:
                return None
            grants: tuple[CountryGrant, ...] = ()
            countries_out: tuple[CountryState, ...] = ()
            expiry = _as_utc(joined["expires_at"])
            if joined["revoked_at"] is None and expiry > now:
                rows = db.execute(select(
                    user_country_roles.c.country_code,
                    user_country_roles.c.role,
                    countries.c.moneda,
                    countries.c.habilitado,
                ).join(countries, countries.c.codigo == user_country_roles.c.country_code)
                  .where(user_country_roles.c.user_id == joined["id"])
                  .order_by(user_country_roles.c.country_code)).mappings().all()
                grants = tuple(CountryGrant(
                    row["country_code"], _ROLES.get(row["role"], row["role"]),
                ) for row in rows)
                countries_out = tuple(CountryState(
                    row["country_code"], row["moneda"], row["habilitado"],
                ) for row in rows)
        return AccessSnapshot(SessionState(
            joined["id"], expiry, joined["enabled"] is True,
            joined["revoked_at"] is not None, grants,
            joined["global_admin"] is True,
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
