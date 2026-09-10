# SPEC-035: preparar y auditar DEV

SQLAlchemy 2.0.52 y Alembic 1.19.2 quedan fijados en requirements.txt.
Pruebas locales: 74 Node y 45 Python aprobadas (dos advertencias previas de dependencias).
Modelos basados en el DDL Node, no todavía certificados contra Ubuntu.
No cambia el servidor web, Excel, datos ni rutas actuales.

## Windows PowerShell

Desde la raíz del repositorio, agregar únicamente esta entrega (los cambios
pendientes de SPEC-033/034 deben revisarse y publicarse por separado):

```powershell
git add -- "WEBSCRAPER DEV/backend/requirements.txt" "WEBSCRAPER DEV/backend/catalog_api/db" "WEBSCRAPER DEV/backend/alembic.ini" "WEBSCRAPER DEV/backend/migrations" "WEBSCRAPER DEV/backend/tests/test_orm.py" "WEBSCRAPER DEV/specs/SPEC-035-base-orm-auditoria.md" "WEBSCRAPER DEV/docs/ORM_DEV.md"
git diff --cached --check
git diff --cached --stat
git commit -m "Prepara ORM y auditoria de esquema DEV"
git push origin main
```

Revisar que el índice no incluya archivos ajenos preparados anteriormente.

## Ubuntu DEV

```bash
cd ~/WEBSCRAPING-FINAL
git status --short
git pull --ff-only origin main
cd "WEBSCRAPER DEV"
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
npm test
cd backend
.venv/bin/python -m pytest tests -q
cd ..
```

Si pull detecta conflicto, detenerse y revisar; conservar cambios operativos.
El comando siguiente hereda las variables del .env DEV usando dotenv ya existente
y ejecuta exclusivamente el auditor de metadatos. No muestra credenciales:

```bash
node --input-type=module -e 'import dotenv from "dotenv"; import {spawnSync} from "node:child_process"; dotenv.config({quiet:true}); const r=spawnSync("./.venv/bin/python",["-m","catalog_api.db.audit"],{cwd:"backend",env:process.env,stdio:"inherit"}); process.exit(r.status ?? 1);'
```

Compartir la salida para definir el baseline. Código 0: columnas/tipos/nulabilidad
coinciden; 1: diferencias; 2: no se pudo auditar. Incluso con 0,
baseline_validated sigue false: claves e índices requieren revisión, al igual que
defaults y secuencias (estos últimos no están incluidos en esta primera auditoría).
No ejecutar upgrade/stamp; están bloqueados. No hace falta reiniciar PM2.

## Siguiente entrega

Contrastar metadatos reales, completar baseline y propiedad del DDL; luego
usuarios, asignaciones por país y sesiones; finalmente interfaz Nuxt.
La consulta ORM piloto latest_run está probada aisladamente, aún no conectada a
las rutas HTTP. La paridad con PostgreSQL real sigue pendiente.

Referencias: https://docs.sqlalchemy.org/en/20/core/reflection.html y
https://alembic.sqlalchemy.org/en/latest/autogenerate.html
