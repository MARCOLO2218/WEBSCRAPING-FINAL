# SPEC-038: evidencia antes de asignar países

036_existing y 037_countries están confirmadas en Ubuntu DEV según el handoff
2026-09-21. Esta entrega abre SPEC-038 con una auditoría de datos, sin migración,
reinicio del servicio ni cambios en consultas actuales. SPEC-038 sigue En progreso.

El informe recorre todos los productos en una transacción PostgreSQL readonly y
REPEATABLE READ. Agrupa por ejecución, tienda y dominios de ambas URLs, incluye
hasta tres pares de rutas por grupo, cuentas e IDs extremos. Conserva ejecuciones
vacías, source_process, referencias huérfanas y discrepancias de UUID. Las muestras
no certifican todas las rutas de un dominio: las fuentes compartidas requieren
una segunda consulta dirigida antes de asignar países. No hay backfill automático.
El timeout de cada consulta es 30 segundos; un error invalida el informe completo.

Validación Windows: `npm test` (74 aprobadas, incluye compilación) y
`.\.venv\Scripts\python.exe -m pytest tests -q` desde backend (67 aprobadas,
dos avisos existentes de dependencias). No se conectó a PostgreSQL real desde
Windows; la ejecución PostgreSQL queda pendiente del comando Ubuntu inferior.

## Windows PowerShell: publicación de esta entrega

Desde la raíz Git, agregar exclusivamente los cinco archivos nuevos siguientes.
Los cambios previos de SPEC-033/034 y los documentos existentes quedan intactos.
Revisar `git diff --cached --name-only` antes del commit: si ya había otros archivos
preparados, no incluirlos accidentalmente en este commit.

```powershell
cd "C:\Users\USER\source\repos\scraper 6"
git add -- "WEBSCRAPER DEV/specs/SPEC-038-origen-historial-y-aislamiento-regional.md" "WEBSCRAPER DEV/docs/SPEC-038_DEV.md" "WEBSCRAPER DEV/scripts/history-origin-dev.mjs" "WEBSCRAPER DEV/backend/catalog_api/db/history_origin.py" "WEBSCRAPER DEV/backend/tests/test_history_origin.py"
git diff --cached --name-only
git diff --cached --check
git commit -m "SPEC-038: preparar auditoria readonly del origen historico DEV"
git push
```

## Ubuntu DEV: descargar y consultar

Ejecutar después de publicar. Si pull falla por cambios locales, detenerse y
compartir el error; no reset ni stash pop automático. No requiere PM2 restart.

```bash
cd "/home/administradorgt/WEBSCRAPING-FINAL"
git pull --ff-only && (
  cd "/home/administradorgt/WEBSCRAPING-FINAL/WEBSCRAPER DEV" &&
  node scripts/history-origin-dev.mjs > /tmp/spec-038-origen-dev.json &&
  cat /tmp/spec-038-origen-dev.json
)
```

Compartir el JSON generado para verificar el origen real. Si el comando falla,
compartir el error y el contenido del archivo; no ejecutar ninguna migración.
Después se implementarán relaciones, backfill verificado y lectores/escritores
coordinados conforme a los criterios de SPEC-038. La misma base regional y el
destino Nuxt/FastAPI/ORM con login y países asignados siguen vigentes.
