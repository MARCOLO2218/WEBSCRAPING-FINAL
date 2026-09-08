import httpx
import pytest

from catalog_api.parity import FILTERS, compare, main, same_json, validate_cases, validate_url


CASES = [{"name": "sin-filtros", "params": {}}] + [
    {"name": key, "params": {key: "Colchón & especial"}} for key in sorted(FILTERS)
] + [{"name": "combinados", "params": dict.fromkeys(FILTERS, "valor")}]


def response(request):
    if request.url.path.endswith(".csv"):
        return httpx.Response(200, content=b'\xef\xbb\xbf"producto"\n', headers={
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="catalogo_comercial_comparativo.csv"'})
    return httpx.Response(200, json=[{"id": "9007199254740993", "precio": 1}] if
                          request.url.path.endswith("products") else {"total": 1})


def test_all_routes_filters_and_get_only():
    requests = []
    def handler(request):
        requests.append(request)
        return response(request)
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        report = compare(client, "http://node", "http://api", CASES)
    assert report["matches"]
    assert len(report["results"]) == 25
    assert len(requests) == 100
    assert all(r.method == "GET" for r in requests)
    for case in CASES:
        for route in ("products", "summary", "export.csv"):
            assert any(r.url.path == "/api/" + route and dict(r.url.params) == case["params"] for r in requests)


@pytest.mark.parametrize("failure", ["http", "json", "mime", "timeout", "csv", "body", "unstable", "download"])
def test_failures_never_pass_or_leak_response(failure):
    count = 0
    def handler(request):
        nonlocal count
        if request.url.host == "api":
            count += 1
            if failure == "http":
                return httpx.Response(500, text="secret-password")
            if failure == "timeout":
                raise httpx.ReadTimeout("secret-password", request=request)
            if failure == "mime":
                return httpx.Response(200, text="secret-password")
            if failure == "json":
                return httpx.Response(200, content=b"invalid", headers={"content-type": "application/json"})
            if failure in {"csv", "download"} and request.url.path.endswith(".csv"):
                original = response(request)
                headers = dict(original.headers)
                if failure == "download":
                    headers.pop("content-disposition")
                return httpx.Response(200, content=b"different", headers=headers)
            if failure in {"body", "unstable"} and request.url.path.endswith("latest-run"):
                return httpx.Response(200, json={"total": count if failure == "unstable" else 2})
        return response(request)
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        report = compare(client, "http://node", "http://api", CASES)
    assert not report["matches"]
    assert "secret-password" not in str(report)
    if failure == "unstable":
        assert report["results"][0]["status"] == "inestable"


def test_json_comparison_preserves_types_fields_and_order():
    assert same_json({"a": 1, "b": None}, {"b": None, "a": 1.0})
    for a, b in [(True, 1), ("1", 1), ({}, {"a": None}), ([1, 2], [2, 1])]:
        assert not same_json(a, b)


def test_invalid_config_before_requests(tmp_path):
    with pytest.raises(ValueError):
        validate_cases(CASES[:-1])
    with pytest.raises(ValueError):
        validate_url("http://user:password@localhost:3030")
    assert main(["--node-url", "http://node", "--api-url", "http://api",
                 "--cases", str(tmp_path / "missing.json")]) == 2
