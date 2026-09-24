"""Rate-limit compartido por PostgreSQL; sin fallback a estado local en memoria."""

import hashlib
import hmac
import ipaddress
import math
import unicodedata
from datetime import datetime, timedelta, timezone
from typing import Protocol

from sqlalchemy import delete, insert, or_, select, update
from sqlalchemy.orm import Session, sessionmaker

from .auth import normalize_username
from .auth_throttle_models import login_attempts


class LoginThrottleUnavailable(Exception):
    """El control compartido no está disponible; el login debe fallar cerrado."""


class LoginThrottle(Protocol):
    def claim_attempt(self, username: str, client_ip: str, now: datetime) -> int | None: ...
    def clear_account(self, username: str) -> None: ...


class DatabaseLoginThrottle:
    """Contadores por identidad/IP serializados con INSERT-conflict y row lock."""

    def __init__(self, session_factory: sessionmaker[Session], *, key_secret: bytes,
                 window: timedelta = timedelta(minutes=15),
                 account_limit: int = 8, ip_limit: int = 30,
                 block_for: timedelta = timedelta(minutes=15)):
        if not isinstance(key_secret, bytes) or len(key_secret) < 32:
            raise ValueError("El secreto HMAC del limitador debe tener al menos 32 bytes")
        if window <= timedelta(0) or block_for <= timedelta(0):
            raise ValueError("Ventana y bloqueo deben ser positivos")
        if account_limit < 1 or ip_limit < 1:
            raise ValueError("Los límites deben ser positivos")
        self._sessions = session_factory
        self._secret = key_secret
        self._window = window
        self._account_limit = account_limit
        self._ip_limit = ip_limit
        self._block_for = block_for

    def _keys(self, username: str, client_ip: str) -> tuple[tuple[str, int], ...]:
        if not isinstance(client_ip, str):
            raise LoginThrottleUnavailable
        try:
            normalized_ip = ipaddress.ip_address(client_ip).compressed
        except ValueError as error:
            raise LoginThrottleUnavailable from error
        try:
            normalized_username = normalize_username(username)
        except ValueError:
            # Inputs inválidos siguen consumiendo el bucket y no se registran crudos.
            normalized_username = unicodedata.normalize("NFKC", str(username)).strip().casefold()[:128]
        values = (("account", normalized_username, self._account_limit),
                  ("ip", normalized_ip, self._ip_limit))
        keys = []
        for scope, value, limit in values:
            digest = hmac.new(self._secret, f"{scope}\0{value}".encode("utf-8"), hashlib.sha256).hexdigest()
            keys.append((digest, limit))
        return tuple(sorted(keys))

    def _account_key(self, username: str) -> str:
        try:
            normalized_username = normalize_username(username)
        except ValueError:
            normalized_username = unicodedata.normalize("NFKC", str(username)).strip().casefold()[:128]
        return hmac.new(self._secret, f"account\0{normalized_username}".encode("utf-8"),
                        hashlib.sha256).hexdigest()

    def retry_after(self, username: str, client_ip: str, now: datetime) -> int | None:
        if now.utcoffset() is None:
            raise ValueError("El reloj debe incluir zona horaria")
        now = now.astimezone(timezone.utc)
        keys = self._keys(username, client_ip)
        try:
            with self._sessions() as db:
                records = db.execute(select(login_attempts.c.key_hash,
                                           login_attempts.c.blocked_until)
                                     .where(login_attempts.c.key_hash.in_([key for key, _ in keys]))
                                     .with_for_update()).all()
            remaining = []
            for _, blocked in records:
                if blocked is None:
                    continue
                if blocked.tzinfo is None:
                    blocked = blocked.replace(tzinfo=timezone.utc)
                if blocked > now:
                    remaining.append(max(0, math.ceil((blocked - now).total_seconds())))
            return max(remaining) if remaining else None
        except Exception as error:
            raise LoginThrottleUnavailable from error

    def claim_attempt(self, username: str, client_ip: str, now: datetime) -> int | None:
        """Atomically reserve an attempt before Argon2, preventing worker races."""
        if now.utcoffset() is None:
            raise ValueError("El reloj debe incluir zona horaria")
        now = now.astimezone(timezone.utc)
        keys = self._keys(username, client_ip)
        try:
            with self._sessions.begin() as db:
                for key, _ in keys:
                    self._insert_if_missing(db, key, now)
                rows = {}
                for key, limit in keys:
                    row = db.execute(select(login_attempts.c.window_started_at,
                                            login_attempts.c.attempt_count,
                                            login_attempts.c.blocked_until)
                                     .where(login_attempts.c.key_hash == key)
                                     .with_for_update()).mappings().one()
                    window_start, attempts, blocked = (
                        row["window_started_at"], row["attempt_count"], row["blocked_until"]
                    )
                    if window_start.tzinfo is None:
                        window_start = window_start.replace(tzinfo=timezone.utc)
                    if blocked is not None and blocked.tzinfo is None:
                        blocked = blocked.replace(tzinfo=timezone.utc)
                    if blocked is not None and blocked > now:
                        rows[key] = (window_start, attempts, blocked, limit)
                        continue
                    if window_start + self._window <= now:
                        window_start, attempts, blocked = now, 0, None
                    rows[key] = (window_start, attempts, blocked, limit)
                active_blocks = [max(0, math.ceil((blocked - now).total_seconds()))
                                 for _, _, blocked, _ in rows.values()
                                 if blocked is not None and blocked > now]
                if active_blocks:
                    return max(active_blocks)
                retry_after = None
                for key, (window_start, attempts, _, limit) in rows.items():
                    attempts += 1
                    blocked = now + self._block_for if attempts > limit else None
                    db.execute(update(login_attempts).where(login_attempts.c.key_hash == key)
                               .values(window_started_at=window_start,
                                       attempt_count=attempts, blocked_until=blocked))
                    if blocked is not None:
                        retry_after = max(retry_after or 0,
                                          math.ceil((blocked - now).total_seconds()))
                return retry_after
        except LoginThrottleUnavailable:
            raise
        except Exception as error:
            raise LoginThrottleUnavailable from error

    def clear_account(self, username: str) -> None:
        key = self._account_key(username)
        try:
            with self._sessions.begin() as db:
                db.execute(delete(login_attempts).where(login_attempts.c.key_hash == key))
        except Exception as error:
            raise LoginThrottleUnavailable from error

    def prune_expired(self, now: datetime, *, retention: timedelta = timedelta(days=1),
                      batch_size: int = 1000) -> int:
        """Remove bounded batches of expired rows; call from a shared maintenance job."""
        if now.utcoffset() is None or retention <= timedelta(0) or not 1 <= batch_size <= 10000:
            raise ValueError("Parámetros de limpieza inválidos")
        now = now.astimezone(timezone.utc)
        cutoff = now - retention
        try:
            with self._sessions.begin() as db:
                stale = (select(login_attempts.c.key_hash)
                         .where(login_attempts.c.window_started_at <= cutoff,
                                or_(login_attempts.c.blocked_until.is_(None),
                                    login_attempts.c.blocked_until <= now))
                         .limit(batch_size))
                if db.get_bind().dialect.name == "postgresql":
                    stale = stale.with_for_update(skip_locked=True)
                result = db.execute(delete(login_attempts).where(
                    login_attempts.c.key_hash.in_(stale),
                ))
                return result.rowcount or 0
        except Exception as error:
            raise LoginThrottleUnavailable from error

    @staticmethod
    def _insert_if_missing(db: Session, key_hash: str, now: datetime) -> None:
        values = dict(key_hash=key_hash, window_started_at=now,
                      attempt_count=0, blocked_until=None)
        dialect = db.get_bind().dialect.name
        if dialect == "postgresql":
            from sqlalchemy.dialects.postgresql import insert as dialect_insert
        elif dialect == "sqlite":
            from sqlalchemy.dialects.sqlite import insert as dialect_insert
        else:
            raise LoginThrottleUnavailable("El motor requiere soporte de upsert atómico")
        db.execute(dialect_insert(login_attempts).values(**values)
                   .on_conflict_do_nothing(index_elements=[login_attempts.c.key_hash]))
