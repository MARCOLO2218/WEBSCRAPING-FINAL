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
| `SPEC-031-panel-carga-espacio-y-cierre.md` | Completada | Espaciado, cierre y visibilidad de confirmación en carga FACENCO. |
| `SPEC-032-catalogo-paises-monedas.md` | Completada | Catálogo GT/GTQ, HN/HNL, SV/USD y NC/NIO y validación de pares; sin selector aún. |
| `SPEC-033-formato-excel-regional.md` | Completada | Plantilla regional, validación y lectores GT; validada por usuario en DEV. |
| `SPEC-034-migracion-nuxt-orm-login-regional.md` | En progreso | Iniciativa por incrementos: ORM/ensayo y permisos; SPEC-045 prepara sesiones/login aislados. Lectores, bootstrap y Nuxt pendientes. |
| `SPEC-035-base-orm-auditoria.md` | Completada | ORM y auditoría del esquema existente; adopción cerrada mediante SPEC-036. |
| `SPEC-036-adopcion-baseline.md` | Completada | 036_existing confirmado en Ubuntu DEV; no repetir baseline. |
| `SPEC-037-tabla-paises.md` | Completada | 037_countries confirmado en Ubuntu DEV; sólo GT habilitado. |
| `SPEC-038-origen-historial-y-aislamiento-regional.md` | Completada | Auditoría y clasificación de origen finalizadas en DEV; migración y aislamiento quedan para la siguiente etapa. |
| `SPEC-039-la-curacao-nicaragua.md` | Cerrada para el lote piloto | Camas 53/54 y categoría superior 67/68 observados; diferencia de uno en cada conjunto, sin identificar si es el mismo producto. Omisión autorizada sólo para este lote; `count_mismatch` permanece. NC no operativo. |
| `SPEC-040-corte-facenco-dev-prod.md` | En progreso | Corte PROD publicado en 8284762 y descargado; verificación final de ejecución no recibida. |
| `SPEC-041-panel-carga-clic-delimitado.md` | Completada | Panel y acciones sólo mediante botones, validados por usuario en DEV. |
| `SPEC-042-expansion-regional.md` | Completada | Expansión aplicada y validada en `webscraper_dev`; base original y PROD no migradas. |
| `SPEC-043-backfill-controlado.md` | Completada | Backfill de 180382 productos aplicado en `webscraper_dev`; integridad, idempotencia y respaldo validados. |
| `SPEC-044-politica-acceso-regional.md` | Completada | Política y dependencias FastAPI locales: 93 pruebas nuevas, 230 Python + 96 Node aprobadas. Sin login ni integración operativa. |
| `SPEC-045-sesiones-y-login-api.md` | Completada (preparación aislada) | Servicio Argon2id, sesiones revocables y revisión 043 probados en SQLite; router sin montar ni migrar. |
| `SPEC-046-limitador-login-compartido.md` | Completada | Concurrencia PostgreSQL validada: 8 permitidos, 24 bloqueados y limpieza final en cero. |
| `SPEC-047-migracion-esquema-autenticacion-dev.md` | Completada | Esquema de autenticación aplicado y verificado vacío en `webscraper_dev`; revisión `044_login_throttle`. |
| `SPEC-048-bootstrap-administrador-dev.md` | En progreso | Bootstrap controlado y reversible del primer administrador; implementación local sin usuario real. |
