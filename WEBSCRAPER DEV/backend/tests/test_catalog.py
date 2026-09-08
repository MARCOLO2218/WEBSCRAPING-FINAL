from datetime import datetime, timezone
from fastapi.testclient import TestClient
from catalog_api.main import create_app
from catalog_api.catalog import build_filters, compare, merge, serialize, CatalogRepository


def test_filters_are_bound():
    clause, values = build_filters({"tienda": "x' OR 1=1", "q": "cama"})
    assert "OR 1=1" not in clause
    assert values == ["x' OR 1=1", "%cama%", "%cama%", "%cama%"]


def test_comparison_and_serialization():
    rows = compare([{"producto": "Cama", "sitio_fuente": "FACENCO", "precio_oferta": "Q2,500"},
                    {"producto": "CAMA", "sitio_fuente": "Otra", "precio_oferta_min": 2000}])
    assert rows[1]["diferencia_facenco"] == -500
    assert rows[1]["etiqueta_diferencia"] == "Mas barato"
    assert serialize({"id": 9007199254740993, "started_at": datetime(2026, 9, 7, tzinfo=timezone.utc)}) == {
        "id": "9007199254740993", "started_at": "2026-09-07T00:00:00.000Z"}


def test_routes_filters_summary_and_error():
    class Fake:
        params = None
        def products(self, params):
            self.params = params
            return []
        def latest_run(self):
            return None
    repo = Fake()
    with TestClient(create_app(repo)) as client:
        assert client.get("/api/products?tienda=FACENCO").json() == []
        assert repo.params["tienda"] == "FACENCO"
        assert client.get("/api/latest-run").json() is None
        assert client.get("/api/summary").json() == dict(total=0, precio_promedio=None, mas_baratos=0, mas_caros=0, tiendas=0)
        assert len(client.get("/openapi.json").json()["paths"]["/api/products"]["get"]["parameters"]) == 6
        repo.products = lambda params: (_ for _ in ()).throw(RuntimeError("secret-password"))
        response = client.get("/api/products")
        assert response.status_code == 500
        assert "secret-password" not in response.text


def test_repository_closes_connection_and_uses_snapshot(tmp_path):
    class Connection:
        closed = False
        queries = []
        def __enter__(self): return self
        def __exit__(self, *args): self.closed = True
        def execute(self, query, params=None):
            self.queries.append((query, params))
            return self
        def fetchall(self): return []
    conn = Connection()
    repo = CatalogRepository(connect=lambda: conn, price_file=tmp_path / "absent.xlsx")
    assert repo.products({}) == []
    assert conn.closed
    assert "INTERVAL '3 hours'" in conn.queries[1][0]
    assert "preferred.run_id = p.run_id" in conn.queries[2][0]
