# SPEC-038 — Origen del historial y aislamiento regional

Estado: En progreso. Primera entrega: auditoría readonly; evidencia Ubuntu pendiente.

## Objetivo

Relacionar productos, ejecuciones y publicaciones con países del catálogo en la
misma base, conservando IDs, UUIDs, historia y resultados GT. SPEC-036 y SPEC-037
ya están aplicadas; no volver a registrar baseline.

## Secuencia y criterios de aceptación

1. Ejecutar `node scripts/history-origin-dev.mjs` en Ubuntu DEV. Leer todos los
   productos en una transacción readonly con snapshot consistente; informar
   tienda, orígenes de ambas URLs, rutas de ejemplo sin parámetros, run_id,
   source_process, ejecuciones vacías, referencias huérfanas y UUID discordantes.
   La auditoría no asigna país ni considera un dominio prueba suficiente.
2. Revisar la evidencia y resolver fuentes ambiguas, productos sin ejecución,
   ejecuciones vacías o mixtas y publicaciones sin ejecución. No asignar GT por
   defecto ni dividir una ejecución histórica cambiando su identidad.
3. Preparar migración 037 -> 038 transaccional con precondiciones que vuelvan a
   verificar la evidencia antes del backfill. Añadir pais_codigo referenciado a
   paises; unicidad (pais_codigo,id) en runs y FK compuesta desde productos y
   publicaciones. Productos sin run_id conservan esa nulabilidad. Publicaciones
   pasan a PK (pais_codigo,store_key). Sin default global GT; sin borrar historia.
4. Retirar DDL heredado de worker y lectores Node/FastAPI en la misma entrega que
   migre el esquema. La actualización requiere pausar escritores DEV, migrar y
   arrancar las versiones compatibles. Mantener la regla de publicación de 3 h.
5. Escrituras de workers con país explícito validado; lecturas, latest-run,
   resumen, filtros, comparaciones y CSV limitados por país en SQL. Actualizar
   llamadores actuales para enviar GT explícitamente; rechazar país ausente o
   deshabilitado. No habilitar otros países todavía.
6. Índices candidatos: productos (pais_codigo,fecha_scraping DESC,id DESC),
   productos (pais_codigo,run_id), runs (pais_codigo,id DESC). Evaluar EXPLAIN
   real y paginación SQL sin alterar resultados antes de fijar índices finales.
7. Probar aislamiento entre países, FK cruzadas, migración repetida, bloqueo
   ante evidencia nueva/ambigua y paridad GT; npm test y suite Python completas.

## Fuera de alcance de esta entrega

Login, usuarios, permisos y Nuxt siguen como siguientes etapas de SPEC-034.
El filtro de país no sustituye autorización. No modificar PROD, .env ni Excel.
No activar una migración ni cambiar consultas productivas antes de revisar la
evidencia real. Esta primera entrega no completa el aislamiento regional.

## Archivos y validación

- backend/catalog_api/db/history_origin.py: inventario de datos readonly.
- scripts/history-origin-dev.mjs: entrada DEV sin opción de escritura.
- backend/tests/test_history_origin.py: evidencia, URLs y anomalías.
- docs/SPEC-038_DEV.md: ejecución y siguiente paso.
