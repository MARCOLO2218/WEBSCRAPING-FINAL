"""Login y sesiones contra SQLite :memory:, sin abrir PostgreSQL."""

import hashlib
import re
from datetime import datetime, timedelta, timezone

import pytest
from argon2 import PasswordHasher
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert, select, update
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from catalog_api.access.dependencies import SESSION_COOKIE
from catalog_api.access.policy import AccessDenied, CountryRole, authenticate, available_countries
from catalog_api.auth import (
    AuthRepository, InvalidCredentials, normalize_username, validate_new_password,
)
from catalog_api.auth_models import auth_metadata, sessions, user_country_roles, users
from catalog_api.auth_routes import CSRF_COOKIE, create_auth_router
from catalog_api.db.country_models import country_metadata, countries

NOW = datetime(2026, 9, 23, 12, tzinfo=timezone.utc)
ALLOWED_ORIGIN = "https://testserver"


@pytest.fixture
def store():
    engine = create_engine("sqlite://", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def attach_catalog_schema(dbapi_connection, _record):
        dbapi_connection.execute("ATTACH DATABASE ':memory:' AS catalogo")

    country_metadata.create_all(engine)
    auth_metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory.begin() as db:
        db.execute(insert(countries), [
            {"codigo": "GT", "nombre": "Guatemala", "moneda": "GTQ", "habilitado": True},
            {"codigo": "HN", "nombre": "Honduras", "moneda": "HNL", "habilitado": True},
            {"codigo": "SV", "nombre": "El Salvador", "moneda": "USD", "habilitado": True},
            {"codigo": "NC", "nombre": "Nicaragua", "moneda": "NIO", "habilitado": False},
            {"codigo": "CR", "nombre": "Costa Rica", "moneda": "CRC", "habilitado": True},
        ])
    clock = [NOW]
    repository = AuthRepository(factory, session_ttl=timedelta(hours=2), clock=lambda: clock[0])
    yield repository, factory, clock
    engine.dispose()


def make_client(repository):
    app = FastAPI()
    class AllowThrottle:
        def claim_attempt(self, *_args):
            return None

        def clear_account(self, *_args):
            return None

    app.include_router(create_auth_router(
        repository, allowed_origins=[ALLOWED_ORIGIN], throttle=AllowThrottle(),
    ))
    return TestClient(app, base_url=ALLOWED_ORIGIN)


def login(client, username="ana", password="Password_segura_2026!"):
    return client.post("/auth/login", headers={"Origin": ALLOWED_ORIGIN}, json={
        "username": username, "password": password,
    })


def test_username_is_normalized_and_password_limits_are_enforced():
    assert normalize_username("  ÁNA  ") == "ána"
    for username in ("", "two words", "x" * 129, "bad\nname"):
        with pytest.raises(ValueError):
            normalize_username(username)
    validate_new_password("á" * 12)
    for password in ("short", "á" * 513):
        with pytest.raises(ValueError):
            validate_new_password(password)


def test_user_hash_is_argon2id_and_adding_duplicate_username_is_rejected(store):
    repository, factory, _ = store
    user_id = repository.create_user("Ana", "Password_segura_2026!")
    with factory() as db:
        row = db.execute(select(users).where(users.c.id == user_id)).mappings().one()
    assert row["username"] == "ana"
    assert row["password_hash"].startswith("$argon2id$")
    assert "Password_segura_2026!" not in row["password_hash"]
    with pytest.raises(ValueError, match="ya existe"):
        repository.create_user(" ANA ", "Otra_password_segura_2026!")
    with factory() as db:
        assert db.execute(select(users.c.id)).scalars().all() == [user_id]


def test_successful_login_rehashes_password_when_argon2_parameters_are_outdated(store):
    _, factory, clock = store
    weak_hasher = PasswordHasher(time_cost=1, memory_cost=8192, parallelism=1)
    repository = AuthRepository(factory, password_hasher=weak_hasher, clock=lambda: clock[0])
    user_id = repository.create_user("ana", "Password_segura_2026!")
    with factory() as db:
        old_hash = db.execute(select(users.c.password_hash).where(
            users.c.id == user_id,
        )).scalar_one()

    repository._hasher = PasswordHasher()
    issued = repository.login("ana", "Password_segura_2026!")
    assert issued.user_id == user_id
    with factory() as db:
        new_hash = db.execute(select(users.c.password_hash).where(
            users.c.id == user_id,
        )).scalar_one()
    assert new_hash.startswith("$argon2id$")
    assert new_hash != old_hash


def test_login_sets_secure_httponly_session_and_double_submit_csrf(store):
    repository, factory, _ = store
    user_id = repository.create_user("ana", "Password_segura_2026!")
    repository.assign_country(user_id, "GT", CountryRole.READER)
    client = make_client(repository)

    response = login(client)
    assert response.status_code == 200
    data = response.json()
    assert data["user_id"] == user_id
    assert data["expires_at"].startswith("2026-09-23T14:00:00")
    session_cookie = response.cookies.get(SESSION_COOKIE)
    csrf_cookie = response.cookies.get(CSRF_COOKIE)
    assert session_cookie and len(session_cookie) == 43
    assert csrf_cookie == data["csrf_token"] and len(csrf_cookie) == 43
    set_cookies = response.headers.get_list("set-cookie")
    auth_cookie = next(value for value in set_cookies if value.startswith(f"{SESSION_COOKIE}="))
    csrf_set_cookie = next(value for value in set_cookies if value.startswith(f"{CSRF_COOKIE}="))
    assert "httponly" in auth_cookie.lower() and "secure" in auth_cookie.lower()
    assert "samesite=lax" in auth_cookie.lower() and "path=/" in auth_cookie.lower()
    assert "httponly" not in csrf_set_cookie.lower() and "secure" in csrf_set_cookie.lower()

    with factory() as db:
        row = db.execute(select(sessions)).mappings().one()
    assert row["token_hash"] == hashlib.sha256(session_cookie.encode("ascii")).hexdigest()
    assert row["csrf_hash"] == hashlib.sha256(csrf_cookie.encode("ascii")).hexdigest()
    assert session_cookie not in row["token_hash"]
    assert csrf_cookie not in row["csrf_hash"]


def test_login_errors_do_not_reveal_user_existence_or_database_failure(store):
    repository = store[0]
    repository.create_user("ana", "Password_segura_2026!")
    client = make_client(repository)
    wrong_password = login(client, "ana", "No_es_la_password_2026!")
    absent_user = login(client, "ausente", "No_es_la_password_2026!")
    assert wrong_password.status_code == absent_user.status_code == 401
    assert wrong_password.json() == absent_user.json() == {
        "detail": {"code": "credenciales_no_validas"},
    }
    assert "ana" not in str(absent_user.json())
    assert "password" not in str(absent_user.json()).lower()


@pytest.mark.parametrize("origin", [None, "https://evil.example", "http://testserver"])
def test_login_rejects_missing_or_unapproved_origins(store, origin):
    repository = store[0]
    repository.create_user("ana", "Password_segura_2026!")
    headers = {} if origin is None else {"Origin": origin}
    response = make_client(repository).post("/auth/login", headers=headers, json={
        "username": "ana", "password": "Password_segura_2026!",
    })
    assert response.status_code == 403
    assert response.json() == {"detail": {"code": "origen_no_permitido"}}


def test_auth_router_refuses_origins_without_https():
    with pytest.raises(ValueError, match="HTTPS"):
        create_auth_router(object(), allowed_origins=["http://localhost:8000"])
    with pytest.raises(ValueError, match="origen HTTPS"):
        create_auth_router(object(), allowed_origins=[])


def test_session_provider_returns_only_current_assigned_enabled_countries(store):
    repository, _, _ = store
    ana = repository.create_user("ana", "Password_segura_2026!")
    bruno = repository.create_user("bruno", "Otra_password_segura_2026!")
    repository.assign_country(ana, "GT", CountryRole.READER)
    repository.assign_country(ana, "NC", CountryRole.OPERATOR)
    repository.assign_country(ana, "CR", CountryRole.OPERATOR)
    repository.assign_country(bruno, "SV", CountryRole.OPERATOR)
    ana_session = repository.login("ANA", "Password_segura_2026!")
    bruno_session = repository.login("bruno", "Otra_password_segura_2026!")
    snapshot = repository.read_access(ana_session.session_token)
    assert snapshot.session.user_id == ana
    assert {(grant.country_code, grant.role.value) for grant in snapshot.session.grants} == {
        ("GT", "lector"), ("NC", "operador"), ("CR", "operador"),
    }
    assert {country.code: country.enabled for country in snapshot.countries} == {
        "GT": True, "NC": False, "CR": True,
    }
    assert repository.read_access(bruno_session.session_token).session.user_id == bruno
    assert repository.read_access("tampered-token") is None


def test_disabled_user_revoked_assignment_and_disabled_country_apply_on_next_read(store):
    repository, factory, _ = store
    user_id = repository.create_user("ana", "Password_segura_2026!")
    repository.assign_country(user_id, "GT", CountryRole.READER)
    token = repository.login("ana", "Password_segura_2026!").session_token
    assert repository.read_access(token).session.grants
    with factory.begin() as db:
        db.execute(update(countries).where(countries.c.codigo == "GT").values(habilitado=False))
    snapshot = repository.read_access(token)
    assert snapshot.countries[0].enabled is False
    assert available_countries(snapshot, repository.now()) == ()
    with factory.begin() as db:
        db.execute(update(countries).where(countries.c.codigo == "GT").values(habilitado=True))
        db.execute(user_country_roles.delete().where(
            user_country_roles.c.user_id == user_id,
        ))
    assert repository.read_access(token).session.grants == ()
    with factory.begin() as db:
        db.execute(update(users).where(users.c.id == user_id).values(enabled=False))
    assert repository.read_access(token).session.user_enabled is False


@pytest.mark.parametrize("mode", ["wrong-csrf", "missing-header", "missing-cookie"])
def test_logout_requires_origin_and_double_submit_csrf(store, mode):
    repository = store[0]
    repository.create_user("ana", "Password_segura_2026!")
    client = make_client(repository)
    login_data = login(client)
    token = login_data.cookies.get(SESSION_COOKIE)
    csrf = login_data.cookies.get(CSRF_COOKIE)
    client.cookies.update(login_data.cookies)
    if mode == "missing-header":
        headers = {"Origin": ALLOWED_ORIGIN}
    elif mode == "missing-cookie":
        client.cookies.delete(CSRF_COOKIE)
        headers = {"Origin": ALLOWED_ORIGIN, "X-CSRF-Token": csrf}
    else:
        headers = {"Origin": ALLOWED_ORIGIN, "X-CSRF-Token": "A" * 43}
    response = client.post("/auth/logout", headers=headers)
    assert response.status_code == 403
    assert repository.read_access(token) is not None


def test_logout_revokes_server_session_and_deletes_both_cookies(store):
    repository = store[0]
    repository.create_user("ana", "Password_segura_2026!")
    client = make_client(repository)
    issued = login(client)
    token, csrf = issued.cookies.get(SESSION_COOKIE), issued.cookies.get(CSRF_COOKIE)
    client.cookies.update(issued.cookies)
    response = client.post("/auth/logout", headers={
        "Origin": ALLOWED_ORIGIN, "X-CSRF-Token": csrf,
    })
    assert response.status_code == 204
    assert repository.read_access(token).session.revoked is True
    delete_cookies = response.headers.get_list("set-cookie")
    assert any(value.startswith(f"{SESSION_COOKIE}=") and "max-age=0" in value.lower()
               for value in delete_cookies)
    assert any(value.startswith(f"{CSRF_COOKIE}=") and "max-age=0" in value.lower()
               for value in delete_cookies)
    assert client.get("/auth/me").status_code == 401


def test_context_endpoint_never_selects_or_grants_a_country_implicitly(store):
    repository = store[0]
    user_id = repository.create_user("ana", "Password_segura_2026!")
    client = make_client(repository)
    issued = login(client)
    assert client.get("/auth/me").status_code == 200
    assert client.get("/auth/me").json() == {"user_id": user_id, "countries": []}
    client.cookies.update(issued.cookies)
    repository.assign_country(user_id, "HN", CountryRole.READER)
    assert client.get("/auth/me").json()["countries"] == [{"code": "HN", "currency": "HNL"}]
    # El endpoint da opciones, no selecciona un país ni crea acceso a otro.
    assert repository.read_access(issued.cookies.get(SESSION_COOKIE)).session.user_id == user_id


def test_revoked_expired_and_unknown_sessions_are_rejected(store):
    repository, _, clock = store
    repository.create_user("ana", "Password_segura_2026!")
    issued = repository.login("ana", "Password_segura_2026!")
    assert repository.read_access(issued.session_token) is not None
    clock[0] += timedelta(hours=2)
    snapshot = repository.read_access(issued.session_token)
    assert snapshot.session.expires_at <= clock[0]
    assert snapshot.session.revoked is False
    with pytest.raises(AccessDenied) as error:
        authenticate(snapshot, clock[0])
    assert error.value.status_code == 401
    assert repository.read_access("x" * 43) is None


def test_user_role_assignment_does_not_autocreate_unknown_country(store):
    repository = store[0]
    user_id = repository.create_user("ana", "Password_segura_2026!")
    with pytest.raises(ValueError, match="desconocido"):
        repository.assign_country(user_id, "XX", CountryRole.READER)
    with pytest.raises(ValueError, match="inválida"):
        repository.assign_country(user_id, "GT", "administrador")


def test_auth_routes_remain_out_of_the_existing_catalog_app():
    from catalog_api.main import create_app
    paths = create_app(repository=object()).openapi()["paths"]
    assert "/auth/login" not in paths
    assert "/auth/me" not in paths
    assert "/auth/logout" not in paths
