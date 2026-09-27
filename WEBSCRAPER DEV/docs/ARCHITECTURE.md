# Arquitectura

SPEC-042/043: expansión complementaria ensayada en PostgreSQL webscraper_dev,
con backfill, idempotencia y rollback satisfactorios. Copia devuelta a 037;
no activa lectores regionales ni cambia arquitectura operativa original/PROD.
Evidencia: docs/SPEC-042-043_CIERRE_COPIA.md.

## Estado actual

```text
Navegador -> catalog-server.ts -> PostgreSQL
                         |
                         +-> proceso scrape-facenco-energy.ts -> sitios externos
```

`public/` contiene el frontend estatico. `catalog-server.ts` compone dependencias y arranca el proceso; las rutas, utilidades HTTP, servicio de consulta PostgreSQL y cola local viven bajo `src/server/`. Los extractores de las 19 tiendas GT viven bajo `src/scrapers/gt/`; `scrape-facenco-energy.ts` los coordina y conserva temporalmente filtros y generacion de archivos.

SPEC-067 fija pnpm `11.25.0` mediante el campo `packageManager` y
`pnpm-lock.yaml`. Las instalaciones DEV reproducibles usan
`corepack pnpm install --frozen-lockfile` en Windows y Ubuntu. Los scripts de
aplicación conservan sus nombres. SPEC-067 mantuvo PROD fuera de alcance;
SPEC-068 prepara su propia migración independiente.

SPEC-068 prepara esa transición de Guatemala PROD de manera independiente:
PROD mantiene su propio `package.json` y lockfile generado desde su resolución
anterior, actualiza sus instrucciones y lanzador local y requiere revisión del
usuario antes de publicar/reiniciar. No se traslada el lockfile de DEV ni se
modifica la configuración, los datos o PM2 del servidor durante la preparación.

## Estructura de transicion

```text
src/
  config/       catalogos de tiendas y reglas de calidad/reintento
  domain/       tipos y normalizacion compartida de productos
  persistence/  configuracion, tablas y escritura PostgreSQL
  scrapers/     tipos, registros por país (gt/, hn/, sv/, nc/) y motores compartidos
  server/       utilidades, servicios, cola y rutas del servidor en transicion
  specs/        pruebas ejecutables de comportamiento
  catalog-server.ts
  scrape-facenco-energy.ts
public/         frontend actual
docs/           vision, arquitectura y decisiones
```

Esta etapa conserva las rutas, comandos y puertos. Los archivos grandes se separaran de manera incremental despues de cubrir su comportamiento con pruebas.

Los contratos observables del servidor Node que deben protegerse durante la
migracion estan registrados en `docs/API_CONTRACTS.md`.

## Arquitectura objetivo

SPEC-034 amplía el destino: Nuxt en frontend/, FastAPI por capas, SQLAlchemy y
Alembic sobre PostgreSQL existente. Login obligatorio y países asignados por
administrador, autorizados en cada petición. Proxy HTTPS en Ubuntu y protección
de rutas heredadas antes de habilitar login. Integración operativa pendiente.

SPEC-044 incorpora `backend/catalog_api/access/`: política pura en `policy.py`
y adaptador de dependencias FastAPI en `dependencies.py`. Un proveedor futuro
leerá sesión, usuario, asignaciones y países vigentes por petición; no existe
proveedor real por defecto. Las dependencias niegan el acceso si falta. Se
prueban con rutas y datos en memoria y no se importan desde `main.py`.
No constituye login ni protege todavía las rutas heredadas. La selección de
país pertenece a la petición, no a un campo global mutable de la sesión.
Guía y frontera de integración: `docs/ACCESO_REGIONAL_DEV.md`.

SPEC-045 añade modelos preparados `catalogo.usuarios`, `usuario_paises` y
`sesiones_app`, repositorio Argon2id y router HTTPS con cookies de sesión/CSRF.
Se prueba en SQLite aislado y no se importa desde `main.py`. Las revisiones
043/044 y el bootstrap administrativo controlado están aplicados únicamente en
`webscraper_dev`; existe un administrador global sin asignaciones ni sesiones.
Antes de exponer login aún hacen falta montaje controlado, secreto HMAC,
HTTPS/orígenes del proxy, auditoría, lectores regionales y cierre de rutas
heredadas. Guía: `docs/AUTENTICACION_REGIONAL_DEV.md`.

SPEC-046 prepara un limitador de login con contadores HMAC por identidad y
dirección de conexión en una tabla compartida PostgreSQL; el diseño reserva
cada intento bajo bloqueo antes de Argon2. La revisión 044 está aplicada sólo
en la copia `webscraper_dev` y la concurrencia se validó allí con un probe
acotado. El router exige limitador; si falta o su storage falla, rechaza el
login. Usa sólo la IP del socket, no confía en `X-Forwarded-For`; la resolución
tras proxy y la limpieza periódica deben configurarse antes de exponerlo. Sin
montaje operativo.

SPEC-057 prepara `RegionalCatalogRepository`, que SELECTea publicaciones
asignadas por país/run/tienda sin sembrar snapshots. SPEC-058 define una fábrica
de la ruta country-scoped, y SPEC-059 inyecta un `AuthRepository` y una sesión
request-scoped a partir de una `sessionmaker` explícita. Ninguno de estos módulos
se importa desde `main.py`; no crean engines ni cargan `.env`. La app actual
sigue con su catálogo Node/GT y el login regional no está operativo.

SPEC-060 valida en SQLite temporal la composición del repositorio de auth,
autorización por país, sesión revocable y lector regional: GT asignado y activo
lee su publicación; NC deshabilitado y una sesión revocada son rechazados.
Sigue siendo una prueba aislada y no habilita rutas ni conexiones operativas.

SPEC-061 documenta las compuertas pendientes para integrar la base DEV original.
Los runners de escritura actuales aceptan sólo `webscraper_dev`/`webscraper_user`;
no se deben relajar sin una SPEC y aprobación nuevas. La proyección 042 tampoco
se sincroniza todavía con publicaciones posteriores, así que el lector no es un
catálogo vigente hasta resolver esa frescura.

SPEC-062 define el contrato de frescura: clasificar los nuevos productos en la
misma transacción Node y mover la publicación regional sólo cuando avance el
snapshot legacy por la regla de tres horas/mayor conteo. Todavía no se implementa:
la clave global `store_key`, el ledger/verificador incremental y las filas
FACENCO requieren decisiones; el clasificador TS/Python requiere integración y
prueba PostgreSQL scratch.

Revisión de SPEC-062 (2026-09-26): los registros actuales tienen nombres con
sufijo de país en la mayoría de tiendas, pero GT conserva claves genéricas como
`FACENCO` y `Beds & Dreams`; como `source_site` normalizado es la clave global
del snapshot legacy, la escritura regional deberá rechazar cualquier clave que
colisione entre países. No renombrar claves automáticamente. El verificador 043
recalcula una fotografía completa inicial, por lo que la futura revisión debe
preservar sus hashes y verificar las transacciones posteriores desde un ledger
append-only por run/publicación. No hay dual-write aún.

FACENCO Excel es complemento de lectura fuera de PostgreSQL: agrega o actualiza
filas durante la consulta, no tiene run propio y la carga reemplaza el archivo
completo con respaldo. Para lector regional se filtra explícitamente por país y
moneda y se conserva como origen separado, sin inventar IDs ni fechas de scrape.
Falta definir el tratamiento de `fecha_vigencia` ausente o vencida; hasta entonces
el Excel no sustituye publicaciones ni snapshots regionales persistidos.
La fusión local Node ahora prioriza país+código y mantiene el fallback por nombre
únicamente para GT legacy; no expone un lector regional ni activa escrituras.
Las comparaciones de precios Node/Python usan país, moneda y nombre normalizado,
para impedir que la referencia FACENCO de una jurisdicción se aplique a otra.

SPEC-065 registra La Curacao, Walmart y Diunsa como candidatas inactivas HN; y
La Curacao, Siman y Walmart como candidatas inactivas SV. Cada país tiene un
registro aislado con extractores inyectados y filtros independientes por país y
tienda. Las páginas oficiales están documentadas en la spec; los extractores y
la paginación de las demás tiendas siguen pendientes. Ambos países siguen no
operativos y los registros no se importan desde el ejecutor principal.

Primer extractor de la lista: `src/scrapers/hn/walmart.ts` implementa consulta
VTEX paginada, precio HNL y normalización/deduplicación por URL. Sus pruebas usan
fixtures offline. El usuario confirmó que el API responde en vivo. La primera
consulta por texto mezcló categorías: 21 aceptados frente a 19 anunciados, con
productos de mascotas y protectores. El extractor ahora consulta la ruta VTEX
de categoría exacta y requiere esa categoría en cada ficha. El segundo piloto
devolvió 19/19 productos únicos, 16 con precio y 3 sin precio. Se validó la
cobertura de la categoría; falta caracterizar las tres ofertas sin precio. El
módulo permanece fuera del ejecutor global y Walmart HN deshabilitado.

`npm run pilot:walmart-hn` ejecuta ese extractor de forma manual, headless y
acotada (20 por página; hasta 40 por término por defecto, máximo configurable
200). Informa respuestas HTTP y cobertura de precios en JSON de consola; no
escribe archivos ni base de datos y no forma parte de las pruebas ni del
ejecutor normal.

La Curacao Honduras tiene un contrato aislado en `src/scrapers/hn/la-curacao.ts`
para URLs `/honduras/`, moneda HNL y precios opcionales. No reutiliza el motor
visual de GT, que filtra por quetzales. El sitio devolvió 403 al inspeccionarlo
desde este entorno; no se han definido lector DOM ni paginación y el módulo no
está conectado al registro operativo.

Diunsa HN tiene un contrato de procedencia en `src/scrapers/hn/diunsa.ts` para
el dominio oficial, la categoría `/camas` y HNL. La página expone rango de
precios en lempiras, pero la vista disponible no muestra fichas ni paginación;
por eso no hay lector implementado y el contrato tampoco se importa en el
registro HN.

SPEC-063/064 agregaron un clasificador TypeScript puro con el mismo corpus JSON
que Python y reglas 038-origin-v3. Corrigen la prioridad `C$` (NIO) antes de `$`
(USD). El módulo sigue aislado del scraper; cualquier plan nuevo debe usar v3.
Validación local: 156 Node y 293 Python aprobadas; no se conectó PostgreSQL.

```text
Frontend -> FastAPI -> PostgreSQL
               |
               +-> cola -> workers TypeScript/Playwright -> sitios externos
```

Responsabilidades previstas:

- Frontend: presentacion, filtros y seguimiento de trabajos.
- FastAPI: contratos, autenticacion, paises, tiendas, catalogo y trabajos.
- Workers: navegacion y extraccion especifica por tienda.
- PostgreSQL: configuracion, ejecuciones, productos y snapshots publicados.
- Cola: concurrencia, reintentos y aislamiento de tareas largas.

## Compatibilidad durante la migracion

SPEC-027 define modelos de respuesta en backend/catalog_api/models.py para las
lecturas FastAPI. Las rutas validan la salida y documentan errores en OpenAPI;
el frontend continúa consumiendo Node hasta verificar paridad en DEV.

SPEC-028 incorpora GET /api/export.csv mediante backend/catalog_api/export.py,
reutilizando las lecturas y filtros del repositorio. Se genera en memoria y no
crea archivos de exportacion en el servidor. Node conserva su descarga actual.

- `npm run build`, `npm start` y `npm run catalog` continuan disponibles.
- DEV sigue usando el puerto 3030 y su base independiente.
- PROD no se modifica hasta aprobar expresamente la promocion.
- `.env` nunca se copia entre ambientes.

## Regionalizacion propuesta

SPEC-042/043 prepara una fase de ampliación compatible: productos_paises se
relaciona 1:1 por ID con productos_catalogo; scraping_run_paises y tiendas_paises
definen asociaciones; publicaciones_paises conserva el payload original y una
evaluación nullable por país. regional_lotes registra huellas. Los cinco modelos
ORM están en db/regional_models.py. No reemplazan los lectores actuales.
La expansión y el backfill se confirman atómicamente y preservan las cuatro
tablas históricas sin ALTER. Revisión 042 y backfill se aplicaron y revirtieron
en ensayo PostgreSQL sobre la copia restaurada; el destino regresó a 037.
Activar escritura/lectura regional y convertir las publicaciones a operación
por país sigue requiriendo una etapa coordinada posterior.

Actualización SPEC-038: se comprobaron ejecuciones históricas mixtas GT/SV.
El modelo candidato usa scraping_run_paises(run_id,pais_codigo), conservando
ID/UUID de ejecución; productos y publicaciones referencian ese par. Nuevos
workers recibirán un país explícito. Los registros de origen pendiente se
conservan sin país ficticio ni asignación global GT. Este contrato está probado
en la copia PostgreSQL mediante SPEC-042/043. Los lectores/escritores regionales
y su sincronización siguen pendientes de una etapa posterior.

SPEC-029 amplía el diseño con GT/GTQ, HN/HNL, SV/USD y NC/NIO en el formato
de datos y filtros. El aislamiento y validación de país/moneda en el servidor
precederán a la memoria de selecciones por país en el navegador. No se convierte
moneda al filtrar. La estructura de archivos de entrada sigue por definir.

SPEC-025 incorpora lecturas PostgreSQL y Excel desde backend/catalog_api/catalog.py, con filtros ligados y cierre de conexiones. SPEC-026 añade carga XLSX en el catálogo Node: vista previa, validación de plantilla y guardado atómico con respaldo en data/backups. Ambas implementaciones siguen limitadas a Guatemala en DEV.

FastAPI inicia en paralelo desde backend/catalog_api en 127.0.0.1:8000. La guía docs/FASTAPI_DEV.md describe configuración y pruebas. La futura entrada pública conservará su URL mediante enrutamiento en el servidor; los accesos de usuario no deben apuntar al puerto interno. El selector de país y esa integración siguen pendientes.

La plataforma se organizara para Guatemala (`GT`), Honduras (`HN`), El Salvador
(`SV`) y Nicaragua (`NC`). SPEC-034 admite incorporar Costa Rica en el futuro.

- Se mantendra una sola aplicacion y, de preferencia, una sola base de datos.
- Paises y tiendas se definiran en catalogos centrales.
- Los extractores se agruparan por pais y luego por tienda o familia tecnica.
- Tiendas, ejecuciones, productos y publicaciones quedaran asociados a un pais.
- Toda consulta y comparacion exigira el pais y respetara su moneda.
- Indices y restricciones compuestos por pais evitaran cruces accidentales.

La separacion en cuatro bases fisicas se reserva para un requisito posterior de
aislamiento legal, infraestructura independiente o escalamiento comprobado.
