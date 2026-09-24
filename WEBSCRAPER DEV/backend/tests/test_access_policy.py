"""Autorización regional aislada: sin conexiones, credenciales ni servicios."""

from dataclasses import FrozenInstanceError, replace
from datetime import datetime, timedelta, timezone

import pytest

from catalog_api.access.policy import (
    AccessDenied, AccessSnapshot, Action, CountryGrant, CountryRole,
    CountryState, SessionState, authenticate, authorize_admin,
    authorize_country, available_countries, require_catalog_product,
    require_resource_country,
)


NOW = datetime(2026, 9, 23, 12, tzinfo=timezone.utc)
GT = CountryState("GT", "GTQ", True)
SV = CountryState("SV", "USD", True)


def snapshot(*, user="ana", role=CountryRole.READER, country="GT", countries=(GT, SV)):
    return AccessSnapshot(
        SessionState(user, NOW + timedelta(hours=1), True, False,
                     (CountryGrant(country, role),)),
        countries,
    )


def denied(call, status=403, code="acceso_denegado"):
    with pytest.raises(AccessDenied) as error:
        call()
    assert (error.value.status_code, error.value.code) == (status, code)


@pytest.mark.parametrize("role,action,allowed", [
    (CountryRole.READER, Action.READ, True),
    (CountryRole.READER, Action.EXPORT, True),
    (CountryRole.READER, Action.UPLOAD_PRICES, False),
    (CountryRole.READER, Action.RUN_SCRAPER, False),
    (CountryRole.OPERATOR, Action.READ, True),
    (CountryRole.OPERATOR, Action.EXPORT, True),
    (CountryRole.OPERATOR, Action.UPLOAD_PRICES, True),
    (CountryRole.OPERATOR, Action.RUN_SCRAPER, True),
])
def test_permissions_are_scoped_to_country_role(role, action, allowed):
    state = snapshot(role=role)
    check = lambda: authorize_country(state, "GT", action, NOW)
    if allowed:
        context = check()
        assert (context.user_id, context.country_code, context.currency, context.role) == (
            "ana", "GT", "GTQ", role,
        )
    else:
        denied(check)


def test_two_users_cannot_inherit_each_others_country_access():
    ana = snapshot(user="ana", country="GT")
    luis = snapshot(user="luis", country="SV", role=CountryRole.OPERATOR)
    assert authorize_country(ana, "GT", Action.READ, NOW).user_id == "ana"
    assert authorize_country(luis, "SV", Action.RUN_SCRAPER, NOW).user_id == "luis"
    denied(lambda: authorize_country(ana, "SV", Action.READ, NOW))
    denied(lambda: authorize_country(luis, "GT", Action.READ, NOW))


@pytest.mark.parametrize("selection", [None, ""])
def test_even_one_assigned_country_requires_explicit_selection(selection):
    state = snapshot(countries=(GT,))
    assert [context.country_code for context in available_countries(state, NOW)] == ["GT"]
    denied(lambda: authorize_country(state, selection, Action.READ, NOW), 400, "pais_requerido")


@pytest.mark.parametrize("selection", ["gt", " GT", "GT ", "G", "GTT", "G1", "GＴ", "*"])
def test_country_selection_is_not_silently_normalized(selection):
    denied(lambda: authorize_country(snapshot(), selection, Action.READ, NOW), 400, "pais_invalido")


@pytest.mark.parametrize("state,selection", [
    (snapshot(country="HN"), "HN"),  # Una asignación no crea el país ausente.
    (snapshot(countries=(replace(GT, enabled=False), SV)), "GT"),
    (snapshot(), "SV"),
    (replace(snapshot(), session=replace(snapshot().session, grants=())), "GT"),
])
def test_unknown_disabled_or_unassigned_country_is_denied(state, selection):
    denied(lambda: authorize_country(state, selection, Action.READ, NOW))


@pytest.mark.parametrize("changes", [
    {"revoked": True},
    {"user_enabled": False},
    {"expires_at": NOW},
    {"expires_at": NOW - timedelta(microseconds=1)},
    {"expires_at": NOW.replace(tzinfo=None) + timedelta(hours=1)},
    {"user_id": ""},
    {"user_id": "  "},
])
def test_invalid_session_precedes_country_permission_checks(changes):
    state = snapshot()
    state = replace(state, session=replace(state.session, **changes))
    denied(lambda: authorize_country(state, "GT", Action.READ, NOW), 401, "sesion_no_valida")
    denied(lambda: available_countries(state, NOW), 401, "sesion_no_valida")
    denied(lambda: authorize_admin(state, NOW), 401, "sesion_no_valida")


@pytest.mark.parametrize("state", [None, AccessSnapshot(None, (GT, SV))])
def test_missing_session_is_not_anonymous_catalog_access(state):
    denied(lambda: authorize_country(state, "GT", Action.READ, NOW), 401, "sesion_no_valida")


def test_timezone_aware_expiration_is_compared_as_an_instant():
    state = snapshot()
    local_expiry = (NOW + timedelta(seconds=1)).astimezone(timezone(timedelta(hours=-6)))
    state = replace(state, session=replace(state.session, expires_at=local_expiry))
    assert authenticate(state, NOW).user_id == "ana"
    denied(lambda: authenticate(state, NOW + timedelta(seconds=1)), 401, "sesion_no_valida")


def test_server_clock_must_have_timezone():
    with pytest.raises(ValueError, match="zona horaria"):
        authenticate(snapshot(), NOW.replace(tzinfo=None))


def test_new_state_revokes_previously_granted_access():
    original = snapshot()
    assert authorize_country(original, "GT", Action.READ, NOW).country_code == "GT"
    no_grants = replace(original, session=replace(original.session, grants=()))
    revoked = replace(original, session=replace(original.session, revoked=True))
    denied(lambda: authorize_country(no_grants, "GT", Action.READ, NOW))
    denied(lambda: authorize_country(revoked, "GT", Action.READ, NOW), 401, "sesion_no_valida")


def test_global_admin_does_not_bypass_country_grants_or_reader_role():
    state = snapshot()
    admin = replace(state, session=replace(state.session, global_admin=True))
    assert authorize_admin(admin, NOW) == "ana"
    assert authorize_country(admin, "GT", Action.READ, NOW).country_code == "GT"
    denied(lambda: authorize_country(admin, "GT", Action.UPLOAD_PRICES, NOW))
    denied(lambda: authorize_country(admin, "SV", Action.READ, NOW))
    no_grants = replace(admin, session=replace(admin.session, grants=()))
    assert authorize_admin(no_grants, NOW) == "ana"
    assert available_countries(no_grants, NOW) == ()
    denied(lambda: authorize_country(no_grants, "GT", Action.READ, NOW))
    denied(lambda: authorize_admin(state, NOW))


def test_future_country_requires_enabled_catalog_entry_and_assignment():
    costa_rica = CountryState("CR", "CRC", True)
    state = snapshot(countries=(GT, SV, costa_rica))
    denied(lambda: authorize_country(state, "CR", Action.READ, NOW))
    granted = replace(state, session=replace(state.session, grants=state.session.grants + (
        CountryGrant("CR", CountryRole.OPERATOR),)))
    context = authorize_country(granted, "CR", Action.RUN_SCRAPER, NOW)
    assert (context.country_code, context.currency) == ("CR", "CRC")
    disabled = replace(granted, countries=(GT, SV, replace(costa_rica, enabled=False)))
    denied(lambda: authorize_country(disabled, "CR", Action.READ, NOW))


def test_nicaragua_retains_business_country_code():
    state = snapshot(country="NC", countries=(CountryState("NC", "NIO", True),))
    assert authorize_country(state, "NC", Action.READ, NOW).currency == "NIO"
    denied(lambda: authorize_country(state, "NI", Action.READ, NOW))


@pytest.mark.parametrize("additional", [GT, replace(GT, enabled=False)])
def test_duplicate_country_entries_deny_instead_of_choosing_one(additional):
    state = snapshot(countries=(GT, additional))
    denied(lambda: authorize_country(state, "GT", Action.READ, NOW))
    assert available_countries(state, NOW) == ()


@pytest.mark.parametrize("second_role", [CountryRole.READER, CountryRole.OPERATOR])
def test_duplicate_grants_do_not_select_the_more_permissive_role(second_role):
    state = snapshot()
    state = replace(state, session=replace(state.session, grants=state.session.grants + (
        CountryGrant("GT", second_role),)))
    denied(lambda: authorize_country(state, "GT", Action.READ, NOW))
    denied(lambda: authorize_country(state, "GT", Action.RUN_SCRAPER, NOW))
    assert available_countries(state, NOW) == ()


@pytest.mark.parametrize("role", ["administrador", "superuser", "", None])
def test_unknown_role_does_not_grant_access(role):
    denied(lambda: authorize_country(snapshot(role=role), "GT", Action.READ, NOW))


@pytest.mark.parametrize("action", ["borrar", "*", "", None])
def test_unknown_action_is_denied_even_for_operator(action):
    denied(lambda: authorize_country(snapshot(role=CountryRole.OPERATOR), "GT", action, NOW))


@pytest.mark.parametrize("currency", ["", "gtq", "GT", "GTQ ", "12Q"])
def test_invalid_country_currency_cannot_form_context(currency):
    state = snapshot(countries=(replace(GT, currency=currency),))
    denied(lambda: authorize_country(state, "GT", Action.READ, NOW))


def test_selector_only_lists_valid_assigned_enabled_countries():
    hn = CountryState("HN", "HNL", False)
    nc = CountryState("NC", "NIO", True)
    cr = CountryState("CR", "CRC", True)
    state = snapshot(countries=(nc, SV, GT, hn, cr))
    state = replace(state, session=replace(state.session, grants=(
        CountryGrant("NC", CountryRole.OPERATOR),
        CountryGrant("GT", CountryRole.READER),
        CountryGrant("HN", CountryRole.READER),
        CountryGrant("CR", "rol_invalido"),
    )))
    contexts = available_countries(state, NOW)
    assert [(c.country_code, c.currency, c.role) for c in contexts] == [
        ("GT", "GTQ", CountryRole.READER), ("NC", "NIO", CountryRole.OPERATOR),
    ]


@pytest.mark.parametrize("country,classification", [
    ("GT", "revision"),
    ("GT", "no_producto"),
    ("GT", "desconocido"),
    (None, "asignado"),
    (None, "revision"),
    (None, "no_producto"),
    ("SV", "asignado"),
    ("", "asignado"),
])
def test_catalog_products_must_be_assigned_to_authorized_country(country, classification):
    context = authorize_country(snapshot(), "GT", Action.READ, NOW)
    denied(lambda: require_catalog_product(context, country, classification))


def test_resource_with_correct_country_and_classification_is_allowed():
    context = authorize_country(snapshot(), "GT", Action.READ, NOW)
    assert require_resource_country(context, "GT") is None
    assert require_catalog_product(context, "GT", "asignado") is None


def test_contexts_are_immutable_and_independent_between_tabs():
    state = snapshot()
    state = replace(state, session=replace(state.session, grants=(
        CountryGrant("GT", CountryRole.READER), CountryGrant("SV", CountryRole.OPERATOR),
    )))
    gt_context = authorize_country(state, "GT", Action.READ, NOW)
    sv_context = authorize_country(state, "SV", Action.RUN_SCRAPER, NOW)
    with pytest.raises(FrozenInstanceError):
        gt_context.country_code = "SV"
    assert (gt_context.country_code, gt_context.currency, gt_context.role) == (
        "GT", "GTQ", CountryRole.READER,
    )
    assert (sv_context.country_code, sv_context.currency, sv_context.role) == (
        "SV", "USD", CountryRole.OPERATOR,
    )
    denied(lambda: require_catalog_product(gt_context, "SV", "asignado"))
    assert require_catalog_product(sv_context, "SV", "asignado") is None


def test_snapshot_and_session_copy_mutable_inputs():
    grants = [CountryGrant("GT", CountryRole.READER)]
    countries = [GT]
    session = SessionState("ana", NOW + timedelta(hours=1), True, False, grants)
    state = AccessSnapshot(session, countries)
    grants.clear()
    countries.clear()
    assert available_countries(state, NOW)[0].country_code == "GT"
    with pytest.raises(FrozenInstanceError):
        session.global_admin = True
    with pytest.raises(FrozenInstanceError):
        state.session = None
