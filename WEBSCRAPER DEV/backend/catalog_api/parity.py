"""Explicitly invoked DEV HTTP comparison; no database or application imports."""
import argparse
import json
import math
from pathlib import Path
from urllib.parse import urlsplit

import httpx

FILTERS = {"semana", "tienda", "marca", "categoria", "disponibilidad", "q"}


def validate_cases(cases):
    if not isinstance(cases, list) or not cases:
        raise ValueError("Se requiere una lista de casos.")
    names = set()
    shapes = []
    for case in cases:
        if not isinstance(case, dict) or set(case) != {"name", "params"}:
            raise ValueError("Cada caso requiere name y params.")
        name, params = case["name"], case["params"]
        if not isinstance(name, str) or not name or name in names:
            raise ValueError("Los nombres de caso deben ser únicos y no vacíos.")
        if not isinstance(params, dict) or not set(params) <= FILTERS:
            raise ValueError("Filtros desconocidos.")
        if any(not isinstance(v, str) or not v.strip() for v in params.values()):
            raise ValueError("Los valores de filtros deben ser textos no vacíos.")
        names.add(name)
        shapes.append(set(params))
    if set() not in shapes or any({key} not in shapes for key in FILTERS) or FILTERS not in shapes:
        raise ValueError("Incluir caso sin filtros, seis individuales y combinación de los seis.")
    return cases


def validate_url(url):
    parsed = urlsplit(url)
    if (parsed.scheme not in {"http", "https"} or not parsed.hostname
            or parsed.username is not None or parsed.password is not None
            or parsed.query or parsed.fragment or parsed.path not in {"", "/"}):
        raise ValueError("Usar un origen HTTP sin credenciales, ruta ni parámetros.")
    return url.rstrip("/")


def same_json(a, b):
    if type(a) in (int, float) and type(b) in (int, float):
        return a == b
    if type(a) is not type(b):
        return False
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(same_json(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return len(a) == len(b) and all(same_json(x, y) for x, y in zip(a, b))
    return a == b


def reject_constant(value):
    raise ValueError("Número JSON inválido")


def read(client, origin, route, params):
    try:
        response = client.get(origin + route, params=params)
    except httpx.HTTPError:
        return {"error": "conexion"}
    if response.status_code != 200:
        return {"error": "http", "status": response.status_code}
    mime = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    csv = route.endswith(".csv")
    if mime != ("text/csv" if csv else "application/json"):
        return {"error": "tipo_contenido"}
    if csv:
        disposition = response.headers.get("content-disposition", "")
        if disposition != 'attachment; filename="catalogo_comercial_comparativo.csv"':
            return {"error": "cabecera_descarga"}
        return {"body": response.content}
    try:
        body = json.loads(response.content, parse_constant=reject_constant)
    except (ValueError, UnicodeError):
        return {"error": "json_invalido"}
    expected = list if route.endswith("products") else dict
    if not isinstance(body, expected) and not (route.endswith("latest-run") and body is None):
        return {"error": "estructura_json"}
    return {"body": body}


def compare(client, node, api, cases):
    node, api = validate_url(node), validate_url(api)
    if node == api:
        raise ValueError("Los dos orígenes deben ser distintos.")
    validate_cases(cases)
    tasks = [("latest-run", "/api/latest-run", {})]
    tasks += [(case["name"], route, case["params"]) for case in cases
              for route in ("/api/products", "/api/summary", "/api/export.csv")]
    results = []
    for name, route, params in tasks:
        first = [read(client, origin, route, params) for origin in (node, api)]
        second = [read(client, origin, route, params) for origin in (node, api)]
        errors = [{"side": side, "attempt": attempt, **value}
                  for attempt, pair in enumerate((first, second), 1)
                  for side, value in zip(("node", "fastapi"), pair) if "error" in value]
        if errors:
            status = "error"
        elif any(not same_json(a, b) for a, b in zip(first, second)):
            status = "inestable"
        elif not same_json(first[0], first[1]):
            status = "diferente"
        else:
            status = "coincide"
        result = {"case": name, "route": route, "status": status}
        if errors:
            result["errors"] = errors
        results.append(result)
    return {"matches": all(r["status"] == "coincide" for r in results),
            "scope": "Comparación HTTP; revisar cobertura de datos antes de aprobar paridad DEV.",
            "results": results}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node-url", required=True)
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--timeout", type=float, default=30)
    args = parser.parse_args(argv)
    try:
        if not math.isfinite(args.timeout) or args.timeout <= 0:
            raise ValueError("Timeout inválido.")
        cases = json.loads(args.cases.read_text(encoding="utf-8-sig"))
        with httpx.Client(timeout=args.timeout, follow_redirects=False, trust_env=False) as client:
            report = compare(client, args.node_url, args.api_url, cases)
    except (ValueError, OSError):
        print("Configuración inválida: revisar orígenes, timeout y archivo de casos.")
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["matches"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
