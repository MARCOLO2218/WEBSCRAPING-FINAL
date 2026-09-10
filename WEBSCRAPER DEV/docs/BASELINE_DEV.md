# SPEC-036: registrar el esquema existente

La referencia baseline_reference.json conserva el informe Ubuntu v2, sólo
metadatos. El comando valida esa estructura y registra 036_existing. Su única
escritura es crear catalogo.alembic_version e insertar la revisión. Si ya está,
no la cambia. No crea tablas comerciales ni cambia IDs. Diferencias bloquean.

## Windows PowerShell

Desde la raíz del repositorio:

```powershell
git add -- "WEBSCRAPER DEV/backend/catalog_api/db/models.py" "WEBSCRAPER DEV/backend/catalog_api/db/baseline.py" "WEBSCRAPER DEV/backend/catalog_api/db/baseline_reference.json" "WEBSCRAPER DEV/backend/alembic.ini" "WEBSCRAPER DEV/backend/migrations/env.py" "WEBSCRAPER DEV/backend/migrations/versions/036_existing.py" "WEBSCRAPER DEV/backend/migrations/README.md" "WEBSCRAPER DEV/backend/tests/test_baseline.py" "WEBSCRAPER DEV/scripts/baseline-dev.mjs" "WEBSCRAPER DEV/specs/SPEC-036-adopcion-baseline.md" "WEBSCRAPER DEV/docs/BASELINE_DEV.md"
git diff --cached --check
git diff --cached --stat
git commit -m "Prepara adopcion del esquema existente en Alembic DEV"
git push origin main
```

Revisar que el índice no contenga archivos ajenos preparados antes.

## Ubuntu DEV

```bash
cd "$HOME/WEBSCRAPING-FINAL"
git pull --ff-only origin main
cd "WEBSCRAPER DEV"
node scripts/baseline-dev.mjs
```

Si pull informa conflictos, detenerse y conservar cambios locales.
Si el comando muestra listo_para_registrar, aplicar:

```bash
node scripts/baseline-dev.mjs --apply
```

Salida esperada: registrado (o ya_registrado), revision: 036_existing.
Compartir esa salida. No hacen falta dependencias nuevas ni reiniciar PM2.
Con diferencias o error, no usar stamp manual para saltar el control.
Bloqueos tienen límite de 5 segundos; consultas de 30 segundos, con rollback.
Variables PG del entorno prevalecen sobre .env como en Node; usar la sesión DEV
habitual sin variables de otra base.

## Validación y pendientes

Registro PostgreSQL real pendiente de ejecución por el usuario. El stamp se
prueba localmente con Alembic/SQLite, compilación de tipos PostgreSQL y referencia
real. No se probó una escritura PostgreSQL local. No certifica triggers ni vistas.
Node conserva temporalmente su DDL: coordinar retirada antes de la migración
regional. La siguiente etapa añadirá países en esta misma base y después usuarios.
No hay login ni cambio visual todavía.

Referencia: https://alembic.sqlalchemy.org/en/latest/api/commands.html#alembic.command.stamp
