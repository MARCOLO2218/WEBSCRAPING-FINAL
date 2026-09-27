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
| `SPEC-013-walmart-guatemala.md` | Completada | Extractor especializado de Walmart GT; captura segmentada Belezza confirmó 40 resultados en dos páginas. |
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
| `SPEC-048-bootstrap-administrador-dev.md` | Completada | Primer administrador global creado y verificado en `webscraper_dev`; login aún sin montar. |
| `SPEC-049-el-gallo-nicaragua.md` | Piloto DEV validado | 40 productos observados por consulta, 40 únicos y con precio; conteo coincide con páginas visibles. |
| `SPEC-050-siman-nicaragua.md` | Piloto DEV validado | 77 productos únicos con precio; 23 repetidos entre búsquedas; sigue fuera del ejecutor principal. |
| `SPEC-051-walmart-nicaragua.md` | Piloto DEV validado | Windows y Ubuntu DEV: 153 productos (19 camas/colchones, 134 accesorios), 141 con precio; Ubuntu 126 pruebas aprobadas; piloto solo lectura. Walmart sigue deshabilitado y fuera del ejecutor principal. |
| `SPEC-052-maxipali-nicaragua.md` | Piloto DEV | Seis fichas útiles, cero precios publicados; confirmado nuevamente en modo de solo lectura. |
| `SPEC-053-catalogo-tiendas-nicaragua.md` | Completada | Cinco tiendas NC registradas deshabilitadas; suite Ubuntu aprobada (123 pruebas), GT sin cambios. |
| `SPEC-054-activacion-individual-tiendas-nicaragua.md` | Validada en Ubuntu DEV | Registro NC filtra por `enabled` individual y conserva el cierre general por país apagado; 127 pruebas aprobadas, sin conexión al ejecutor. |
| `SPEC-055-reporte-rapido-sprint.md` | Implementación local validada; sprint completado | `npm run sprint:report` presenta avance, pendientes, dependencias, riesgo y esfuerzo restante; sprint cerrado al 100%. |
| `SPEC-056-prototipo-visual-acceso-pais.md` | Demo validada por el usuario | Página estática con flujo simulado, país NC deshabilitado y controles de no transmisión; paleta WMS. |
| `SPEC-057-lector-regional-readonly.md` | Completada localmente; integración pendiente | Lector aislado, sólo SELECT, contexto de país obligatorio; 281 pruebas Python, sin montaje API ni conexión PostgreSQL. |
| `SPEC-058-ruta-regional-lectura-aislada.md` | Completada localmente; integración pendiente | Ruta country-scoped con auth por petición y sesión inyectada; seis pruebas locales, no montada en `main.py`. |
| `SPEC-059-inyeccion-proveedor-sesion-regional.md` | Completada localmente; conexión operativa pendiente | Dependencias request-scoped para sesión y auth provider; 290 pruebas Python, sin `.env` ni engine propio. |
| `SPEC-060-integracion-auth-lector-regional-local.md` | Completada localmente; integración operativa pendiente | AuthRepository, permisos por país, sesión revocada y lector regional conectados en SQLite temporal; sin PostgreSQL ni montaje en `main.py`. |
| `SPEC-061-plan-integracion-regional-db-original.md` | Plan documental completado; sin autorización de conexión/escritura | Registra restricciones de destino, cadena 037→042→043→044, falta de sincronización y compuertas para futura integración DEV original. |
| `SPEC-062-publicacion-regional-transaccional.md` | En progreso (contrato definido; dual-write bloqueado por esquema/semántica de vigencia) | Define dual-write atómico; requiere identidad global de tienda sin colisiones y ledger append-only verificable. FACENCO Excel queda como fuente regional complementaria, filtrada por país/moneda; fusión por país+código y compatibilidad por nombre solo GT; comparación por país/moneda en Node/Python; sin run PostgreSQL simulado. Falta decidir tratamiento de fecha de vigencia ausente/vencida. Conserva clave legacy y rechaza colisiones. Clasificador común 038-v3 se cubre en SPEC-063/064. |
| `SPEC-063-contrato-clasificacion-regional-ts-python.md` | Completada localmente; no conectada al escritor | Ambos lenguajes ejecutan el corpus JSON común de clasificación regional 038-v3. |
| `SPEC-064-prioridad-moneda-cordoba.md` | Completada localmente; requiere nuevo plan regional | Corrige precedencia `C$` antes que `$` en reglas 038-origin-v3; evidencia v2 y datos persistidos sin cambios. |
| `SPEC-065-esqueleto-paises-hn-sv.md` | En progreso; Walmart HN 19/19; contratos La Curacao HN y Diunsa HN listos | HN/SV siguen deshabilitados. Walmart: 19 productos, 16 con precio; tres sin precio. La Curacao sin lector DOM por 403. Diunsa: categoría `/camas` confirmada, pero sin fichas/paginación visibles desde este entorno. Cinco extractores funcionales pendientes. |
| `SPEC-066-demo-visual-honduras.md` | Implementación local | Añade a la demo estática una vista ilustrativa HN/HNL con evidencia de Walmart y estado de La Curacao/Diunsa; no conecta datos ni activa scrapers. |
| `SPEC-067-migracion-pnpm.md` | Validada en Windows y Ubuntu DEV | pnpm 11.25.0; instalación congelada. 176 pruebas locales y 127 en el commit Ubuntu, build aprobado; módulos HN locales siguen sin publicar. |
| `SPEC-068-migracion-pnpm-prod.md` | Completada en checkout local; despliegue pendiente | pnpm 11.25.0 y lockfile propio PROD; instalación y build aprobados localmente, sin reinicio ni cambios en el servidor. |
