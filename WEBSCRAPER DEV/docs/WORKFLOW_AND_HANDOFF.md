# Continuidad y flujo de trabajo

Actualización 2026-09-26: el sprint de demo de Nicaragua y acceso por país se
cerró al 100% por confirmación del usuario. SPEC-054 está validada en Ubuntu DEV
(127/127 pruebas) y Nicaragua sigue apagada. SPEC-056 fue aprobada visualmente
por el usuario. Los incrementos locales SPEC-057/058/059 preparan lector, ruta y
dependencias regionales inyectables. Ninguno está montado ni conectado a
PostgreSQL. No ejecutar migraciones ni modificar PROD.

Actualización SPEC-060: dos pruebas de integración local conectan el
`AuthRepository` real con la ruta y el lector regional usando SQLite temporal.
La suite quedó en 292 pruebas Python aprobadas, una PostgreSQL optativa omitida
y 134 pruebas Node aprobadas. No es validación Ubuntu/PostgreSQL ni activa
rutas en `main.py`.

SPEC-061 dejó documentado el plan para la base DEV original. Los runners de
migración/bootstrap sólo permiten `webscraper_dev`/`webscraper_user`, y el
backfill 042 no recibe nuevas publicaciones automáticamente. No intentar otra
base ni montar el lector hasta tener autorización y resolver frescura regional.

SPEC-062 trazó el escritor Node: run, productos y snapshot legacy se confirman
juntos; la publicación sólo cambia tras vencer tres horas o superar el conteo.
El diseño regional debe seguir ese resultado dentro de la transacción. No se
implementó dual-write; falta resolver PK global `store_key`, ledger/verificador
incremental y el contrato de filas del complemento FACENCO. SPEC-063/064 crean un clasificador TS/Python con
corpus compartido y regla 038-origin-v3; `C$` se clasifica como NIO. No se conecta
al escritor ni habilita Nicaragua. Suites completas: 156 Node aprobadas; 293
Python aprobadas, una PostgreSQL opcional omitida y dos avisos de deprecación.

Revisión estática de identidad regional (2026-09-26): la clave legacy es el
nombre de `source_site`; varios nombres GT no incluyen país, aunque los NC sí.
Mantener los nombres actuales y fallar cerrado ante una asociación de la misma
clave con países distintos. `verify_projection()` de la revisión 043 describe
el backfill inicial y no valida por sí solo escrituras futuras. SPEC-062 ahora
requiere un ledger append-only que compruebe el baseline más cada run confirmado,
sin cambiar la huella original. FACENCO Excel se definió como complemento
independiente fuera de PostgreSQL, filtrado por país/moneda y sin runs simulados;
queda decidir cómo ocultar/marcar precios con `fecha_vigencia` ausente o vencida.
Implementación local acotada: Node fusiona Excel/PostgreSQL por país+código y
permite fallback por nombre sólo para Guatemala; hay dos pruebas de homónimos y
códigos repetidos entre países. Comparaciones Node/Python acotadas por país y
moneda con pruebas de nombres homónimos GT/NC. API sigue GT-only. Validación:
162 Node y 295 Python aprobadas, una PostgreSQL opcional omitida y dos avisos de
deprecación; sin conexión a PostgreSQL.

SPEC-065 registra seis tiendas candidatas HN/SV, todas deshabilitadas. Walmart
HN tiene primer extractor VTEX paginado, validado offline con fixtures y
aislamiento de host/HNL/deduplicación. La API real fue bloqueada por el navegador
del entorno; piloto de cobertura pendiente. El extractor no se importa al
ejecutor global. `npm test`: 167 aprobadas.

Estado vigente: SPEC-042/043 completadas en copia PostgreSQL y revertidas a
`037_countries`. Revisar `docs/SPEC-042-043_CIERRE_COPIA.md`.

Flujo confirmado: Windows→GitHub→Ubuntu DEV. El código SPEC-042/043 se publicó
en `d89b97b`; la preparación NC de SPEC-039 en `ea417ed`. El usuario confirmó el
pull Ubuntu a `ea417ed`, 86 pruebas Node y 137 Python aprobadas, con dos avisos de
deprecación. No se aplicaron migraciones ni se solicitó reinicio PM2.

Sigue pendiente autorizar una migración de la base DEV original, con plan y
respaldo propios. La publicación del código no habilita NC ni introduce login
o pantallas nuevas. El usuario conserva el flujo de comandos Git y Ubuntu;
la autorización anterior de push no implica nuevos commits/push automáticos.

Los handoffs y apartados de progreso que siguen en este documento describen
estados anteriores; consultar el encabezado y `docs/MIGRATION_PLAN.md` para el
estado vigente. Conservarlos como historial, no como órdenes actuales.

## Ubicacion oficial

```text
C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV
```

El trabajo de arquitectura se realiza exclusivamente en DEV. PROD se mantiene estable hasta una promocion solicitada y aprobada por el usuario.

## Estado actual

- El sistema mantiene 19 tiendas de Guatemala.
- El backend y los scrapers siguen en TypeScript.
- El frontend actual permanece en `public/`.
- Se creo un catalogo central en `src/config/store-catalog.ts`.
- Las pruebas ejecutables viven en `src/specs/`.
- Las specs permanentes viven en `specs/`.
- Los contratos actuales de la API Node viven en `docs/API_CONTRACTS.md`.
- Los tipos y la normalizacion comun de productos viven en `src/domain/product.ts`.
- Los minimos de calidad y reintento viven en `src/config/store-rules.ts`.
- La escritura y configuracion PostgreSQL viven en `src/persistence/postgres.ts`.
- El registro de los 19 scrapers GT vive en `src/scrapers/gt/registry.ts`.
- El motor visual reutilizable vive en `src/scrapers/shared/visual-engine.ts`.
- La Curacao, Elektra, Cemaco y Dormilandia se configuran en `src/scrapers/gt/visual-stores.ts`.
- Dormisuenos y Bodegangas viven en `src/scrapers/gt/paged-visual-stores.ts`.
- Americana 2000 y Suena Center viven en `src/scrapers/gt/api-stores.ts`.
- El extractor especializado de MAX vive en `src/scrapers/gt/max.ts`.
- El extractor especializado de Walmart vive en `src/scrapers/gt/walmart.ts`.
- El extractor paginado de Siman vive en `src/scrapers/gt/siman.ts`.
- Sleep Gallery, Serta y Mattress viven en `src/scrapers/gt/card-stores.ts`.
- Beds & Dreams vive en `src/scrapers/gt/beds-dreams.ts`.
- Furniture City vive en `src/scrapers/gt/furniture-city.ts`.
- Olympia y La Colchonería viven en `src/scrapers/gt/olympia-la-colchoneria.ts`.
- FACENCO vive en `src/scrapers/gt/facenco.ts`.
- Las utilidades HTTP del servidor viven en `src/server/http.ts`.
- La consulta, complemento FACENCO, comparación y CSV viven en `src/server/catalog-service.ts`.
- La ejecución y cola local de trabajos viven en `src/server/scraper-job-queue.ts`.
- Las rutas y handlers Node viven en `src/server/routes.ts`; `src/catalog-server.ts` solo compone y arranca.
- FastAPI tiene salud y lecturas /api/products, /api/latest-run, /api/summary con PostgreSQL directo y modelos de respuesta OpenAPI en backend/catalog_api (21 pruebas, SPEC-027). Guía: docs/FASTAPI_DEV.md.
- La pantalla Node incluye carga de precios FACENCO con revisión, confirmación y respaldo (SPEC-026). Guía: docs/CARGA_PRECIOS_FACENCO.md. 67 pruebas Node aprobadas.

## Siguiente trabajo

SPEC-039 está cerrada para el lote de capturas: Camas 53/54, categoría superior
67/68 y cuatro rutas por tamaño confirmadas manualmente como terminadas. La
omisión puntual autorizada no altera `count_mismatch`; no se conoce la identidad
faltante ni si es el mismo producto en ambos conjuntos. NC sigue no operativo.
Ver `docs/SPEC-039_EVIDENCIA_DOM.md`.

Se continúa SPEC-034 mediante SPEC-044, completada localmente: política de
autorización y contexto de país por petición, con adaptadores y datos de prueba
en memoria. Pruebas: 96 Node y 230 Python aprobadas (93 nuevas de acceso); dos
avisos previos de dependencias Python. No hay login ni
rutas regionales activadas. Próximo incremento: autenticación y sesiones reales
probadas de forma aislada; después lectores regionales y Nuxt. La migración
original requiere autorización independiente. Guía: `docs/ACCESO_REGIONAL_DEV.md`.
No hacer commit/push automático; el usuario mantiene Windows→GitHub→Ubuntu DEV.

Los bloques de prioridad fechados debajo son notas históricas preservadas.

Actualización 2026-09-08: usuario confirmó SPEC-031 visible en Ubuntu DEV
(4788bcc). SPEC-032 implementa localmente catálogo TypeScript país/moneda y
validación de pares; 70 Node y 39 Python aprobadas. Publicación pendiente.
Siguiente: definir formato Excel y preparar aislamiento regional de datos/API
antes de habilitar filtros. Paridad real FastAPI pendiente, puerto 8000 ocupado
por Docker; piloto alternativo no necesario para servir la pantalla Node actual.

SPEC-030 completó la herramienta de comparación HTTP y sus pruebas simuladas.
Guía: docs/PARIDAD_FASTAPI_DEV.md. Última suite: 67 Node y 39 Python aprobadas,
dos avisos de dependencias. Falta elegir Windows o Ubuntu DEV y reanudar la
validación real; no se conectó a PostgreSQL ni se cambiaron rutas de la aplicación.

Nuevo requisito registrado en SPEC-029 (Propuesta): formato de datos por país,
monedas GTQ/HNL/USD/NIO y filtros recordados por país. Se implementará dentro de
la etapa regional, primero datos y aislamiento API, luego carga y pantalla,
antes del piloto HN. No se cambió el archivo Excel ni el código al registrarlo.

Continuar desde el primer pendiente de `docs/MIGRATION_PLAN.md`. La etapa de
modularizacion TypeScript esta completada: persistencia, 19 scrapers GT,
utilidades HTTP, servicio de catalogo, cola y rutas estan separados. El siguiente
pendiente es validar la paridad de lecturas FastAPI con la base DEV real y probar
la carga desde el navegador en DEV. Los contratos de lectura y la exportación
CSV ya están implementados (SPEC-028; 28 pruebas Python y 67 Node). Ejecutar
npm test antes de Pytest: la prueba de CSV compara con el Node compilado.
Verificar paridad operativa antes de cambiar la API consumida por el frontend.
Node sigue atendiendo el catálogo. SPEC-003 registra el selector por país y la
URL estable del servidor; el acceso actual aún inicia localhost y requiere
adaptación posterior al modo remoto con una dirección verificada.

## Flujo local en Windows PowerShell

```powershell
cd "C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV"
node --version
corepack pnpm install --frozen-lockfile
pnpm test
pnpm run build
pnpm run catalog
```

Antes de confirmar cambios:

```powershell
cd "C:\Users\USER\source\repos\scraper 6"
git status
git diff --check
```

Agregar solamente los archivos informados por el task. No utilizar `git add .`.

```powershell
git add "WEBSCRAPER DEV/ruta/del/archivo"
git status
git commit -m "Descripcion concreta del cambio en DEV"
git push
```

## Actualizacion de Ubuntu DEV

```bash
cd "/home/administradorgt/WEBSCRAPING-FINAL"
git pull

cd "/home/administradorgt/WEBSCRAPING-FINAL/WEBSCRAPER DEV"
node --version
corepack pnpm install --frozen-lockfile
pnpm test
pnpm run build
pm2 restart webscraper-dev --update-env
pm2 logs webscraper-dev --lines 80
```

DEV utiliza el puerto 3030 y su propia configuracion `.env`.

## Promocion a PROD

Solo se realiza cuando el usuario lo solicita expresamente despues de validar DEV. Antes de copiar, identificar exactamente los archivos funcionales aprobados. Nunca copiar `.env`, datos locales, logs, `node_modules` ni archivos generados.

Despues de que el usuario suba los archivos aprobados a GitHub, actualizar Ubuntu PROD con:

```bash
cd "/home/administradorgt/WEBSCRAPING-FINAL"
git pull

cd "/home/administradorgt/WEBSCRAPING-FINAL/WEBSCRAPER PROD"
npm install
npm run build
pm2 restart webscraper-prod --update-env
pm2 logs webscraper-prod --lines 80
```

PROD utiliza el puerto 3031 y su propia configuracion `.env`.

## Reglas que no deben romperse

- La publicacion visual se protege por tienda durante tres horas.
- Una ejecucion con mayor cantidad puede publicarse antes de vencer la llave.
- El Run ID visual debe reflejar la ejecucion mas reciente de base de datos.
- Un fallo de una tienda no debe detener innecesariamente las demas.
- Las comparaciones regionales futuras deben hacerse dentro del mismo pais y moneda.
- Todo cambio se prueba primero en DEV.

## Texto para iniciar un nuevo chat

```text
Trabaja en C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV.
Lee AGENTS.md y todos los documentos de docs/ y specs/ antes de modificar codigo.
Continua desde el primer pendiente de docs/MIGRATION_PLAN.md. Conserva todas las specs,
incluso las completadas, y agrega o actualiza una spec por cada task. Trabaja solo en DEV;
no modifiques PROD, no copies .env y no ejecutes Git ni despliegues en Ubuntu. Dame esos
comandos separados para que yo los ejecute.
```
