"""Persistence shared by login workers; migration 044 owns table creation."""

from sqlalchemy import CheckConstraint, Column, DateTime, Index, Integer, MetaData, String, Table

throttle_metadata = MetaData(schema="catalogo")
login_attempts = Table(
    "login_intentos", throttle_metadata,
    Column("key_hash", String(64), primary_key=True),
    Column("window_started_at", DateTime(timezone=True), nullable=False),
    Column("attempt_count", Integer, nullable=False),
    Column("blocked_until", DateTime(timezone=True)),
    CheckConstraint("attempt_count >= 0", name="ck_login_intentos_no_negative"),
)
Index("ix_login_intentos_blocked_until", login_attempts.c.blocked_until)
