# Handoff completo — WEBSCRAPER DEV

Actualizado: 2026-09-07. Este documento permite continuar el proyecto en otro
chat sin depender del historial anterior.

## Instruccion para el siguiente modelo

Trabajar exclusivamente en:

```text
C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV
```

Antes de editar, leer completamente `AGENTS.md`, este documento,
`docs/PRODUCT_VISION.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`,
`docs/MIGRATION_PLAN.md`, `docs/WORKFLOW_AND_HANDOFF.md` y `specs/README.md`.
Revisar `git status` y `src/specs/`. Continuar desde el primer pendiente; no
reiniciar el proyecto ni repetir specs completadas.

Reglas obligatorias:

- No modificar `WEBSCRAPER PROD` sin solicitud expresa.
- No copiar, mostrar ni confirmar `.env` o credenciales.
- Preservar cambios existentes y respaldos eliminados; pertenecen al usuario.
- Crear o actualizar una spec antes de cada cambio funcional.
- Ejecutar `npm test` y las pruebas Python antes de entregar.
- El usuario ejecuta Git, `git pull`, Ubuntu y PM2. Entregarle comandos exactos.
- No usar `git add .`; seleccionar archivos del trabajo actual.
- No promover a PROD hasta aprobación expresa después de validar DEV.

## Objetivo y alcance

Catálogo comercial que recopila, conserva y compara camas y colchones. Hoy opera
Guatemala con 19 tiendas. La visión aprobada es una sola plataforma para:

| Código interno | País | Moneda prevista | Estado |
|---|---|---|---|
| GT | Guatemala | GTQ | Operativo en Node |
| HN | Honduras | HNL | Piloto futuro |
| SV | El Salvador | USD | Futuro |
| NC | Nicaragua | NIO | Futuro |

Costa Rica está excluida. Aunque el estándar internacional suele usar `NI`, el
negocio pidió explícitamente `NC`; no cambiarlo sin autorización.

## Arquitectura actual y destino

Actual:

```text
Navegador -> Node catalog-server (3030 DEV) -> PostgreSQL
                         |
                         +-> proceso TypeScript/Playwright -> sitios externos

FastAPI piloto (127.0.0.1:8000) -> PostgreSQL
```

Node continúa siendo el servidor que usa la pantalla. FastAPI existe en paralelo
y todavía no recibe el tráfico del frontend ni está desplegado como servicio
permanente.

Destino:

```text
Frontend -> URL estable/proxy -> FastAPI -> PostgreSQL regional
                                      |
                                      +-> cola externa -> workers TypeScript
```

Los scrapers se conservan en TypeScript/Playwright inicialmente. No reescribirlos
en Python. La API, base y frontend serán compartidos; los datos se segmentarán por
país. La recomendación aceptada es una base regional, no cuatro bases, salvo una
futura obligación legal, operativa o de escala.

## Estructura relevante

```text
WEBSCRAPER DEV/
  AGENTS.md
  src/
    catalog-server.ts              composición/arranque Node
    scrape-facenco-energy.ts       coordinador de extracción
    config/
      store-catalog.ts             19 tiendas GT y selección válida
      store-rules.ts               mínimos y reintentos
    domain/product.ts              tipos y normalización
    persistence/postgres.ts        configuración/escritura PostgreSQL
    scrapers/
      types.ts
      shared/visual-engine.ts
      gt/                           extractores modulares GT
    server/
      http.ts                       respuestas/estáticos/proxy imagen
      catalog-service.ts            consultas, Excel, comparación, CSV
      scraper-job-queue.ts          cola local en memoria
      routes.ts                     rutas Node
      facenco-upload.ts             validación/guardado XLSX
    specs/                          pruebas Node ejecutables
  public/
    index.html, app.js, styles.css  frontend actual
    price-upload.js                 carga FACENCO
  backend/
    catalog_api/
      main.py                       aplicación/rutas FastAPI
      config.py, __main__.py        host/puerto y arranque
      catalog.py                    consultas/Excel/comparación
      models.py                     contratos Pydantic/OpenAPI
      export.py                     CSV compatible con Node
      sql/                          snapshots y productos
    tests/                          pruebas Pytest
    requirements*.txt
  data/precios_facenco.xlsx         archivo operativo de precios
  specs/                            especificaciones permanentes 001–028
  docs/                             arquitectura, contratos y guías
```

## Scrapers Guatemala creados/separados

El catálogo central tiene 19 tiendas habilitadas. Registro:
`src/config/store-catalog.ts`; coordinación: `src/scrapers/gt/registry.ts`.

| Módulo | Tiendas |
|---|---|
| `visual-stores.ts` | La Curacao, Elektra, Cemaco, Dormilandia |
| `paged-visual-stores.ts` | Dormisuenos, Bodegangas |
| `api-stores.ts` | Americana 2000, Suena Center |
| `card-stores.ts` | Sleep Gallery, Serta, Mattress |
| `max.ts` | MAX Guatemala |
| `walmart.ts` | Walmart Guatemala |
| `siman.ts` | Siman Guatemala |
| `beds-dreams.ts` | Beds & Dreams |
| `furniture-city.ts` | Furniture City Guatemala |
| `olympia-la-colchoneria.ts` | Camas Olympia, La Colchonería |
| `facenco.ts` | FACENCO |

Reglas que no deben romperse: una tienda fallida no debe detener las demás; la
publicación visual se protege por tienda durante tres horas; un resultado con
mayor cantidad puede publicarse antes; Run ID muestra la última ejecución de DB.

## API Node actual

Contratos completos: `docs/API_CONTRACTS.md`.

- `GET /api/products` con filtros `semana`, `tienda`, `marca`, `categoria`,
  `disponibilidad`, `q`.
- `GET /api/latest-run`, `/api/summary`, `/api/export.csv`.
- `GET /api/image?url=...` proxy de imágenes.
- `POST /api/run-scraper`; `GET /api/scraper-job`; `GET /api/scraper-status`.
- `POST /api/facenco-prices` y `?confirm=true` para revisar/guardar XLSX.
- `/output/comparacion_colchones.csv` conserva la descarga histórica.

La cola Node está en memoria, máximo 50 trabajos finalizados, y se pierde al
reiniciar. El frontend consume todavía estos endpoints Node.

## FastAPI implementado

Specs 024, 025, 027 y 028:

- `/health`, `/docs`, `/openapi.json`.
- `GET /api/products`, `/api/latest-run`, `/api/summary`.
- `GET /api/export.csv`, con los seis filtros y paridad de formato Node.
- Modelos Pydantic para productos, última ejecución, resumen y error genérico.
- IDs `BIGINT` serializados como string; fechas en ISO; decimales como número.
- Consultas con parámetros ligados y esquema validado.
- Lee `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSCHEMA`,
  `PGSSL` del entorno. No carga automáticamente el `.env` de Node.
- FastAPI usa `CATALOG_API_HOST`/`CATALOG_API_PORT`; defaults
  `127.0.0.1:8000`.
- Salud no prueba DB. Las lecturas inicializan snapshots faltantes y por eso las
  credenciales requieren permisos de escritura inicial.

Dependencias fijadas: FastAPI 0.141.1, Uvicorn 0.52.4, psycopg binary 3.3.5,
openpyxl 3.1.5, pytest 9.1.1 y httpx 0.28.1.

## Carga XLSX FACENCO

SPEC-026 agrega el panel visual “Subir precios FACENCO” debajo del estado del
catálogo. Flujo: elegir `.xlsx` -> Revisar archivo -> Confirmar actualización.

- Hoja `Precios FACENCO`, encabezados en fila 4, datos desde fila 5.
- Valida encabezados, duplicados, producto, precios, moneda GTQ, activo SI/NO,
  fecha y objetos/fórmulas no admitidos.
- Máximo 5 MB, 10 000 registros y 50 columnas.
- Preview no escribe. Confirmación revalida, crea respaldo en `data/backups/`,
  escribe temporal y reemplaza atómicamente el archivo.
- No ejecuta el scraper. Recarga productos al guardar.
- No hay autenticación/roles; no llevar a PROD así sin decidir control de acceso.
- La exclusión de filas incorrectas no es silenciosa: devuelve fila/campo para
  corregir. Solo las filas marcadas `NO` o plantillas vacías se omiten.

El archivo real se validó en modo lectura y tenía cuatro productos válidos en ese
momento. No se modificó durante las pruebas. Existe actualmente
`data/~$precios_facenco.xlsx`, probablemente bloqueo temporal de Excel: no agregar
a Git ni borrar sin confirmar que Excel esté cerrado y que el usuario lo autorice.

## Specs y pruebas

SPEC-030 completada: herramienta backend/catalog_api/parity.py con casos JSON,
comparación HTTP de productos/resumen/Run ID/CSV y detección de inestabilidad.
Guía docs/PARIDAD_FASTAPI_DEV.md. Validación actual: 67 Node y 39 Python aprobadas,
dos avisos de dependencias. Solo transporte simulado; PostgreSQL real sigue pausado.

Actualización posterior al traspaso: SPEC-029 registra como Propuesta el formato
de datos por país/moneda y filtros recordados en el navegador (GT/GTQ, HN/HNL,
SV/USD, NC/NIO). Se integra en la etapa regional antes del piloto HN; primero
modelo y aislamiento, después carga y filtros. Estructura XLSX pendiente de
definir. Solo documentación; no se modificaron datos operativos ni código.

`specs/README.md` registra 001–030. SPEC-029 está propuesta y SPEC-030 completada. De 001–028, todas están completadas excepto SPEC-003,
regionalización, que sigue como propuesta. “Completada” significa implementada y
probada localmente dentro de su alcance, no desplegada.

Última validación conocida:

- `npm test`: build TypeScript y 67 pruebas Node aprobadas.
- Pytest: 28 aprobadas y dos warnings de dependencias TestClient/AnyIO.
- CSV FastAPI se comparó byte a byte con el exportador Node en fixtures.
- `git diff --check`: sin errores; solo avisos CRLF habituales.

Las pruebas Python de CSV invocan el Node compilado: ejecutar `npm test` antes de
Pytest. No se probó todavía PostgreSQL real, navegador/Excel en DEV ni Ubuntu.

## Decisiones tomadas

1. Refactor incremental, no reescritura total.
2. `store-catalog.ts` es la fuente única de tiendas habilitadas.
3. FastAPI reemplaza Node gradualmente; scrapers siguen como workers TypeScript.
4. Todo se valida primero en DEV; PROD solo por aprobación expresa.
5. Países: GT, HN, SV y NC; Costa Rica excluida.
6. Preferir una base regional segmentada por país y moneda.
7. Un selector cambia tiendas, productos, moneda, filtros, resumen y trabajos;
   la API debe validar el país, no solo el frontend.
8. Una URL estable del servidor será el único acceso de usuarios.
9. El puerto 8000 de FastAPI es interno y debe quedar detrás de proxy.
10. Tiendas Relax (`https://tiendasrelax.com/`) será el piloto HN Shopify, HNL,
    inicialmente Camas Relax, Sealy y Stearns & Foster. No implementarlo antes de
    aislar país y moneda.

## Acceso directo

El flujo actual NO es remoto:

```text
crear_acceso_directo.ps1 -> INICIAR_CATALOGO.vbs
 -> iniciar_catalogo_oculto.ps1 -> compila/inicia Node -> localhost:3030
```

Requiere Node en cada computadora. El objetivo futuro es que el acceso directo
abra una URL estable del servidor y no instale/inicie Node, Python, PostgreSQL o
scrapers localmente. La URL/IP real no se conoce; no inventarla. Actualizar el
backend no debe obligar a recrear accesos si la URL permanece igual.

## Estado Git crítico

Repositorio raíz: `C:\Users\USER\source\repos\scraper 6`; rama `main`; HEAD
observado: `3c445be Definir regionalizacion para cuatro paises en DEV`.

Hay una gran cantidad de cambios DEV acumulados sin commit, incluidos archivos
nuevos de specs 004–028, módulos, tests, FastAPI y carga Excel. También aparecen
modificaciones y eliminaciones dentro de `WEBSCRAPER PROD` y respaldos antiguos;
son cambios ajenos o preexistentes y deben preservarse. No restaurarlos, borrarlos,
editar PROD ni incluirlos en commits DEV.

Antes de continuar, ejecutar `git status --short`. No asumir que los archivos del
handoff ya están en Git. No usar `git add .`, `git add -A` ni commits amplios sin
revisar exactamente el diff. Este handoff tampoco autoriza ejecutar Git.

## Pendientes, en orden recomendado

1. Subir/reunir de forma controlada los cambios DEV acumulados, si el usuario lo
   solicita, sin incluir PROD, `data/~$precios_facenco.xlsx`, `.env`, `.venv`,
   logs, datos generados ni `outputs/`.
2. Validar FastAPI contra PostgreSQL real DEV: comparar Node/FastAPI para
   productos, seis filtros, último Run ID, resumen y CSV.
3. Validar en navegador DEV el panel de carga: archivo correcto, error de celda,
   preview, confirmación, respaldo y recarga. No usar PROD.
4. Publicar FastAPI en Ubuntu DEV como piloto interno y probar `/health`, `/docs`
   y lecturas. Todavía no sustituir Node ni abrir el puerto 8000 públicamente.
5. Solo después de paridad, preparar la integración gradual/proxy del frontend.
6. Diseñar/implementar modelo de países y moneda con migración compatible que
   marque datos actuales como GT, restricciones e índices compuestos.
7. Implementar selector GT/HN/SV/NC y aislamiento API/UI.
8. Implementar el piloto Tiendas Relax HN y luego agregar dos o tres tiendas HN.
9. Incorporar SV y NC gradualmente.
10. Implementar URL estable/acceso remoto cuando el usuario provea o confirme la
    dirección del servidor.
11. Más adelante: cola externa, workers, trabajos FastAPI, autenticación para
    cargas, frontend separado y retiro de Node tras equivalencia completa.

## Bloqueo operativo actual

En la última revisión local no había procesos escuchando en 3030, 8000 o 5432,
ni variables `PG*` configuradas en la sesión. Sí existe `.env`, pero no se leyó
ni se debe imprimir. Para validar con datos reales hay que decidir si será en
Windows o Ubuntu DEV y configurar variables de forma segura. El usuario pidió
esperar antes de realizar esa validación.

## Comandos locales

Windows PowerShell:

```powershell
cd "C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV"
npm install
npm test
npm run build
npm run catalog
```

FastAPI (entorno ya creado en este equipo; Python no estaba globalmente en PATH):

```powershell
cd "C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV"
npm test
cd backend
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m pytest tests -q
.\.venv\Scripts\python.exe -m catalog_api
```

Node catálogo: `http://localhost:3030`. FastAPI: `http://127.0.0.1:8000`.
Detener procesos manuales con Ctrl+C.

## Git: patrón que debe ejecutar el usuario

No existe una lista corta segura para todo lo acumulado sin una revisión de diff.
Para cada spec nueva, entregar una lista explícita como:

```powershell
cd "C:\Users\USER\source\repos\scraper 6"
git status --short
git add "WEBSCRAPER DEV/ruta/archivo-1" "WEBSCRAPER DEV/ruta/archivo-2"
git diff --cached --stat
git diff --cached
git commit -m "Descripcion concreta DEV"
git push
```

Nunca incluir rutas `WEBSCRAPER PROD`, `.env`, `backend/.venv`, `node_modules`,
`logs`, `outputs`, archivos `~$*.xlsx` ni datos operativos sin autorización.

## Ubuntu DEV

Después de que el usuario confirme que los cambios correctos están en Git:

```bash
cd "/home/administradorgt/WEBSCRAPING-FINAL"
git pull

cd "/home/administradorgt/WEBSCRAPING-FINAL/WEBSCRAPER DEV"
npm install
npm test
npm run build
pm2 restart webscraper-dev --update-env
pm2 logs webscraper-dev --lines 80
```

Piloto FastAPI independiente, sin reemplazar PM2 Node:

```bash
cd "/home/administradorgt/WEBSCRAPING-FINAL/WEBSCRAPER DEV"
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
npm test
cd backend
.venv/bin/python -m pytest tests -q
.venv/bin/python -m catalog_api
```

No copiar `.venv` entre Windows/Ubuntu. Configurar `PG*` DEV en el proceso sin
imprimir credenciales. El arranque FastAPI sigue manual; servicio permanente y
proxy son tareas futuras. PROD usa otro ambiente/puerto y no se actualiza aquí.

## Mensaje recomendado para el chat nuevo

```text
Trabaja únicamente en C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV.
Lee completamente AGENTS.md y docs/HANDOFF_COMPLETO.md antes de actuar; después
lee los documentos y specs que el handoff exige. Revisa git status y preserva
todos los cambios existentes. No modifiques PROD, no copies ni muestres .env,
no restaures respaldos y no uses git add .. El usuario ejecuta Git y Ubuntu.
Continúa desde el primer pendiente seguro, creando una spec y pruebas. La
validación de PostgreSQL real quedó pausada por el usuario; no la ejecutes hasta
que indique Windows o Ubuntu DEV y autorice continuar.
```
