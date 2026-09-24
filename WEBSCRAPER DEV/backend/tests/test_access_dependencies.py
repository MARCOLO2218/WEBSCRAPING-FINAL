"""Rutas de prueba únicamente; no importan repositorios ni abren PostgreSQL."""

from dataclasses import replace
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

from catalog_api.access.dependencies import (
    SESSION_COOKIE, access_clock, authorized_countries, get_access_provider,
    require_admin, require_country,
)
from catalog_api.access.policy import (
    AccessDenied, AccessSnapshot, Action, CountryContext, CountryGrant,
    CountryRole, CountryState, SessionState, require_catalog_product,
)

NOW = datetime(2026, 9, 23, 12, tzinfo=timezone.utc)
COUNTRIES = (
    CountryState("GT", "GTQ", True), CountryState("HN", "HNL", True),
    CountryState("SV", "USD", True), CountryState("NC", "NIO", False),
    CountryState("CR", "CRC", True),
)


class MemoryAccess:
    def __init__(self):
        self.calls = 0
        self.snapshots = {
            "test-session-a": AccessSnapshot(SessionState(
                "ana", NOW + timedelta(hours=1), True, False, (
                    CountryGrant("GT", CountryRole.READER),
                    CountryGrant("HN", CountryRole.OPERATOR),
                    CountryGrant("NC", CountryRole.READER),
                )), COUNTRIES),
            "test-session-b": AccessSnapshot(SessionState(
                "bruno", NOW + timedelta(hours=1), True, False,
                (CountryGrant("SV", CountryRole.READER),)), COUNTRIES),
        }

    def read_access(self, token):
        self.calls += 1
        return self.snapshots.get(token)

    def update_session(self, **changes):
        snapshot = self.snapshots["test-session-a"]
        self.snapshots["test-session-a"] = replace(
            snapshot, session=replace(snapshot.session, **changes))


@pytest.fixture
def api():
    app = FastAPI()
    provider = MemoryAccess()
    read_events = []
    clock = [NOW]
    app.dependency_overrides[get_access_provider] = lambda: provider
    app.dependency_overrides[access_clock] = lambda: clock[0]

    @app.get("/test/countries")
    def countries(contexts: tuple[CountryContext, ...] = Depends(authorized_countries)):
        return contexts

    @app.get("/test/admin")
    def admin(user_id: str = Depends(require_admin)):
        return {"user_id": user_id}

    @app.get("/test/unselected")
    @app.get("/test/{country_code}/products")
    def products(context: CountryContext = Depends(require_country(Action.READ))):
        read_events.append(("products", context.country_code))
        return {"user": context.user_id, "country": context.country_code}

    @app.get("/test/{country_code}/export")
    def export(context: CountryContext = Depends(require_country(Action.EXPORT))):
        read_events.append(("export", context.country_code))
        return {"country": context.country_code}

    @app.post("/test/{country_code}/prices")
    def prices(context: CountryContext = Depends(require_country(Action.UPLOAD_PRICES))):
        read_events.append(("prices", context.country_code))
        return {"country": context.country_code}

    @app.post("/test/{country_code}/jobs")
    def jobs(context: CountryContext = Depends(require_country(Action.RUN_SCRAPER))):
        read_events.append(("jobs", context.country_code))
        return {"country": context.country_code}

    @app.get("/test/{country_code}/products/{product_id}")
    def product(product_id: int,
                context: CountryContext = Depends(require_country(Action.READ))):
        metadata = {1: ("GT", "asignado"), 2: ("HN", "asignado"),
                    3: ("GT", "revision"), 4: ("GT", "no_producto"),
                    5: (None, "revision")}
        country, classification = metadata[product_id]
        try:
            require_catalog_product(context, country, classification)
        except AccessDenied as error:
            raise HTTPException(error.status_code, detail={"code": error.code}) from None
        read_events.append(("product", product_id))
        return {"id": product_id, "country": country}

    @app.get("/test/{country_code}/context")
    def context(first: CountryContext = Depends(require_country(Action.READ)),
                second: CountryContext = Depends(require_country(Action.EXPORT))):
        return {"read": first.country_code, "export": second.country_code}

    with TestClient(app, cookies={SESSION_COOKIE: "test-session-a"}) as client:
        yield client, provider, read_events, clock


def test_missing_cookie_cannot_be_replaced_by_identity_headers(api):
    client, provider, events, _ = api
    client.cookies.clear()
    response = client.get("/test/GT/products?user_id=ana&role=operador", headers={
        "X-User-Id": "ana", "X-Role": "administrador", "X-Country": "GT",
        "Authorization": "Bearer test-session-a",
    })
    assert response.status_code == 401
    assert provider.calls == 0
    assert events == []


def test_unknown_cookie_does_not_authenticate(api):
    client, provider, events, _ = api
    client.cookies.set(SESSION_COOKIE, "unknown-test-session")
    response = client.get("/test/GT/products")
    assert response.status_code == 401
    assert provider.calls == 1
    assert events == []


@pytest.mark.parametrize("country,status", [("SV", 403), ("NC", 403), ("CR", 403),
                                           ("XX", 403), ("gt", 400), ("GTT", 400)])
def test_unassigned_disabled_unknown_and_malformed_countries_are_denied(api, country, status):
    client, _, events, _ = api
    response = client.get(f"/test/{country}/products?country_code=GT", headers={"X-Country": "GT"})
    assert response.status_code == status
    assert events == []


def test_no_implicit_country_even_with_only_one_assignment(api):
    client, provider, events, _ = api
    provider.update_session(grants=(CountryGrant("GT", CountryRole.READER),))
    assert client.get("/test/unselected?country_code=GT").status_code == 400
    assert events == []


def test_reader_can_read_export_but_not_operate_and_operator_is_country_specific(api):
    client, _, events, _ = api
    assert client.get("/test/GT/products").status_code == 200
    assert client.get("/test/GT/export").status_code == 200
    for operation in ("prices", "jobs"):
        assert client.post(f"/test/GT/{operation}?role=operador").status_code == 403
        assert client.post(f"/test/HN/{operation}").status_code == 200
    assert events == [("products", "GT"), ("export", "GT"), ("prices", "HN"), ("jobs", "HN")]


def test_selector_shows_only_assigned_enabled_countries_and_no_selection_is_stored(api):
    client, _, _, _ = api
    countries = client.get("/test/countries").json()
    assert [(c["country_code"], c["currency"]) for c in countries] == [("GT", "GTQ"), ("HN", "HNL")]
    assert client.get("/test/unselected").status_code == 400
    for country in ("GT", "HN", "GT"):
        assert client.get(f"/test/{country}/products").json() == {"user": "ana", "country": country}


def test_second_user_does_not_inherit_first_users_access(api):
    client, _, _, _ = api
    assert client.get("/test/GT/products").status_code == 200
    client.cookies.set(SESSION_COOKIE, "test-session-b")
    assert client.get("/test/GT/products").status_code == 403
    assert client.get("/test/SV/products").json() == {"user": "bruno", "country": "SV"}


@pytest.mark.parametrize("change,status", [({"revoked": True}, 401),
                                          ({"user_enabled": False}, 401), ({"grants": ()}, 403)])
def test_changes_are_effective_on_next_request_without_reusing_old_permissions(api, change, status):
    client, provider, events, _ = api
    assert client.get("/test/GT/products").status_code == 200
    provider.update_session(**change)
    assert client.get("/test/GT/products").status_code == status
    assert provider.calls == 2
    assert events == [("products", "GT")]


def test_expiry_uses_fresh_clock_and_exact_deadline(api):
    client, _, events, clock = api
    assert client.get("/test/GT/products").status_code == 200
    clock[0] = NOW + timedelta(hours=1)
    assert client.get("/test/GT/products").status_code == 401
    assert events == [("products", "GT")]


def test_disabled_country_and_demoted_role_take_effect_on_next_request(api):
    client, provider, _, _ = api
    assert client.post("/test/HN/jobs").status_code == 200
    provider.update_session(grants=(CountryGrant("HN", CountryRole.READER),))
    assert client.post("/test/HN/jobs").status_code == 403
    snapshot = provider.snapshots["test-session-a"]
    provider.snapshots["test-session-a"] = replace(snapshot, countries=tuple(
        replace(c, enabled=False) if c.code == "HN" else c for c in snapshot.countries))
    assert client.get("/test/HN/products").status_code == 403
    assert client.get("/test/countries").json() == []


def test_admin_requires_global_role_without_granting_country_catalog_access(api):
    client, provider, _, _ = api
    assert client.get("/test/admin").status_code == 403
    provider.update_session(global_admin=True, grants=())
    assert client.get("/test/admin").json() == {"user_id": "ana"}
    assert client.get("/test/GT/products").status_code == 403
    provider.update_session(global_admin=False)
    assert client.get("/test/admin").status_code == 403


@pytest.mark.parametrize("product_id", [2, 3, 4, 5])
def test_cross_country_or_unclassified_product_does_not_return_data(api, product_id):
    client, _, events, _ = api
    response = client.get(f"/test/GT/products/{product_id}?country_code=GT&estado=asignado")
    assert response.status_code == 403
    assert response.json() == {"detail": {"code": "acceso_denegado"}}
    assert events == []


def test_assigned_product_in_selected_country_is_allowed(api):
    client, _, events, _ = api
    assert client.get("/test/GT/products/1").json() == {"id": 1, "country": "GT"}
    assert events == [("product", 1)]


def test_multiple_dependencies_share_only_current_request_snapshot(api):
    client, provider, _, _ = api
    assert client.get("/test/GT/context").json() == {"read": "GT", "export": "GT"}
    assert provider.calls == 1
    provider.update_session(grants=())
    assert client.get("/test/GT/context").status_code == 403
    assert provider.calls == 2


def test_provider_missing_or_failed_never_returns_data_or_internal_error(api):
    client, _, events, _ = api
    client.app.dependency_overrides.pop(get_access_provider)
    assert client.get("/test/GT/products").status_code == 503

    class BrokenProvider:
        def read_access(self, token):
            raise RuntimeError("PRIVATE internal failure " + token)

    client.app.dependency_overrides[get_access_provider] = lambda: BrokenProvider()
    response = client.get("/test/GT/products")
    assert response.status_code == 503
    assert response.json() == {"detail": {"code": "acceso_no_disponible"}}
    assert events == []


def test_dependency_rejects_unregistered_action_when_route_is_declared():
    with pytest.raises(ValueError):
        require_country("borrar_todo")
