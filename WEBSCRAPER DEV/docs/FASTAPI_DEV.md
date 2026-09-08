# FastAPI piloto DEV — SPEC-024

Actualizacion SPEC-028: disponible GET /api/export.csv, sin cambio del frontend.
Consultar [guia de exportacion](EXPORTACION_FASTAPI_DEV.md) para comandos actuales.
Ejecutar npm test en WEBSCRAPER DEV antes de la suite Pytest de los ejemplos
inferiores: las pruebas nuevas comparan bytes con el exportador Node compilado.
La suite Python completa ahora tiene 28 pruebas.

El servicio vive en backend/catalog_api. Node conserva el catálogo actual en su puerto habitual. FastAPI escucha por defecto en 127.0.0.1:8000; SPEC-025 incorpora GET /api/products, /api/latest-run y /api/summary con conexión PostgreSQL directa.

Requiere Python 3.10 o superior con pip y venv. Instalarlo en el equipo de desarrollo o servidor, no en las computadoras de los usuarios del catálogo. El ejemplo previo repos/fastapi no es el servicio de esta spec.

## Windows PowerShell

Desde una instalación de Python disponible como python (o sustituir por la ruta de su ejecutable):

```powershell
cd "C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV"
python -m venv backend/.venv
.\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
cd backend
.\.venv\Scripts\python.exe -m pytest tests -q
.\.venv\Scripts\python.exe -m catalog_api
```

No recrear el entorno en cada arranque. Para iniciar después basta con los últimos comandos cd y python -m catalog_api. Detener con Ctrl+C.

## Ubuntu DEV

Requiere python3, pip y soporte venv instalados por el administrador. El usuario ejecuta estos comandos una vez que haya subido los archivos y actualizado DEV:

```bash
cd "/home/administradorgt/WEBSCRAPING-FINAL/WEBSCRAPER DEV"
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
cd backend
.venv/bin/python -m pytest tests -q
.venv/bin/python -m catalog_api
```

Este arranque es manual para validar el piloto; servicio permanente y proxy se configurarán en una etapa posterior. No reemplazar el proceso PM2 de Node.

## Configuración

CATALOG_API_HOST y CATALOG_API_PORT se leen del entorno al ejecutar python -m catalog_api. No se carga el archivo .env de Node. Los valores por defecto son 127.0.0.1 y 8000. Ejemplo de puerto alternativo:

```powershell
$env:CATALOG_API_PORT = "8001"
```

```bash
export CATALOG_API_PORT=8001
```

En el mismo equipo que ejecuta el servicio, abrir http://127.0.0.1:8000/health y http://127.0.0.1:8000/docs. GET /health responde con status=ok, service=catalog-api y environment=dev: confirma solo que el proceso responde, no la disponibilidad de base de datos.

Pruebas basadas en TestClient y Pytest según https://fastapi.tiangolo.com/tutorial/testing/ .

## Consultas PostgreSQL (SPEC-025)

Actualizar dependencias con los comandos de instalación anteriores. Configurar PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD, PGSCHEMA y PGSSL en el entorno del proceso Python con los valores de DEV. La aplicación no carga automáticamente el .env de Node ni imprime credenciales. PGSSL=true solicita SSL; por defecto está desactivado como en Node. Salud sigue funcionando sin base de datos.

Consultar /api/products?tienda=FACENCO, /api/latest-run y /api/summary. Se documentan los seis filtros en /docs; esta API admite GET, mientras Node conserva su comportamiento previo. El complemento Excel usa la ruta fija WEBSCRAPER DEV/data/precios_facenco.xlsx, independiente del directorio de arranque.

La consulta conserva la inicialización de snapshots del servicio Node (CREATE TABLE IF NOT EXISTS e INSERT de snapshots faltantes); aunque los endpoints sean de consulta, requieren esos permisos. No cambian snapshots ya publicados. La renovación por tres horas o mayor conteo sigue siendo responsabilidad del flujo de publicación existente. No ejecutar con credenciales PROD.

La paridad contra una base DEV real y el despliegue Ubuntu están pendientes de validación operativa. Pruebas locales usan conexiones simuladas y Excel temporal. Referencias: https://www.psycopg.org/psycopg3/docs/basic/usage.html y https://openpyxl.readthedocs.io/en/stable/tutorial.html .

## Acceso de usuarios

SPEC-027 añade modelos de productos, última ejecución, resumen y error en /docs.
La suite local tiene 21 pruebas. No requiere dependencias nuevas, migraciones de
datos ni reiniciar Node. No hay cambio visual en el catálogo con esta etapa.

### Aplicar SPEC-027

Windows PowerShell, después de revisar y guardar por separado las etapas previas
(main.py depende de SPEC-025; no publicar únicamente esta etapa en una rama antigua):

```powershell
cd "C:\Users\USER\source\repos\scraper 6"
git add "WEBSCRAPER DEV/backend/catalog_api/models.py" "WEBSCRAPER DEV/backend/catalog_api/main.py" "WEBSCRAPER DEV/backend/tests/test_contracts.py" "WEBSCRAPER DEV/specs/SPEC-027-contratos-fastapi.md" "WEBSCRAPER DEV/specs/README.md" "WEBSCRAPER DEV/docs/MIGRATION_PLAN.md" "WEBSCRAPER DEV/docs/WORKFLOW_AND_HANDOFF.md" "WEBSCRAPER DEV/docs/ARCHITECTURE.md" "WEBSCRAPER DEV/docs/API_CONTRACTS.md" "WEBSCRAPER DEV/docs/FASTAPI_DEV.md"
git diff --cached --stat
git commit -m "Define contratos de lectura FastAPI DEV"
git push
```

Ubuntu DEV (el usuario ejecuta; no modifica PM2 ni PROD):

```bash
cd "/home/administradorgt/WEBSCRAPING-FINAL"
git pull
cd "WEBSCRAPER DEV/backend"
.venv/bin/python -m pytest tests -q
.venv/bin/python -m catalog_api
```

Si el piloto manual ya está ejecutándose, detenerlo primero con Ctrl+C en su
terminal. Revisar /docs desde el mismo servidor o mediante el acceso interno
configurado; no abrir públicamente el puerto 8000 para esta prueba.

La URL de los usuarios debe mantenerse fija en el servidor y ser compartida por GT, HN, SV y NC; FastAPI tendrá un puerto interno. El selector y el proxy aún están pendientes. La dirección real del servidor se verificará antes de configurar accesos remotos.

El script actual crear_acceso_directo.ps1 inicia INICIAR_CATALOGO.vbs, que ejecuta iniciar_catalogo_oculto.ps1. Este abre localhost e inicia Node localmente. Se conserva como está en esta spec; no se debe confundir con un acceso remoto ya implementado.

No copiar .venv entre Windows y Ubuntu, ni publicar .env o cachés. Las dependencias directas están fijadas a las versiones instaladas para esta validación; las transitivas las resuelve pip.
