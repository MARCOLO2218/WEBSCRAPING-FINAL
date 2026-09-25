# SPEC-042 — Expansión regional compatible

Estado: **Completada y aplicada en la copia PostgreSQL `webscraper_dev`.**
La copia avanzó a `042_regional` el 24 de septiembre de 2026. La base DEV
original `WEBSCRAPING_CAMAS_DEV` y PROD no se migraron.

## Alcance y contrato

Después de `037_countries`, Alembic añade cinco tablas en `catalogo` sin alterar
las tablas históricas `productos_catalogo`, `scraping_runs`,
`catalog_display_snapshots` y `paises`. No activa países, lectores ni escritores
regionales. La proyección es una fotografía, no se sincroniza con nuevos scrapes.

- `scraping_run_paises`: asociación run/país compuesta; conserva runs mixtas.
- `tiendas_paises`: asociación país/tienda.
- `productos_paises`: una fila por ID histórico, incluidos pendientes.
- `publicaciones_paises`: evaluación por snapshot que conserva su payload íntegro.
- `regional_lotes`: huellas del lote con ID fijo 1.

IDs, UUID, tiendas, precios y fechas históricos se preservan. No se deduplican
productos por URL ni se asigna GT por defecto. Pendientes mantienen país nulo.
Publicaciones mixtas o incompletas quedan en revisión. PK/FK/UNIQUE/CHECK protegen
relaciones y estados. Países y permisos no cambian.

## Resultado del ensayo PostgreSQL

Versión inicial/final `037_countries`; `042_regional` se aplicó y revirtió dentro
de la copia. Conteos históricos antes y después: productos 180382, runs 245,
snapshots 19, países 4. La fuente SHA-256 permaneció idéntica.

Proyección durante apply: 257 run/país, 19 país/tienda, 180382 productos,
19 publicaciones, un lote. Clasificación: 172909 asignados (172532 GT,
377 SV), 3467 `no_producto`, 4006 `revision`; publicaciones 16 candidatas,
3 en revisión. Repetición idempotente validada sin cambios ni duplicados.

79 pruebas Node y 137 Python aprobadas. Evidencia y límites en
`docs/SPEC-042-043_CIERRE_COPIA.md`. El ensayo no autoriza migrar la base original.

## Aplicación final en la copia DEV

El plan readonly actualizado produjo `plan_hash`
`7412f80b7ea7bf23f0224bbccefc55c7b87bac7fc3a3b896e5d0a1da40b80e7b`
y conservó `source_hash`
`769f817c0ae3d41600f9e474b335414dd350470e19936be1db81f530adc334e7`.
La aplicación terminó con código 0, estado `validado` y los mismos conteos,
clasificaciones, países y publicaciones del ensayo. Se usó el respaldo
`webscraper_dev_pre_042_20260924_162345.dump`, de 31010990 bytes y SHA-256
`626bfa7f974d6b72761f9d4805b5dbce834a0124fecc6b499cbc73ff77bd73ed`.

## Historial de preparación

La implementación se preparó y probó primero con DDL PostgreSQL compilado y
SQLite en memoria. Luego se ejecutó el ensayo real en la copia restaurada. Las
referencias previas a validación PostgreSQL pendiente describían ese estado
anterior y quedan supersedidas por el resultado anterior.
