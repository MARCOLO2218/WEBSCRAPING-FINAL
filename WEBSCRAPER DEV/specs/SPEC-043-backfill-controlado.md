# SPEC-043 — Backfill controlado y prueba de conservación

Estado: **Completada y aplicada en la copia PostgreSQL `webscraper_dev`.**
La copia conserva la proyección regional; la base DEV original
`WEBSCRAPING_CAMAS_DEV` y PROD permanecen intactas.

## Contrato

Plan de sólo lectura ligado a identidad, esquema, revisión, reglas y contenido
completo de las cuatro tablas históricas. Antes de escribir, verificar hash
revisado, destino, precondiciones y respaldo. Apply vuelve a calcular bajo bloqueo;
cualquier cambio de fuente aborta antes del DDL. DDL y carga son transaccionales.

Se conserva una fila por producto, incluyendo `revision` y `no_producto`. Se
preservan IDs, UUID, precios, tiendas, fechas y payload de publicación. No se
deduplica por URL. Se validan runs, monedas, conteos por run, colisiones de tienda,
duplicados y relaciones país/run/tienda/producto. Publicaciones mixtas o
incompletas quedan en revisión sin país inventado.

La verificación compara todas las filas proyectadas, no sólo conteos. Repetición
exacta es idempotente. Rollback sólo elimina las cinco tablas añadidas tras
comprobar fuente, lote, proyección e inventario auxiliar; revierte Alembic a 037.
No restaura a ciegas sobre una base con escrituras posteriores.

## Resultado del ensayo real

Plan readonly: 180382 productos, 245 runs, 19 snapshots, 4 países, revisión 037.
Source SHA-256: `769f817c0ae3d41600f9e474b335414dd350470e19936be1db81f530adc334e7`.
Plan SHA-256: `e4c12823c4a5bf011c2b766eb1a4fb34fab31ec6a5f3e12dc031aae7d4c075ef`.

Clasificación: asignados 172909 (GT 172532, SV 377), `no_producto` 3467,
`revision` 4006; publicaciones candidatas 16 y revisión 3. Huella de fuente
idéntica durante plan, apply, verify, repetición, rollback y plan final. Sin
duplicados ni divergencia de proyección. La revisión final fue `037_countries`.

Ensayo completo 362.1 s. Apply 84.9 s (DDL 0.077 s, backfill/verificación
29.36 s); repetición 56.0 s; rollback 58.7 s. Cliente: CPU usuario 322.4 s,
sistema 5.2 s, RSS pico ~1.28 GiB. 353 muestras de locks sin esperas observadas;
el muestreo no cubre esperas menores a un segundo. Tamaño DB 214227991 bytes
antes, máximo 251935767, final 214326295 (+96 KiB; filas intactas).

El dump baseline conservó tamaño y SHA-256 y `pg_restore` lo decodificó
completamente. La restauración inicial fue realizada por el usuario y comparada
por conteos; no se repitió durante el ensayo ni se hizo comparación integral de
dump contra todas las filas del original actual.

79 pruebas Node y 137 Python aprobadas; dos avisos preexistentes de Starlette/httpx
y anyio. Informe completo del ensayo en `docs/SPEC-042-043_CIERRE_COPIA.md`;
JSON con métricas en `docs/SPEC-043_RESULTADO_POSTGRESQL.json`.

## Aplicación final en la copia DEV

El 24 de septiembre de 2026 se aplicó el backfill controlado con el plan
`7412f80b7ea7bf23f0224bbccefc55c7b87bac7fc3a3b896e5d0a1da40b80e7b`.
Terminó con código 0 y `escritura_ejecutada: true`: 257 relaciones run/país,
19 tienda/país, 180382 producto/país, 19 publicación/país y un lote. Los estados
fueron 172909 asignados, 3467 `no_producto` y 4006 en `revision`; GT conservó
172532 y SV 377. La activación regional permaneció deshabilitada.

## Límites y siguiente etapa

El ensayo valida el mecanismo en una copia, no la migración de `WEBSCRAPING_CAMAS_DEV`.
La proyección no tiene sincronización con los workers actuales. Antes de cualquier
migración original hacen falta revisión del código, publicación aprobada, backup
fresco y recuperación verificada, plan readonly nuevo, escritores detenidos,
ventana de mantenimiento y autorización explícita. No reutilizar el hash de copia.
