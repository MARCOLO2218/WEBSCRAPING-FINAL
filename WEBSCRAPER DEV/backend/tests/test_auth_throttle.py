"""Rate-limit, privacidad y fail-closed contra SQLite efímera."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert, select
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from catalog_api.auth import AuthRepository
from catalog_api.auth_routes import create_auth_router
from catalog_api.auth_throttle import DatabaseLoginThrottle, LoginThrottleUnavailable
from catalog_api.auth_throttle_models import login_attempts, throttle_metadata
from catalog_api.auth_models import auth_metadata
from catalog_api.db.country_models import country_metadata, countries

NOW = datetime(2026, 9, 24, 12, tzinfo=timezone.utc)
ORIGIN = "https://testserver"
KEY_SECRET = b"local-only-test-key-with-at-least-32-bytes"


@pytest.fixture
def store():
    engine = create_engine("sqlite://", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def attach_schema(connection, _record):
        connection.execute("ATTACH DATABASE ':memory:' AS catalogo")

    country_metadata.create_all(engine)
    auth_metadata.create_all(engine)
    throttle_metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory.begin() as db:
        db.execute(insert(countries).values(
            codigo="GT", nombre="Guatemala", moneda="GTQ", habilitado=True,
        ))
    clock = [NOW]
    repository = AuthRepository(factory, clock=lambda: clock[0])
    throttle = DatabaseLoginThrottle(
        factory, key_secret=KEY_SECRET, window=timedelta(minutes=15),
        account_limit=2, ip_limit=3, block_for=timedelta(minutes=5),
    )
    yield repository, throttle, factory, clock
    engine.dispose()


def test_account_and_ip_counters_are_separate_and_only_hmac_keys_are_stored(store):
    _, throttle, factory, _ = store
    throttle.claim_attempt("ana", "192.0.2.1", NOW)
    throttle.claim_attempt("ANA", "192.0.2.2", NOW)
    assert throttle.claim_attempt("ana", "198.51.100.9", NOW) == 300

    assert throttle.retry_after("Ana", "198.51.100.9", NOW) == 300
    assert throttle.retry_after("bruno", "192.0.2.1", NOW) is None
    with factory() as db:
        rows = db.execute(select(login_attempts)).mappings().all()
    assert all(len(row["key_hash"]) == 64 for row in rows)
    assert all("ana" not in str(row).lower() and "192.0.2." not in str(row) for row in rows)


def test_ip_threshold_and_window_expiry_reset(store):
    _, throttle, _, clock = store
    for name in ("ana", "bruno", "carla"):
        throttle.claim_attempt(name, "192.0.2.8", clock[0])
    assert throttle.claim_attempt("dario", "192.0.2.8", clock[0]) == 300

    clock[0] += timedelta(minutes=16)
    assert throttle.retry_after("dario", "192.0.2.8", clock[0]) is None
    throttle.claim_attempt("dario", "192.0.2.8", clock[0])
    assert throttle.retry_after("dario", "192.0.2.8", clock[0]) is None


def test_success_clear_removes_only_account_bucket_and_invalid_ip_fails_closed(store):
    _, throttle, factory, _ = store
    throttle.claim_attempt("ana", "192.0.2.1", NOW)
    throttle.claim_attempt("ana", "192.0.2.1", NOW)
    throttle.clear_account("ana")
    throttle.claim_attempt("bruno", "192.0.2.1", NOW)
    assert throttle.claim_attempt("carla", "192.0.2.1", NOW) == 300
    with factory() as db:
        assert len(db.execute(select(login_attempts.c.key_hash)).all()) == 3
    with pytest.raises(LoginThrottleUnavailable):
        throttle.claim_attempt("ana", "client-controlled-name", NOW)
    with pytest.raises(ValueError, match="secreto HMAC"):
        DatabaseLoginThrottle(factory, key_secret=b"short")


def test_expired_counter_cleanup_is_bounded_and_preserves_live_blocks(store):
    _, throttle, factory, _ = store
    throttle.claim_attempt("ana", "192.0.2.1", NOW - timedelta(days=2))
    throttle.claim_attempt("bruno", "192.0.2.2", NOW)
    with factory.begin() as db:
        db.execute(login_attempts.update().where(
            login_attempts.c.key_hash == throttle._keys("bruno", "192.0.2.2")[0][0],
        ).values(blocked_until=NOW + timedelta(minutes=5)))

    assert throttle.prune_expired(NOW, retention=timedelta(days=1), batch_size=1) == 1
    assert throttle.retry_after("bruno", "192.0.2.2", NOW) == 300
    with factory() as db:
        assert len(db.execute(select(login_attempts.c.key_hash)).all()) == 3


def test_router_returns_generic_429_before_checking_password(store):
    repository, throttle, _, _ = store
    repository.create_user("ana", "Password_segura_2026!")
    app = FastAPI()
    app.include_router(create_auth_router(
        repository, allowed_origins=[ORIGIN], throttle=throttle,
    ))
    client = TestClient(app, base_url=ORIGIN, client=("192.0.2.55", 8080))
    headers = {"Origin": ORIGIN}
    wrong = {"username": "ana", "password": "Otra_password_segura_2026!"}
    first = client.post("/auth/login", headers=headers, json=wrong)
    second = client.post("/auth/login", headers=headers, json=wrong)
    blocked = client.post("/auth/login", headers=headers, json={
        "username": "ana", "password": "Password_segura_2026!",
    })
    assert first.status_code == second.status_code == 401
    assert first.json() == second.json() == {"detail": {"code": "credenciales_no_validas"}}
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "300"
    assert "ana" not in str(blocked.json()).lower()


def test_successful_login_clears_prior_account_attempts(store):
    repository, throttle, _, _ = store
    repository.create_user("ana", "Password_segura_2026!")
    ip = "192.0.2.56"
    throttle.claim_attempt("ana", ip, NOW)
    app = FastAPI()
    app.include_router(create_auth_router(
        repository, allowed_origins=[ORIGIN], throttle=throttle,
    ))
    client = TestClient(app, base_url=ORIGIN, client=(ip, 8080))
    response = client.post("/auth/login", headers={"Origin": ORIGIN,
                                                     "X-Forwarded-For": "203.0.113.99"}, json={
        "username": "ana", "password": "Password_segura_2026!",
    })
    assert response.status_code == 200
    assert throttle.retry_after("ana", ip, NOW) is None
    throttle.claim_attempt("ana", "192.0.2.57", NOW)
    throttle.claim_attempt("ana", "192.0.2.58", NOW)
    assert throttle.claim_attempt("ana", "192.0.2.59", NOW) == 300


def test_router_requires_limit_store_and_fails_closed_when_it_is_unavailable():
    with pytest.raises(ValueError, match="limitador compartido"):
        create_auth_router(object(), allowed_origins=[ORIGIN])

    class Unavailable:
        def claim_attempt(self, *_args):
            raise LoginThrottleUnavailable

    class Repository:
        def now(self):
            return NOW

        def login(self, *_args):
            raise AssertionError("No debe comprobar contraseñas sin límite disponible")

    app = FastAPI()
    app.include_router(create_auth_router(
        Repository(), allowed_origins=[ORIGIN], throttle=Unavailable(),
    ))
    client = TestClient(app, base_url=ORIGIN, client=("192.0.2.6", 8080))
    response = client.post("/auth/login", headers={"Origin": ORIGIN}, json={
        "username": "ana", "password": "Password_segura_2026!",
    })
    assert response.status_code == 503
    assert response.json() == {"detail": {"code": "autenticacion_no_disponible"}}
