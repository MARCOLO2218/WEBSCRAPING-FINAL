# SPEC-024: Base FastAPI en paralelo

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-07

## Objetivo

Crear en backend/ una aplicación FastAPI independiente con configuración, GET /health, OpenAPI y pruebas Pytest.

## Contrato y aceptación

- GET /health devuelve 200 y {"status":"ok","service":"catalog-api","environment":"dev"}.
- Es salud del proceso; no confirma PostgreSQL ni ejecuta scrapers.
- /docs y /openapi.json documentan el endpoint de salud.
- Escucha por defecto en 127.0.0.1:8000; configuración exclusiva CATALOG_API_HOST y CATALOG_API_PORT mediante entorno.
- Node mantiene su dirección actual y el frontend existente. El puerto interno de FastAPI no se instala en accesos directos.
- Pruebas verifican salud, OpenAPI y configuración; npm test sigue aprobando.
- Documentar instalación aislada y ejecución Windows/Ubuntu.

## Fuera de alcance

Lecturas PostgreSQL, migración de rutas Node, selector visual, implementación del acceso remoto, proxy inverso y despliegue en servidores. Se preserva repos/fastapi/ como ejemplo previo.

## Implementación y validación

- backend/catalog_api: aplicación, configuración y arranque; backend/tests/test_api.py: contrato y configuración.
- backend/requirements*.txt: versiones directas fijadas; docs/FASTAPI_DEV.md: ejecución Windows/Ubuntu y límites del piloto.
- 8 pruebas Pytest aprobadas con Python 3.12; pip check sin incompatibilidades. Dos avisos de deprecación de las dependencias TestClient/AnyIO, sin fallos.
- npm test: compilación TypeScript y 64 pruebas aprobadas.
- Validación HTTP en proceso mediante TestClient; despliegue Ubuntu y enrutamiento público pendientes.
