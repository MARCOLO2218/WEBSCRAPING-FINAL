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

## Estructura de transicion

```text
src/
  config/       catalogos de tiendas y reglas de calidad/reintento
  domain/       tipos y normalizacion compartida de productos
  persistence/  configuracion, tablas y escritura PostgreSQL
  scrapers/     tipos, registros por pais y motores compartidos
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
Se prueba en SQLite aislado y no se importa desde `main.py`. La revisión 043
depende de 042, tiene guardas explícitas y no se ha ejecutado. No hay alta web
ni bootstrap administrativo. Antes de exponer login hacen falta rate-limit
compartido, HTTPS/orígenes del proxy, auditoría, lectores regionales y cierre de
rutas heredadas. Guía: `docs/AUTENTICACION_REGIONAL_DEV.md`.

SPEC-046 prepara un limitador de login con contadores HMAC por identidad y
dirección de conexión en una tabla compartida PostgreSQL; el diseño reserva
cada intento bajo bloqueo antes de Argon2. La revisión aditiva 044 depende de
043 y no se ha ejecutado. SQLite aislado no valida el bloqueo concurrente real.
El router exige limitador; si falta o su storage falla, rechaza el login. Usa sólo la IP
del socket, no confía en `X-Forwarded-For`; la resolución tras proxy y la limpieza
periódica deben configurarse antes de exponerlo. Sin montaje operativo.

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
