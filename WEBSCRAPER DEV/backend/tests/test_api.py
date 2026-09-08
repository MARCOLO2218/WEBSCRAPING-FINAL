import pytest
from fastapi.testclient import TestClient

from catalog_api.config import load_settings
from catalog_api.main import create_app


def test_health_and_openapi():
    with TestClient(create_app()) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {
            "status": "ok", "service": "catalog-api", "environment": "dev"
        }
        assert response.headers["content-type"] == "application/json"
        schema = client.get("/openapi.json").json()
        assert "/health" in schema["paths"]
        assert client.get("/docs").status_code == 200
        assert client.post("/health").status_code == 405
        assert client.get("/ruta-inexistente").status_code == 404


def test_default_settings_ignore_node_port():
    settings = load_settings({"CATALOG_PORT": "3030"})
    assert (settings.host, settings.port) == ("127.0.0.1", 8000)


def test_custom_settings():
    settings = load_settings({"CATALOG_API_HOST": "127.0.0.1", "CATALOG_API_PORT": "8001"})
    assert settings.port == 8001


@pytest.mark.parametrize("port", ["0", "65536", "invalid", ""])
def test_invalid_port(port):
    with pytest.raises(ValueError, match="CATALOG_API_PORT"):
        load_settings({"CATALOG_API_PORT": port})


def test_empty_host():
    with pytest.raises(ValueError, match="CATALOG_API_HOST"):
        load_settings({"CATALOG_API_HOST": " "})
