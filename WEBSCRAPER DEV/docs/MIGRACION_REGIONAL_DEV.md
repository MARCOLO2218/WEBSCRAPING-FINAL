# SPEC-042/043 — Registro histórico de preparación

**Estado vigente:** ensayo real completado y revertido en `webscraper_dev`; ver
`SPEC-042-043_CIERRE_COPIA.md`. Este documento conserva el diseño y los comandos
de la preparación. Sus comandos de apply/rollback son ejemplos históricos para
la copia y **no constituyen un runbook aprobado** para la base DEV original.
El runner vigente bloquea escrituras en bases distintas de `webscraper_dev`.
No habilita lecturas regionales ni sustituye la próxima revisión de publicación.

Estado de preparación previo al ensayo (histórico): mecanismo implementado;
validación PostgreSQL todavía no recibida en esa fecha.
SPEC-038 permanece cerrada en f9397eb. No repetir baseline 036 ni países 037.

## Decisión y alcance

Ampliación compatible en la misma base, revisión `037_countries -> 042_regional`.
El modelo candidato de SPEC-038 es el destino funcional, no una migración ya
aplicada. Node conserva su DDL y publicaciones por store_key; por eso esta etapa
añade una proyección complementaria antes de cambiar lectores y escritores.
No se alteran las cuatro tablas originales. No se asigna GT por defecto ni se
habilita SV por encontrar historia SV. La proyección es una fotografía: nuevos
scrapes NO se incorporan automáticamente y no debe consumirse como catálogo vivo.

## Tablas, relaciones y datos

| Tabla | Operación al aplicar | Preservación / relación |
|---|---|---|
| productos_catalogo | Sólo SELECT y bloqueo temporal | Todas las columnas, IDs/UUID, precios y fechas intactos |
| scraping_runs | Sólo SELECT y bloqueo temporal | IDs/UUID, totales, semanas y ejecuciones mixtas intactos |
| catalog_display_snapshots | Sólo SELECT y bloqueo temporal | Tienda, conteo, ejecución, llave 3 h y timestamps intactos |
| paises | Sólo SELECT y bloqueo temporal | Códigos, monedas, nombres, habilitación y extensiones intactos |
| alembic_version | UPDATE por Alembic | 037_countries -> 042_regional, revertible |
| regional_lotes | CREATE + INSERT de un lote | PK id=1; huella de plan, fuente y reglas |
| scraping_run_paises | CREATE + INSERT | PK run_id/país; FK a runs y paises; admite GT y SV en una run |
| tiendas_paises | CREATE + INSERT | PK país/store_key; FK a paises, no renombra tiendas históricas |
| productos_paises | CREATE + INSERT, una fila por producto | PK/FK producto_id; FK run/país y tienda/país; estado/motivo/huella |
| publicaciones_paises | CREATE + INSERT, una fila por snapshot | PK store_key de origen, UNIQUE país/tienda; FK run/país y tienda/país; payload íntegro |

Los cinco modelos ORM están en regional_models.py; el DDL congelado vive en
regional_expansion_v1.py. El runner usa SQLAlchemy y Alembic, sin SQL interpolado
desde datos del usuario. Las únicas interpolaciones de nombres usan constantes.

No hay deduplicación de productos por URL: dos capturas históricas conservan
ambos IDs aunque compartan URL. PK compuestas deduplican solamente asociaciones.
La normalización de tienda se usa para detectar colisiones, no para fusionarlas.
Única equivalencia aplicada: `La Colchoner* -> La Colchoneria Guatemala`, igual
al escritor Node actual; el texto original permanece en productos_catalogo.

Una publicación es candidata sólo si todas sus filas son asignadas a un mismo
país y su conteo coincide exactamente. Mixtas, enlaces o pendientes se preservan
como revision con país NULL y payload original. No se ocultan del catálogo actual.
No hay una publicación activa nueva: el cambio a clave operativa país/tienda y
escritura continua queda para la próxima etapa, con paridad GT y autorización.

## Backfill y comprobaciones

1. Validar revisión, columnas y PK históricas; rechazar tablas regionales parciales
   o nombres ocupados. Leer todas las columnas en orden estable y timezone UTC.
2. Verificar unicidad de IDs/UUID, países/monedas, run/UUID, totales por ejecución,
   pertenencia exacta tienda/run de snapshots y sus conteos. Run nullable se
   conserva; asignados sin relación completa pasan a revision, sin país inventado.
3. Reutilizar clasificador cerrado 038-v2. Guardia adicional bloquea moneda mixta,
   símbolo no verificable o C$ interpretado como USD: no corrige filas a escondidas.
4. SHA-256 incluye todo dato histórico (no sólo precios/URLs), estructura de las
   tablas fuente, identidad de servidor/base, reglas y proyección propuesta.
   La huella 043 es distinta a la del informe 038 y no es intercambiable.
5. Apply exige huella revisada, confirmación DEV y respaldo custom legible por
   pg_restore. Bajo advisory lock y bloqueo SHARE ROW EXCLUSIVE de fuentes,
   recalcula el plan. Cualquier diferencia aborta antes de crear tablas.
6. DDL, inserciones de lotes de 1000 y revisión Alembic comparten transacción.
   Comparar cada fila regional con el resultado previsto, no sólo COUNT(*).
   Leer otra vez todas las fuentes: hash de datos y esquema debe ser idéntico.
7. Repetición exacta valida sin duplicar. --verify es readonly. Si hay datos
   nuevos, plan/repetición/rollback no fuerzan actualización: rechazan divergencia.

La lectura actual materializa el conjunto completo en memoria; planificar memoria
y ventana de mantenimiento. No se midieron memoria/tiempo de 043 en Ubuntu.
lock_timeout=5s para escrituras; statement_timeout=300s en conexión de escritura.
El plan readonly conserva timeout de 30s por sentencia del proyecto, no del proceso.

## Evidencia y límites

Validación local final: npm test 79/79; pytest 125/125 (31 pruebas nuevas de
042/043); dos warnings preexistentes de Starlette/httpx/anyio. Sintaxis de los
tres scripts Node validada; git diff --check de archivos seguidos sin errores.

Informe 038 recibido: 180382 productos, 245 ejecuciones, 19 publicaciones.
172909 asignados (172532 GT, 377 SV), 3467 no_producto y 4006 revision; sin
anomalías reportadas. Suma comprobada: 172909+3467+4006=180382.
Fuente: spec-038-final.json descargado; huella de clasificación
7b95f34181bb3ab9c27c23457ed6e6268c068a8f5f589f70b24156e637f081c5.
No es una exportación completa de filas, ni prueba de frescura para 043.

Ensayo reproducible: docs/SPEC-043_ENSAYO.json. Datos sintéticos: 4 productos,
1 run mixta, 4 países y 1 snapshot. Produce 4 clasificaciones, 2 relaciones de
ejecución/país, 2 de tienda/país, 1 evaluación y 1 lote. Apply, repetición, verify
y rollback aprobados; mismo hash completo original antes/después.

Pruebas específicas incluyen duplicados, FK, CHECK, UUID discordante, huérfanos,
conteos, moneda ambigua, plan obsoleto, cambio histórico durante fill, esquema
parcial, versión desconocida, alteración posterior y recuperación transaccional.
DDL compilado para PostgreSQL. Ejecución de DDL/DML realizada sólo en SQLite
en memoria. PostgreSQL aislado no disponible localmente: su integración real,
locks, rendimiento y restauración del dump quedan pendientes antes de aprobar
aplicación. Ninguna prueba de este task conectó a PostgreSQL existente.

## Archivos de esta etapa

Nuevos: backend/catalog_api/db/regional_expansion_v1.py, regional_models.py,
regional_migration.py, regional_rehearsal.py; backend/migrations/versions/042_regional.py;
backend/tests/test_regional_migration.py; scripts/regional-migration-dev.mjs,
regional-backup-dev.mjs, regional-rehearsal-dev.mjs; specs/SPEC-042-expansion-regional.md,
SPEC-043-backfill-controlado.md; docs/SPEC-043_ENSAYO.json y este documento.

Modificados: backend/migrations/env.py, specs/README.md, docs/ARCHITECTURE.md,
DECISIONS.md, MIGRATION_PLAN.md y WORKFLOW_AND_HANDOFF.md. Los cambios locales
previos en estos documentos se conservaron. No se editaron PROD, .env, Excel,
backups eliminados ni el clasificador/informe cerrado de SPEC-038.

## Windows: publicar únicamente esta entrega

Estos comandos son para el usuario; no los ejecutó el agente. Si hay archivos
ajenos ya staged, detenerse para revisarlos. No usar git add .

```powershell
cd "C:\Users\USER\source\repos\scraper 6"
& {
  $regionalFiles = @(
    'WEBSCRAPER DEV/backend/catalog_api/db/regional_expansion_v1.py'
    'WEBSCRAPER DEV/backend/catalog_api/db/regional_models.py'
    'WEBSCRAPER DEV/backend/catalog_api/db/regional_migration.py'
    'WEBSCRAPER DEV/backend/catalog_api/db/regional_rehearsal.py'
    'WEBSCRAPER DEV/backend/migrations/versions/042_regional.py'
    'WEBSCRAPER DEV/backend/migrations/env.py'
    'WEBSCRAPER DEV/backend/tests/test_regional_migration.py'
    'WEBSCRAPER DEV/scripts/regional-migration-dev.mjs'
    'WEBSCRAPER DEV/scripts/regional-backup-dev.mjs'
    'WEBSCRAPER DEV/scripts/regional-rehearsal-dev.mjs'
    'WEBSCRAPER DEV/specs/SPEC-042-expansion-regional.md'
    'WEBSCRAPER DEV/specs/SPEC-043-backfill-controlado.md'
    'WEBSCRAPER DEV/specs/README.md'
    'WEBSCRAPER DEV/docs/SPEC-043_ENSAYO.json'
    'WEBSCRAPER DEV/docs/MIGRACION_REGIONAL_DEV.md'
    'WEBSCRAPER DEV/docs/ARCHITECTURE.md'
    'WEBSCRAPER DEV/docs/DECISIONS.md'
    'WEBSCRAPER DEV/docs/MIGRATION_PLAN.md'
    'WEBSCRAPER DEV/docs/WORKFLOW_AND_HANDOFF.md'
  )
  $staged = @(git -c core.quotepath=false diff --cached --name-only)
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo revisar el índice.' }
  if (@($staged | Where-Object { $_ -notin $regionalFiles }).Count) { throw 'Hay otros archivos staged; revisar antes de continuar.' }
  git add -- @regionalFiles
  if ($LASTEXITCODE -ne 0) { throw 'No se prepararon los archivos.' }
  git diff --cached --check
  if ($LASTEXITCODE -ne 0) { throw 'Revisar formato.' }
  git commit -m 'SPEC-042/043: preparar expansion regional y backfill controlado'
  if ($LASTEXITCODE -ne 0) { throw 'No se creó el commit.' }
  git push
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo publicar.' }
}
```

## Ubuntu DEV: validación sin escrituras PostgreSQL

Puede realizarse antes de autorizar migración. No detiene el servicio. Repetir el
plan con writers activos puede producir una huella distinta: es esperado.

```bash
(
  cd "/home/administradorgt/WEBSCRAPING-FINAL" || exit 1
  git pull --ff-only || exit 1
  cd "WEBSCRAPER DEV" || exit 1
  npm test || exit 1
  (cd backend && .venv/bin/python -m pytest tests -q) || exit 1
  (cd backend && .venv/bin/python -m catalog_api.db.regional_rehearsal) || exit 1
  node scripts/regional-migration-dev.mjs > /tmp/spec-043-plan.en-curso.json || exit 1
  mv /tmp/spec-043-plan.en-curso.json /tmp/spec-043-plan.json || exit 1
  cat /tmp/spec-043-plan.json
)
```

DETENERSE: revisar destino, conteos, huella y cualquier rechazo del preflight.
No hay autorización implícita de aplicación por salida status=plan_preparado.

## Ensayo PostgreSQL aislado (sin datos existentes)

Preparado, no ejecutado en esta entrega. Requiere cliente createdb y permiso
CREATEDB del usuario DEV. Crea una base nueva spec043_ensayo_UUID, introduce
únicamente los cuatro productos sintéticos y prueba apply/repetición/verify/
rollback. El programa rechaza bases con otro nombre, tablas existentes o esquema
catalogo previo. No conecta a DEV para migrarla. Conserva la base de ensayo para
inspección y muestra su nombre; no ejecuta DROP DATABASE ni limpieza automática.
Si faltan permisos, solicitar al administrador una base vacía de ensayo; no
cambiar permisos de la aplicación ni probar sobre datos existentes.

```bash
(
  cd "/home/administradorgt/WEBSCRAPING-FINAL/WEBSCRAPER DEV" || exit 1
  node scripts/regional-rehearsal-dev.mjs --postgres-scratch > /tmp/spec-043-ensayo-pg.en-curso.json || exit 1
  mv /tmp/spec-043-ensayo-pg.en-curso.json /tmp/spec-043-ensayo-pg.json || exit 1
  cat /tmp/spec-043-ensayo-pg.json
)
```

Esto valida comportamiento PostgreSQL con fixture; no sustituye restauración de
backup, dimensionamiento para 180382 filas ni preflight de la base DEV actual.

## Sólo después de confirmación explícita: mantenimiento y respaldo

Antes: ensayo PostgreSQL aislado y comprobación de restauración del respaldo.
Confirmar que no hay otros escritores/cron. Dejar terminar scrapers en curso.
La pausa detiene sólo webscraper-dev, no PROD. No matar jobs a la fuerza.

```bash
cd "/home/administradorgt/WEBSCRAPING-FINAL/WEBSCRAPER DEV" || exit 1
pm2 stop webscraper-dev || exit 1
if pgrep -f '[d]ist/scrape-facenco-energy' >/dev/null; then
  echo 'Todavía hay un scraper activo: esperar y revisar antes de migrar.'
  exit 1
fi
regional_backup_dir=$(mktemp -d /home/administradorgt/respaldo-regional-dev-XXXXXXXX) || exit 1
node scripts/regional-backup-dev.mjs "$regional_backup_dir/dev.dump" || exit 1
printf 'Conservar esta ruta: %s\n' "$regional_backup_dir"
node scripts/regional-migration-dev.mjs > "$regional_backup_dir/plan.json" || exit 1
cat "$regional_backup_dir/plan.json"
```

Revisar el plan congelado con escritores pausados. Mantener la misma terminal
para conservar regional_backup_dir; el dump se valida con pg_restore --list,
pero eso no prueba por sí solo una restauración completa ni su destino.

## Sólo después de revisar ese plan: aplicar y comprobar

```bash
cd "/home/administradorgt/WEBSCRAPING-FINAL/WEBSCRAPER DEV" || exit 1
regional_hash=$(backend/.venv/bin/python -c 'import json,sys; print(json.load(open(sys.argv[1]))["plan_hash"])' "$regional_backup_dir/plan.json") || exit 1
node scripts/regional-migration-dev.mjs --apply --confirm-dev --expected-hash "$regional_hash" --backup "$regional_backup_dir/dev.dump" > "$regional_backup_dir/aplicacion.json" || exit 1
cat "$regional_backup_dir/aplicacion.json"
node scripts/regional-migration-dev.mjs --verify --expected-hash "$regional_hash" > "$regional_backup_dir/verificacion.json" || exit 1
cat "$regional_backup_dir/verificacion.json"
```

Apply sólo crea y llena las cinco tablas nuevas y avanza Alembic. Verify sólo
lee: exige conservación integral, igualdad de proyección y conteos. Revisar
status aplicado/validado, estados y países contra plan revisado, revisión 042,
FK/PK, publicaciones pendientes y que la habilitación de países siga intacta.
La comprobación original antes/después ya ocurre antes del COMMIT.

Si todo coincide, el usuario puede reanudar el servicio legado:

```bash
pm2 restart webscraper-dev || exit 1
pm2 logs webscraper-dev --lines 40 --nostream
```

Validar catálogo GT y carga/consultas existentes. La expansión no cambia las
rutas API ni la llave de tres horas. Tras nuevas escrituras, verify estricto
detectará que la fotografía quedó antigua; no volver a aplicar automáticamente.

## Rollback y recuperación

Un fallo antes de COMMIT revierte DDL, INSERTs y revisión Alembic por transacción.
Si se perdió la respuesta del COMMIT, usar --verify; no asumir fracaso ni repetir
baseline. Si nada cambió después del lote, con escritores pausados y aprobación:

```bash
cd "/home/administradorgt/WEBSCRAPING-FINAL/WEBSCRAPER DEV" || exit 1
node scripts/regional-migration-dev.mjs --rollback --confirm-dev --expected-hash "$regional_hash" --backup "$regional_backup_dir/dev.dump" > "$regional_backup_dir/rollback.json" || exit 1
cat "$regional_backup_dir/rollback.json"
node scripts/regional-migration-dev.mjs > "$regional_backup_dir/post-rollback.json" || exit 1
cat "$regional_backup_dir/post-rollback.json"
```

Rollback elimina sólo tablas complementarias después de comprobar que siguen
siendo exactamente el resultado del lote y que ninguna fuente cambió; Alembic
vuelve a 037. Las cuatro tablas originales permanecen intactas. DROP sin CASCADE:
dependencias externas bloquean la reversión. Si datos o esquema divergieron,
parar para conciliación; no se fuerza el rollback ni se borra información nueva.
Para un incidente mayor restaurar el dump primero en una base de recuperación
nueva, comparar y diseñar recuperación revisada. No usar pg_restore --clean sobre
DEV en funcionamiento. Esta entrega no autoriza ni ejecuta restauración real.

## Punto de parada y recomendación

SPEC-042/043 siguen En progreso a nivel de despliegue: código y ensayos locales
preparados; faltan preflight 043 real readonly y prueba PostgreSQL aislada. No
cerrarlas como aplicadas ni afirmar garantía absoluta basada en SQLite.
Siguiente paso: publicar esta preparación y revisar el plan readonly de Ubuntu.
Después, confirmación explícita antes de mantenimiento, apply o rollback.
