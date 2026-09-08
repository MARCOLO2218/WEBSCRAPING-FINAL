# SPEC-025: Lecturas del catálogo en FastAPI

- Estado: Completada
- Ambiente: DEV

## Alcance

GET /api/products, /api/latest-run y /api/summary consultan PostgreSQL desde Python. Conservar campos, filtros semana/tienda/marca/categoria/disponibilidad/q, snapshot por tienda y complemento FACENCO. Conexiones con cierre garantizado, esquema validado y parámetros SQL ligados. El frontend continúa usando Node durante validación.

## Aceptación

Pruebas de HTTP, filtros, valores nulos, serialización de identificadores, comparación FACENCO y fallos sin exponer credenciales. La paridad contra datos reales DEV se informa por separado. No se cambia la política de snapshots durante la migración.

## Validación y alcance efectivo

Implementado en backend/catalog_api/catalog.py, sql/ y main.py; 13 pruebas Python aprobadas. Las consultas de inicialización de snapshots se portan desde Node, incluso su INSERT con ON CONFLICT DO NOTHING; su renovación sigue a cargo del publicador. Por compatibilidad, el complemento Excel se aplica después del filtrado SQL como en Node; el filtro regional se implementará en SPEC-003. FastAPI admite GET explícitamente, Node conserva métodos actuales.

Validación contra PostgreSQL DEV real y despliegue pendientes; no se conectó a bases externas ni se ejecutaron migraciones durante este task. Referencias técnicas en docs/FASTAPI_DEV.md.
