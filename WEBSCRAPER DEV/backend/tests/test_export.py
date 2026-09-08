import csv
import io
import json
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from catalog_api.export import CSV_COLUMNS, to_csv
from catalog_api.main import create_app


ROWS = [{"id": "9007199254740993", "run_id": None, "semana_run": 36,
         "producto": 'Colchón, "especial"\r\nLínea nueva', "marca": "Sueños",
         "precio_regular_min": 2500.0, "precio_oferta_min": 1999.95,
         "diferencia_facenco": -500.0, "precio_regular": "Q2,500",
         "registro_uuid": "=texto", "columna_extra": "no exportar"}]


@pytest.mark.parametrize("rows", [[], ROWS, [dict(ROWS[0], precio_oferta_min=value)
    for value in [0.0, -0.0, 1e-6, 1e-7, 1e20, 1e21]]])
def test_csv_matches_node_bytes(rows):
    root = Path(__file__).resolve().parents[2]
    script = "import {toCsv} from './dist/server/catalog-service.js'; let input=''; for await (const c of process.stdin) input+=c; process.stdout.write(toCsv(JSON.parse(input)));"
    result = subprocess.run(["node", "--input-type=module", "-e", script],
                            input=json.dumps(rows).encode(), cwd=root,
                            capture_output=True, check=True)
    assert to_csv(rows).encode("utf-8") == result.stdout


def test_csv_roundtrip():
    payload = to_csv(ROWS).encode("utf-8")
    assert payload.startswith(b"\xef\xbb\xbf")
    parsed = list(csv.reader(io.StringIO(payload.decode("utf-8-sig"), newline="")))
    assert parsed[0] == list(CSV_COLUMNS)
    assert len(parsed[1]) == 20
    assert parsed[1][7] == ROWS[0]["producto"]
    assert parsed[1][1] == ""
    assert parsed[1][10] == "2500"
    assert parsed[1][18] == "=texto"


def test_export_route_filters_headers_and_schema():
    class Repo:
        def products(self, params):
            self.params = params
            return ROWS
    repo = Repo()
    with TestClient(create_app(repo)) as client:
        params = dict(semana="36", tienda="FACENCO", marca="Sueños", categoria="Camas",
                      disponibilidad="Disponible", q="Colchón")
        response = client.get("/api/export.csv", params=params)
        assert response.status_code == 200
        assert repo.params == params
        assert response.content == to_csv(ROWS).encode("utf-8")
        assert response.headers["content-type"] == "text/csv; charset=utf-8"
        assert response.headers["content-disposition"] == 'attachment; filename="catalogo_comercial_comparativo.csv"'
        assert client.post("/api/export.csv").status_code == 405
        operation = client.get("/openapi.json").json()["paths"]["/api/export.csv"]["get"]
        assert len(operation["parameters"]) == 6
        assert set(operation["responses"]["200"]["content"]) == {"text/csv"}
        assert "application/json" in operation["responses"]["500"]["content"]


@pytest.mark.parametrize("failure", ["repository", "serialization"])
def test_export_failure_is_json_not_partial_download(failure):
    class Repo:
        def products(self, params):
            if failure == "repository":
                raise RuntimeError("secret-password")
            return [{"precio_oferta_min": float("nan")}]
    with TestClient(create_app(Repo())) as client:
        response = client.get("/api/export.csv")
        assert response.status_code == 500
        assert "application/json" in response.headers["content-type"]
        assert "content-disposition" not in response.headers
        assert "secret" not in response.text
        assert set(response.json()) == {"error"}
