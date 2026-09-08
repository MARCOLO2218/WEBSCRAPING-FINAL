import pytest
from fastapi.testclient import TestClient

from catalog_api.main import create_app
from catalog_api.models import ProductResponse


def product():
    row = {name: None for name, field in ProductResponse.model_fields.items() if field.is_required()}
    row.update(id="9007199254740993", run_id="9007199254740994",
               producto="Cama", sitio_fuente="FACENCO", precio_numero=1500,
               diferencia_facenco=0, etiqueta_diferencia="Igual a FACENCO")
    return row


class Repository:
    def products(self, params):
        self.params = params
        return [product()]

    def latest_run(self):
        return dict(run_id="9007199254740994", semana_run=36, semana_inicio="2026-08-31",
                    started_at="2026-09-07T00:00:00.000Z", total_products=1)


def test_nonempty_contract_and_all_filters():
    repo = Repository()
    with TestClient(create_app(repo)) as client:
        params = dict(semana="36", tienda="FACENCO", marca="FACENCO",
                      categoria="Colchones", disponibilidad="Disponible", q="Cama")
        response = client.get("/api/products", params=params)
        assert response.status_code == 200
        assert response.json() == [product()]
        assert "precio_regular_min" not in response.json()[0]
        assert repo.params == params
        assert client.get("/api/latest-run").json() == repo.latest_run()
        assert client.get("/api/summary", params=params).json() == dict(
            total=1, precio_promedio=1500, mas_baratos=0, mas_caros=0, tiendas=1)
        assert repo.params == params


def test_null_ranges_and_extra_columns_survive():
    repo = Repository()
    row = {**product(), "precio_regular_min": None, "columna_adicional": "conservar"}
    repo.products = lambda params: [row]
    with TestClient(create_app(repo)) as client:
        assert client.get("/api/products").json() == [row]


@pytest.mark.parametrize("path", ["products", "latest-run", "summary"])
def test_schema_and_methods(path):
    with TestClient(create_app(Repository())) as client:
        schema = client.get("/openapi.json").json()
        operation = schema["paths"][f"/api/{path}"]["get"]
        assert operation["responses"]["200"]["content"]["application/json"]["schema"]
        assert operation["responses"]["500"]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/ErrorResponse"}
        assert client.post(f"/api/{path}").status_code == 405
        fields = schema["components"]["schemas"]["ProductResponse"]
        assert "id" in fields["required"]
        assert "precio_regular_min" not in fields["required"]
        assert fields["properties"]["id"]["type"] == "string"


@pytest.mark.parametrize("path", ["products", "latest-run", "summary"])
def test_invalid_repository_output_is_generic_error(path):
    repo = Repository()
    repo.products = lambda params: [{"id": "secret-internal-data"}]
    repo.latest_run = lambda: {"run_id": 123, "secret": "secret-internal-data"}
    with TestClient(create_app(repo)) as client:
        response = client.get(f"/api/{path}")
        assert response.status_code == 500
        assert set(response.json()) == {"error"}
        assert "secret" not in response.text
