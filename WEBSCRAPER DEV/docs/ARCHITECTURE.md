# Arquitectura

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

SPEC-029 amplía el diseño con GT/GTQ, HN/HNL, SV/USD y NC/NIO en el formato
de datos y filtros. El aislamiento y validación de país/moneda en el servidor
precederán a la memoria de selecciones por país en el navegador. No se convierte
moneda al filtrar. La estructura de archivos de entrada sigue por definir.

SPEC-025 incorpora lecturas PostgreSQL y Excel desde backend/catalog_api/catalog.py, con filtros ligados y cierre de conexiones. SPEC-026 añade carga XLSX en el catálogo Node: vista previa, validación de plantilla y guardado atómico con respaldo en data/backups. Ambas implementaciones siguen limitadas a Guatemala en DEV.

FastAPI inicia en paralelo desde backend/catalog_api en 127.0.0.1:8000. La guía docs/FASTAPI_DEV.md describe configuración y pruebas. La futura entrada pública conservará su URL mediante enrutamiento en el servidor; los accesos de usuario no deben apuntar al puerto interno. El selector de país y esa integración siguen pendientes.

La plataforma se organizara para Guatemala (`GT`), Honduras (`HN`), El Salvador
(`SV`) y Nicaragua (`NC`). Costa Rica no forma parte del alcance.

- Se mantendra una sola aplicacion y, de preferencia, una sola base de datos.
- Paises y tiendas se definiran en catalogos centrales.
- Los extractores se agruparan por pais y luego por tienda o familia tecnica.
- Tiendas, ejecuciones, productos y publicaciones quedaran asociados a un pais.
- Toda consulta y comparacion exigira el pais y respetara su moneda.
- Indices y restricciones compuestos por pais evitaran cruces accidentales.

La separacion en cuatro bases fisicas se reserva para un requisito posterior de
aislamiento legal, infraestructura independiente o escalamiento comprobado.
