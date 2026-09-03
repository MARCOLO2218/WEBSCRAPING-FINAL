# Arquitectura

## Estado actual

```text
Navegador -> catalog-server.ts -> PostgreSQL
                         |
                         +-> proceso scrape-facenco-energy.ts -> sitios externos
```

`public/` contiene el frontend estatico. `catalog-server.ts` sirve archivos y API, administra la cola local y consulta PostgreSQL. `scrape-facenco-energy.ts` contiene los extractores, filtros, archivos de salida y persistencia.

## Estructura de transicion

```text
src/
  config/       catalogos de paises y tiendas
  specs/        pruebas ejecutables de comportamiento
  catalog-server.ts
  scrape-facenco-energy.ts
public/         frontend actual
docs/           vision, arquitectura y decisiones
```

Esta etapa conserva las rutas, comandos y puertos. Los archivos grandes se separaran de manera incremental despues de cubrir su comportamiento con pruebas.

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

- `npm run build`, `npm start` y `npm run catalog` continuan disponibles.
- DEV sigue usando el puerto 3030 y su base independiente.
- PROD no se modifica hasta aprobar expresamente la promocion.
- `.env` nunca se copia entre ambientes.
