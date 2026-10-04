"""Administración de permisos por país; sólo SQLite efímera."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, insert
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from catalog_api.access.dependencies import SESSION_COOKIE
from catalog_api.access.policy import AccessDenied, CountryRole, Action, authorize_country, available_countries
from catalog_api.auth import AuthRepository
from catalog_api.auth_admin_routes import create_auth_admin_router
from catalog_api.auth_models import auth_metadata
from catalog_api.auth_routes import CSRF_COOKIE, CSRF_HEADER
from catalog_api.db.country_models import country_metadata, countries

ORIGIN = "https://testserver"
NOW = datetime(2026, 9, 28, 12, tzinfo=timezone.utc)


def test_admin_can_reset_user_password_and_revoke_existing_session(admin_api):
    client, repository, superadmin_id, user_id, token = admin_api
    actor_id = repository.create_user("reset-admin", "password-admin-2026", account_level="admin")
    issued = repository.login("reset-admin", "password-admin-2026")
    client.cookies.set(SESSION_COOKIE, issued.session_token)
    client.cookies.set(CSRF_COOKIE, issued.csrf_token)
    headers = {"Origin": ORIGIN, CSRF_HEADER: issued.csrf_token}
    response = client.put(f"/auth/admin/users/{user_id}/password", headers=headers,
                          json={"password": "clave-nueva-usuario-2026"})
    assert response.status_code == 204
    with pytest.raises(AccessDenied):
        authorize_country(repository.read_access(token), "GT", Action.READ, NOW)
    assert repository.login("operador", "clave-nueva-usuario-2026").user_id == user_id
    assert client.put(f"/auth/admin/users/{superadmin_id}/password", headers=headers,
                      json={"password": "clave-superadmin-2026"}).status_code == 403


def test_superadmin_changes_level_and_revokes_sessions(admin_api):
    client, repository, superadmin_id, user_id, token = admin_api
    headers = {"Origin": ORIGIN, CSRF_HEADER: client.cookies.get(CSRF_COOKIE)}
    response = client.put(f"/auth/admin/users/{user_id}/level", headers=headers,
                          json={"account_level": "admin"})
    assert response.status_code == 200
    assert response.json()["global_admin"] is True
    with pytest.raises(AccessDenied):
        authorize_country(repository.read_access(token), "GT", Action.READ, NOW)
    response = client.put(f"/auth/admin/users/{user_id}/level", headers=headers,
                          json={"account_level": "usuario"})
    assert response.json()["global_admin"] is False
    assert response.json()["country_permissions"][0]["country_code"] == "GT"
    assert client.put(f"/auth/admin/users/{superadmin_id}/level", headers=headers,
                      json={"account_level": "usuario"}).status_code == 403
    assert client.put(f"/auth/admin/users/{user_id}/level", headers=headers,
                      json={"account_level": "superadmin"}).status_code == 422


def test_admin_cannot_elevate_account_level_even_by_repository(admin_api):
    from catalog_api.auth import AdminActorInvalid
    client, repository, _, user_id, _ = admin_api
    actor_id = repository.create_user("level-admin", "password-admin-2026", account_level="admin")
    issued = repository.login("level-admin", "password-admin-2026")
    client.cookies.set(SESSION_COOKIE, issued.session_token)
    client.cookies.set(CSRF_COOKIE, issued.csrf_token)
    assert client.put(f"/auth/admin/users/{user_id}/level",
                      headers={"Origin": ORIGIN, CSRF_HEADER: issued.csrf_token},
                      json={"account_level": "admin"}).status_code == 403
    with pytest.raises(AdminActorInvalid):
        repository.change_account_level(user_id, "admin", audit_actor_id=actor_id)
    assert next(user for user in repository.list_users_for_admin()["users"] if user["id"] == user_id)["account_level"] == "usuario"


def test_auth_app_composes_only_explicit_access_dependencies(admin_api):
    from catalog_api.auth_app import create_auth_app
    _, repository, _, _, _ = admin_api
    class Throttle:
        def claim_attempt(self, *_): return None
        def clear_account(self, *_): return None
    app = create_auth_app(repository, throttle=Throttle(), allowed_origins=[ORIGIN])
    with TestClient(app, base_url=ORIGIN) as client:
        assert client.get('/auth/me').status_code == 401
        assert client.post('/auth/login', headers={"Origin": ORIGIN},
                           json={"username": "admin", "password": "password-supervisor-2026"}).status_code == 200
        assert client.get('/auth/me').json()['account_level'] == 'superadmin'
        assert client.get('/auth/admin/users').status_code == 200
        assert client.get('/api/products').status_code == 404


class TestHasher:
    def hash(self, value):
        return "test-hash:" + value

    def verify(self, encoded, value):
        return encoded == self.hash(value)

    def check_needs_rehash(self, _encoded):
        return False


@pytest.fixture
def admin_api():
    engine = create_engine("sqlite://", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def attach_catalog_schema(connection, _record):
        connection.execute("ATTACH DATABASE ':memory:' AS catalogo")

    country_metadata.create_all(engine)
    auth_metadata.create_all(engine)
    factory = sessionmaker(engine, expire_on_commit=False)
    with factory.begin() as db:
        db.execute(insert(countries), [
            {"codigo": "GT", "nombre": "Guatemala", "moneda": "GTQ", "habilitado": True},
            {"codigo": "HN", "nombre": "Honduras", "moneda": "HNL", "habilitado": True},
            {"codigo": "SV", "nombre": "El Salvador", "moneda": "USD", "habilitado": True},
            {"codigo": "NC", "nombre": "Nicaragua", "moneda": "NIO", "habilitado": False},
        ])
    repository = AuthRepository(factory, password_hasher=TestHasher(),
                                clock=lambda: NOW, session_ttl=timedelta(hours=2))
    admin_id = repository.create_user("admin", "password-supervisor-2026", global_admin=True)
    user_id = repository.create_user("operador", "password-operador-2026")
    repository.assign_country(user_id, "GT", CountryRole.READER)
    admin_session = repository.login("admin", "password-supervisor-2026")
    user_session = repository.login("operador", "password-operador-2026")
    app = FastAPI()
    app.include_router(create_auth_admin_router(repository, allowed_origins=[ORIGIN]))
    client = TestClient(app, base_url=ORIGIN)
    client.cookies.set(SESSION_COOKIE, admin_session.session_token)
    client.cookies.set(CSRF_COOKIE, admin_session.csrf_token)
    yield client, repository, admin_id, user_id, user_session.session_token
    engine.dispose()


def test_admin_lists_users_and_every_country_without_secret_fields(admin_api):
    client, _repository, _admin_id, user_id, _user_token = admin_api
    response = client.get("/auth/admin/users")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    data = response.json()
    assert {country["code"] for country in data["countries"]} == {"GT", "HN", "SV", "NC"}
    assert next(c for c in data["countries"] if c["code"] == "NC")["enabled"] is False
    user = next(item for item in data["users"] if item["id"] == user_id)
    assert user["country_permissions"] == [{
        "country_code": "GT", "country_name": "Guatemala", "currency": "GTQ",
        "country_enabled": True, "role": "lector",
    }]
    assert all("password" not in key and "token" not in key
               for item in data["users"] for key in item)


def test_missing_or_non_global_admin_cannot_list_accounts(admin_api):
    client, repository, _admin_id, _user_id, user_token = admin_api
    client.cookies.delete(SESSION_COOKIE)
    assert client.get("/auth/admin/users").status_code == 401
    client.cookies.set(SESSION_COOKIE, user_token)
    denied = client.get("/auth/admin/users")
    assert denied.status_code == 403
    assert denied.json()["detail"]["code"] == "acceso_denegado"
    assert repository.list_users_for_admin()["users"]


def test_admin_level_gets_all_enabled_countries_without_explicit_grants(admin_api):
    _client, repository, _admin_id, _user_id, _user_token = admin_api
    admin_id = repository.create_user("regional-admin", "password-admin-2026",
                                      account_level="admin")
    issued = repository.login("regional-admin", "password-admin-2026")
    snapshot = repository.read_access(issued.session_token)
    assert snapshot.session.account_level == "admin"
    assert {context.country_code for context in available_countries(snapshot, NOW)} == {
        "GT", "HN", "SV",
    }
    assert authorize_country(snapshot, "HN", Action.RUN_SCRAPER, NOW).role is CountryRole.OPERATOR
    assert admin_id == snapshot.session.user_id
    with pytest.raises(AccessDenied):
        authorize_country(snapshot, "NC", Action.READ, NOW)


def test_admin_replaces_country_roles_and_next_session_read_is_fresh(admin_api):
    client, repository, _admin_id, user_id, user_token = admin_api
    response = client.put(
        f"/auth/admin/users/{user_id}/country-permissions",
        headers={"Origin": ORIGIN, CSRF_HEADER: client.cookies.get(CSRF_COOKIE)},
        json={"permissions": [
            {"country_code": "HN", "role": "operador"},
            {"country_code": "NC", "role": "lector"},
        ]},
    )
    assert response.status_code == 200
    assert [(item["country_code"], item["role"], item["country_enabled"])
            for item in response.json()["country_permissions"]] == [
        ("HN", "operador", True), ("NC", "lector", False),
    ]
    snapshot = repository.read_access(user_token)
    assert {(grant.country_code, grant.role.value) for grant in snapshot.session.grants} == {
        ("HN", "operador"), ("NC", "lector"),
    }
    assert {item.code: item.enabled for item in snapshot.countries} == {
        "GT": True, "HN": True, "NC": False, "SV": True,
    }


@pytest.mark.parametrize("headers,permissions", [
    ({"Origin": ORIGIN}, [{"country_code": "HN", "role": "operador"}]),
    ({"Origin": "https://evil.example", CSRF_HEADER: "token"}, []),
])
def test_permission_edit_requires_origin_and_double_submit_csrf(admin_api, headers, permissions):
    client, repository, _admin_id, user_id, _user_token = admin_api
    before = repository.list_users_for_admin()
    response = client.put(
        f"/auth/admin/users/{user_id}/country-permissions",
        headers=headers, json={"permissions": permissions},
    )
    assert response.status_code == 403
    assert repository.list_users_for_admin() == before


def test_permission_edit_rejects_matching_but_unissued_csrf_pair(admin_api):
    client, repository, _admin_id, user_id, _user_token = admin_api
    before = repository.list_users_for_admin()
    forged = "A" * 43
    client.cookies.set(CSRF_COOKIE, forged)
    response = client.put(
        f"/auth/admin/users/{user_id}/country-permissions",
        headers={"Origin": ORIGIN, CSRF_HEADER: forged},
        json={"permissions": [{"country_code": "HN", "role": "operador"}]},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "csrf_no_valido"
    assert repository.list_users_for_admin() == before


def test_invalid_or_duplicate_grants_fail_without_partial_changes(admin_api):
    client, repository, _admin_id, user_id, _user_token = admin_api
    before = repository.list_users_for_admin()
    headers = {"Origin": ORIGIN, CSRF_HEADER: client.cookies.get(CSRF_COOKIE)}
    for permissions in (
        [{"country_code": "HN", "role": "operador"},
         {"country_code": "HN", "role": "lector"}],
        [{"country_code": "XX", "role": "lector"}],
        [{"country_code": "GT", "role": "administrador"}],
    ):
        response = client.put(f"/auth/admin/users/{user_id}/country-permissions",
                              headers=headers, json={"permissions": permissions})
        assert response.status_code == 422
        assert repository.list_users_for_admin() == before


def test_unknown_user_is_not_created_and_global_admin_flag_cannot_be_edited(admin_api):
    client, repository, admin_id, _user_id, _user_token = admin_api
    headers = {"Origin": ORIGIN, CSRF_HEADER: client.cookies.get(CSRF_COOKIE)}
    missing = client.put(
        "/auth/admin/users/unknown/country-permissions", headers=headers,
        json={"permissions": [{"country_code": "GT", "role": "operador"}]},
    )
    assert missing.status_code == 404
    forbidden_field = client.put(
        f"/auth/admin/users/{admin_id}/country-permissions", headers=headers,
        json={"global_admin": False, "permissions": []},
    )
    assert forbidden_field.status_code == 422
    admin = next(item for item in repository.list_users_for_admin()["users"]
                 if item["id"] == admin_id)
    assert admin["global_admin"] is True
    assert admin["account_level"] == "superadmin"


def test_superadmin_can_create_reset_and_block_admins_with_session_revocation(admin_api):
    client, repository, _superadmin_id, _user_id, _user_token = admin_api
    headers = {"Origin": ORIGIN, CSRF_HEADER: client.cookies.get(CSRF_COOKIE)}
    created = client.post("/auth/admin/users", headers=headers, json={
        "username": "jefe-regional", "password": "inicio-seguro-2026", "account_level": "admin",
    })
    assert created.status_code == 201
    admin = created.json()
    assert admin["account_level"] == "admin" and admin["global_admin"] is True
    issued = repository.login("jefe-regional", "inicio-seguro-2026")
    reset = client.put(f"/auth/admin/users/{admin['id']}/password", headers=headers,
                       json={"password": "nueva-clave-segura-2026"})
    assert reset.status_code == 204
    assert repository.read_access(issued.session_token).session.revoked is True
    assert repository.login("jefe-regional", "nueva-clave-segura-2026")
    issued_again = repository.login("jefe-regional", "nueva-clave-segura-2026")
    blocked = client.patch(f"/auth/admin/users/{admin['id']}/status", headers=headers,
                           json={"enabled": False})
    assert blocked.status_code == 200 and blocked.json()["enabled"] is False
    assert repository.read_access(issued_again.session_token).session.revoked is True
    assert client.patch(f"/auth/admin/users/{admin['id']}/status", headers=headers,
                        json={"enabled": True}).json()["enabled"] is True
    events = client.get("/auth/admin/users/audit-events").json()
    assert {event["event_type"] for event in events} == {
        "usuario_creado", "contrasena_restablecida", "cuenta_bloqueada",
        "cuenta_desbloqueada",
    }
    assert all("password" not in str(event["details"]).lower() for event in events)


def test_admin_cannot_create_reset_or_block_admin_accounts(admin_api):
    client, repository, _superadmin_id, user_id, _user_token = admin_api
    admin_id = repository.create_user("admin-comun", "clave-admin-comun-2026", account_level="admin")
    issued = repository.login("admin-comun", "clave-admin-comun-2026")
    client.cookies.set(SESSION_COOKIE, issued.session_token)
    client.cookies.set(CSRF_COOKIE, issued.csrf_token)
    headers = {"Origin": ORIGIN, CSRF_HEADER: issued.csrf_token}
    assert client.post("/auth/admin/users", headers=headers, json={
        "username": "nuevo", "password": "inicio-seguro-2026", "account_level": "usuario",
    }).status_code == 403
    assert client.put(f"/auth/admin/users/{admin_id}/password", headers=headers,
                      json={"password": "nueva-clave-segura-2026"}).status_code == 403
    assert client.patch(f"/auth/admin/users/{admin_id}/status", headers=headers,
                        json={"enabled": False}).status_code == 403
    assert client.put(f"/auth/admin/users/{admin_id}/country-permissions", headers=headers,
                      json={"permissions": []}).status_code == 403
    can_edit_user = client.put(f"/auth/admin/users/{user_id}/country-permissions", headers=headers,
                               json={"permissions": [{"country_code": "SV", "role": "lector"}]})
    assert can_edit_user.status_code == 200
    assert client.get("/auth/admin/users/audit-events").status_code == 403
    super_client = TestClient(client.app, base_url=ORIGIN)
    super_client.cookies.set(SESSION_COOKIE, repository.login(
        "admin", "password-supervisor-2026").session_token)
    assert super_client.get("/auth/admin/users/audit-events").status_code == 200


def test_superadmin_cannot_block_itself_or_another_superadmin(admin_api):
    client, repository, superadmin_id, _user_id, _user_token = admin_api
    other_id = repository.create_user("otro-superadmin", "password-admin-2026",
                                      account_level="superadmin")
    headers = {"Origin": ORIGIN, CSRF_HEADER: client.cookies.get(CSRF_COOKIE)}
    self_block = client.patch(f"/auth/admin/users/{superadmin_id}/status", headers=headers,
                              json={"enabled": False})
    peer_block = client.patch(f"/auth/admin/users/{other_id}/status", headers=headers,
                              json={"enabled": False})
    assert self_block.status_code == 422
    assert peer_block.status_code == 403
    assert all(user["enabled"] for user in repository.list_users_for_admin()["users"]
               if user["account_level"] == "superadmin")


def test_admin_router_is_not_mounted_in_legacy_app():
    from catalog_api.main import create_app

    paths = create_app(repository=object()).openapi()["paths"]
    assert "/auth/admin/users" not in paths
