# Cierre SPEC-042 / SPEC-043: ensayo PostgreSQL en copia

Estado: completadas en el alcance de diseño, implementación y ensayo reversible
en webscraper_dev, PostgreSQL 16.14, catalogo, rol webscraper_user. No desplegadas
en WEBSCRAPING_CAMAS_DEV ni PROD. La copia terminó nuevamente en 037_countries.
No lecturas regionales activadas. No commit/push ni actualización definitiva Ubuntu.

## Evidencia y conservación

Ejecución realizada por usuario en Ubuntu mediante paquete temporal de código,
sin reemplazar checkout ni .env. Carpeta /tmp/spec043-ensayo-9nfN4ukH/informes.
Informe recibido: SPEC-043_RESULTADO_POSTGRESQL.json (sin contraseñas ni filas).
La revisión del JSON confirmó siete etapas y misma huella fuente en todas.

| Histórico | Antes | Tras apply/repetición | Tras rollback |
|---|---:|---:|---:|
| productos_catalogo | 180382 | 180382 | 180382 |
| scraping_runs | 245 | 245 | 245 |
| catalog_display_snapshots | 19 | 19 | 19 |
| paises | 4 | 4 | 4 |
| Revisión | 037_countries | 042_regional | 037_countries |

Tablas creadas durante ensayo y eliminadas por rollback:
regional_lotes 1; scraping_run_paises 257; tiendas_paises 19;
productos_paises 180382; publicaciones_paises 19. Los conteos finales del plan
siguen siendo proyecciones: NO significa que estas tablas permanezcan tras rollback.
FK unen producto original, run, país y tienda; PK/UNIQUE evitan duplicación de
asociaciones. No se deduplicó historia por URL ni cambiaron IDs/UUID.
Alembic actualizó su revisión y la devolvió a 037. Las cuatro tablas fuente
conservaron su contenido íntegro y estructura validada. Inventario auxiliar
(vistas, funciones, triggers no internos, secuencias y extensiones) comprobado
por el runner antes del commit y tras rollback, sin divergencias reportadas.

Clasificación: 172909 asignados (GT 172532, SV 377), 3467 no_producto,
4006 revision. Publicaciones: 16 candidatas, 3 revision. Pendientes permanecen
con país nulo; no se inventa clasificación. No habilita SV ni otros países.

Source SHA256: 769f817c0ae3d41600f9e474b335414dd350470e19936be1db81f530adc334e7.
Plan SHA256: e4c12823c4a5bf011c2b766eb1a4fb34fab31ec6a5f3e12dc031aae7d4c075ef.
Huella de fuente idéntica antes/después; comparación exacta de cada fila regional
con proyección esperada, conteos SQL confirmados. Repetición validada sin filas
adicionales; restricciones PK/FK/CHECK y coherencia de run/país/tienda satisfechas.

## Pruebas y mediciones

79 pruebas Node aprobadas con build TypeScript; 137 Python aprobadas. Última
verificación dirigida posterior: 43 pruebas de migración/runner aprobadas.
Incluyen rollback transaccional por alteración inesperada, guardia de destino,
planes obsoletos, duplicados, huérfanos, moneda, idempotencia y flujo integrado.
Dos avisos de dependencias preexistentes: Starlette/httpx y anyio BlockingPortal.

| Etapa | Segundos |
|---|---:|
| Plan inicial | 39.653 |
| Apply completo | 84.885 |
| Verify | 40.541 |
| Repetición | 56.000 |
| Verify repetición | 40.806 |
| Rollback completo | 58.661 |
| Plan final | 40.639 |
| Ensayo reportado | 362.099 |

Dentro de apply: DDL 0.0773 s; backfill con verificación 29.3609 s.
DDL de rollback 0.0571 s. Tiempo total reportado excluye primera validación
del respaldo y espera de contraseña; incluye validación final del respaldo.
Cliente Python: CPU usuario 322.418 s, sistema 5.195 s; pico RSS 1337516 KiB
(1306.17 MiB, aproximadamente 1.28 GiB). No son métricas de CPU/RAM del servidor.
353 muestras de locks: máximo 0 no concedidos / 0 sesiones esperando lock,
sin error de muestreo. No demuestra ausencia de esperas inferiores a un segundo.
Sólo se observaron sesiones etiquetadas del ensayo, no carga total de otros proyectos.

Tamaño inicial 214227991 bytes; tras apply 251919383; máximo observado 251935767;
final 214326295. Diferencia final +98304 bytes (96 KiB) compatible con cambios de
almacenamiento/catálogos; no representa pérdida ni duplicación de filas. No se
ejecutó VACUUM FULL ni otro mantenimiento para forzar igualdad física.

## Respaldo, recuperación y límites

Baseline conservado: /mnt/data/backups/postgresql/webscraper/WEBSCRAPING_CAMAS_DEV.dump.
31003594 bytes; SHA256 4fc815a3e571dbfee5e940530a674c68705b917290ef8017889d0090f82bc09c.
Decodificación completa mediante pg_restore satisfactoria e igualdad de SHA
antes/después. Restauración inicial real fue realizada por usuario y validada
por conteos. No se repitió restauración durante el ensayo; no existe medición
de su duración. Decodificar no prueba paridad integral dump/copia/original actual.
Estas limitaciones quedan explícitas: no afirmar una segunda restauración ni
huella integral comparada con la base original actual.

Recuperación normal probada: validar lote, fuente y proyección; downgrade a 037
elimina sólo cinco tablas nuevas. Si falla una etapa antes de commit, rollback
transaccional. Si otras etapas ya confirmaron, conservar informes e inspeccionar
revisión/huellas antes de actuar. No restaurar sobre escrituras posteriores ni
borrar base/contenedor. Recuperación excepcional desde dump requiere procedimiento
revisado para destino exacto; no se propone sobrescribir original automáticamente.

Riesgos/pendientes fuera del cierre del ensayo: 4006 productos y 3 publicaciones
en revision; proyección es fotografía sin sincronización con workers; demanda
de RAM cliente ~1.28 GiB y ventana de bloqueo de fuentes durante apply; servidor
compartido no perfilado completamente. Antes de original: backup fresco y prueba
de recuperación acorde a ventana, plan fresco e inventario, detener escritores,
capacidad disponible y autorización explícita. No reutilizar el hash ligado a copia.

## Archivos de esta etapa para revisión Git

Nuevos (todos bajo WEBSCRAPER DEV):

- .gitignore
- backend/catalog_api/db/regional_expansion_v1.py
- backend/catalog_api/db/regional_models.py
- backend/catalog_api/db/regional_migration.py
- backend/catalog_api/db/regional_rehearsal.py
- backend/catalog_api/db/regional_copy_plan.py
- backend/catalog_api/db/regional_copy_trial.py
- backend/catalog_api/db/regional_inventory.py
- backend/migrations/versions/042_regional.py
- backend/tests/test_regional_migration.py
- backend/tests/test_regional_copy_trial.py
- scripts/regional-backup-dev.mjs
- scripts/regional-migration-dev.mjs
- scripts/regional-rehearsal-dev.mjs (creación de scratch deshabilitada)
- scripts/regional-copy-trial-ubuntu.sh
- specs/SPEC-042-expansion-regional.md
- specs/SPEC-043-backfill-controlado.md
- docs/MIGRACION_REGIONAL_DEV.md
- docs/SPEC-043_ENSAYO.json (sintético, no confundir con real)
- docs/SPEC-043_CONTINUIDAD_COPIA.md
- docs/SPEC-043_RESULTADO_POSTGRESQL.json
- docs/SPEC-042-043_CIERRE_COPIA.md

Modificados: backend/migrations/env.py, specs/README.md, docs/ARCHITECTURE.md,
docs/DECISIONS.md, docs/MIGRATION_PLAN.md, docs/WORKFLOW_AND_HANDOFF.md.
Algunos contienen cambios anteriores: revisar diff completo antes de preparar índice.
Ningún archivo eliminado por esta etapa. Borrados y otras modificaciones previas
del usuario, incluidos PROD y Excel, conservados fuera del alcance.

Índice Git vacío al cierre: ningún archivo preparado para commit. No aparecen
.env reales ni *.dump/*.backup rastreados en la consulta de Git; no es una auditoría
exhaustiva de secretos histórica. .gitignore DEV excluye .env y variantes locales,
*.dump, *.backup, backups/, .regional-validation/. Paquetes y evidencia detallada
temporales no se publican. Backup permanece sólo Ubuntu; no copiar datos a Git.
El informe JSON resumido sí es publicable tras revisión, contiene conteos y hashes.

## Siguiente paso propuesto, no ejecutado

Detenerse y esperar confirmación para revisar/publicar estos archivos. Posterior
etapa pequeña deberá habilitar explícitamente el destino original (guardia actual
lo rechaza), preparar backup/recuperación, plan readonly fresco y ventana sin
escritores; luego una autorización separada antes del primer apply real allí.
No entregar un comando de original pretendidamente listo: actualmente se rechaza
por diseño y falta esa preparación. No ejecutar commit/push, pull definitivo,
despliegue ni activar lectores regionales en este cierre.
