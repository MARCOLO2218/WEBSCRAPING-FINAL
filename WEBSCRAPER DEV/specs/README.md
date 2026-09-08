# Registro permanente de specs

Este directorio conserva las especificaciones funcionales y tecnicas del producto. Una spec permanece aqui aunque su task ya este terminado.

## Estados permitidos

- `Propuesta`: todavia requiere definicion o aprobacion.
- `En progreso`: implementacion activa exclusivamente en DEV.
- `Completada`: implementada, probada y conservada como referencia.
- `Bloqueada`: necesita una decision, acceso o dependencia externa.

## Reglas

1. Crear o actualizar una spec antes de realizar un cambio significativo.
2. Describir objetivo, comportamiento esperado, fuera de alcance y criterios de aceptacion.
3. Registrar archivos afectados y pruebas asociadas al finalizar.
4. No eliminar una spec completada; si cambia el comportamiento, agregar una revision o una nueva spec.
5. Las pruebas automatizadas ejecutables viven en `src/specs/` y no sustituyen la explicacion funcional.

## Indice

| Spec | Estado | Descripcion |
|---|---|---|
| `SPEC-001-base-arquitectura.md` | Completada | Base documental, catalogo central de tiendas y primeras pruebas. |
| `SPEC-002-contratos-api-actual.md` | Completada | Inventario verificable de los contratos de la API Node actual. |
| `SPEC-003-regionalizacion-cuatro-paises.md` | Propuesta | Alcance de cuatro paises, separacion modular y base regional segmentada. |
| `SPEC-004-dominio-y-normalizacion-productos.md` | Completada | Tipos compartidos y normalizacion comun de productos. |
| `SPEC-005-configuracion-calidad-tiendas.md` | Completada | Separacion de minimos de calidad y reglas de reintento por tienda. |
| `SPEC-006-persistencia-postgresql.md` | Completada | Extraccion de configuracion y persistencia PostgreSQL. |
| `SPEC-007-registro-scrapers-guatemala.md` | Completada | Inicio de separacion mediante el registro de los 19 scrapers GT. |
| `SPEC-008-motor-extraccion-visual.md` | Completada | Extraccion del motor visual compartido por scrapers GT. |
| `SPEC-009-tiendas-visuales-guatemala.md` | Completada | Primeras cuatro tiendas movidas a modulos GT. |
| `SPEC-010-tiendas-visuales-paginadas-gt.md` | Completada | Dormisuenos y Bodegangas separados con paginacion. |
| `SPEC-011-tiendas-api-guatemala.md` | Completada | Americana 2000 y Suena Center separados por API. |
| `SPEC-012-max-guatemala.md` | Completada | Extractor especializado de MAX separado en modulo GT. |
| `SPEC-013-walmart-guatemala.md` | Completada | Extractor especializado de Walmart separado en modulo GT. |
| `SPEC-014-siman-guatemala.md` | Completada | Extractor paginado de Siman separado en modulo GT. |
| `SPEC-015-tiendas-tarjetas-guatemala.md` | Completada | Sleep Gallery, Serta y Mattress separados por tarjetas. |
| `SPEC-016-beds-dreams-guatemala.md` | Completada | Extractor Shopify de Beds & Dreams separado en modulo GT. |
| `SPEC-017-furniture-city-guatemala.md` | Completada | Extractor de Furniture City separado en modulo GT. |
| `SPEC-018-olympia-la-colchoneria-guatemala.md` | Completada | Olympia y La Colchonería separadas en módulo GT. |
| `SPEC-019-facenco-guatemala.md` | Completada | Extractor especializado de FACENCO separado en módulo GT. |
| `SPEC-020-utilidades-http-servidor.md` | Completada | Utilidades HTTP básicas separadas del servidor de catálogo. |
| `SPEC-021-servicio-catalogo-postgresql.md` | Completada | Consulta, comparación y CSV del catálogo separados del servidor. |
| `SPEC-022-cola-trabajos-scraper.md` | Completada | Ejecución y cola en memoria del scraper separadas del servidor. |
| `SPEC-023-rutas-servidor-catalogo.md` | Completada | Rutas y handlers separados para cerrar la modularización Node. |
| `SPEC-024-base-fastapi.md` | Completada | Base FastAPI DEV, salud, configuración y pruebas. |
| `SPEC-025-lecturas-fastapi.md` | Completada | Productos, filtros, última ejecución y resumen en Python. |
| `SPEC-026-carga-precios-facenco.md` | Completada | Botón de carga Excel, validación y respaldo de precios GT. |
| `SPEC-027-contratos-fastapi.md` | Completada | Modelos OpenAPI y validación de respuestas de lectura. |
| `SPEC-028-exportacion-csv-fastapi.md` | Completada | Descarga CSV con filtros y pruebas de paridad con Node. |
| `SPEC-029-datos-pais-moneda-y-filtros.md` | Propuesta | Datos GT/GTQ, HN/HNL, SV/USD y NC/NIO; filtros y selecciones recordadas por país. |
| `SPEC-030-herramienta-paridad-dev.md` | Completada | Comparador HTTP probado con simulación; ejecución real DEV pendiente. |
