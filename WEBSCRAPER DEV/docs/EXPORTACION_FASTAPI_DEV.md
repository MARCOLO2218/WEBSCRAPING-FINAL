# Exportacion FastAPI DEV - SPEC-028

GET /api/export.csv descarga catalogo_comercial_comparativo.csv. Acepta semana,
tienda, marca, categoria, disponibilidad y q. Usa la misma consulta que productos,
con snapshots y complemento FACENCO. Conserva el comportamiento actual del
complemento Excel posterior al filtro SQL. No modifica el boton del frontend.

En el equipo donde corre el piloto, probar en /docs o descargar desde
http://127.0.0.1:8000/api/export.csv?tienda=FACENCO . Requiere las variables PG*
de DEV configuradas como explica FASTAPI_DEV.md. No usar credenciales PROD.
No se ha realizado esta validacion contra la base real.

## Windows PowerShell

Pruebas locales (entornos de las specs previas ya instalados):

```powershell
cd "C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV"
npm test
cd backend
.\.venv\Scripts\python.exe -m pytest tests -q
```

Antes de publicar, revisar y guardar por separado las etapas anteriores: esta
spec depende del backend y del Node modularizado existentes. No basta publicar
estos archivos sobre una rama que no contenga las specs previas. Los documentos
y main.py incluyen cambios anteriores que tambien deben revisarse.

```powershell
cd "C:\Users\USER\source\repos\scraper 6"
git add "WEBSCRAPER DEV/backend/catalog_api/export.py" "WEBSCRAPER DEV/backend/catalog_api/main.py" "WEBSCRAPER DEV/backend/tests/test_export.py" "WEBSCRAPER DEV/specs/SPEC-028-exportacion-csv-fastapi.md" "WEBSCRAPER DEV/specs/README.md" "WEBSCRAPER DEV/docs/MIGRATION_PLAN.md" "WEBSCRAPER DEV/docs/ARCHITECTURE.md" "WEBSCRAPER DEV/docs/WORKFLOW_AND_HANDOFF.md" "WEBSCRAPER DEV/docs/API_CONTRACTS.md" "WEBSCRAPER DEV/docs/FASTAPI_DEV.md" "WEBSCRAPER DEV/docs/EXPORTACION_FASTAPI_DEV.md"
git diff --cached --stat
git commit -m "Agrega exportacion CSV FastAPI DEV"
git push
```

## Ubuntu DEV

El usuario ejecuta, con dependencias de las etapas anteriores instaladas:

```bash
cd "/home/administradorgt/WEBSCRAPING-FINAL"
git pull
cd "WEBSCRAPER DEV"
npm test
cd backend
.venv/bin/python -m pytest tests -q
.venv/bin/python -m catalog_api
```

Detener primero el piloto manual anterior con Ctrl+C si esta activo. No reiniciar
Node ni modificar PM2 para esta etapa. No abrir publicamente el puerto 8000.
La suite Python requiere Node y dist generado por npm test para comparar CSV.
Resultado local: 28 pruebas Python, 67 Node. Sin dependencias nuevas.
