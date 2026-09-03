# SPEC-001: Base de arquitectura y especificaciones

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Crear la base para ordenar el proyecto gradualmente, proteger el comportamiento actual y preparar la futura migracion de la API a FastAPI.

## Comportamiento esperado

- Existe una fuente central y tipada para las tiendas habilitadas.
- La API valida selecciones usando esa fuente.
- El ejecutor comprueba que sus scrapers coinciden con las tiendas configuradas.
- Existen pruebas automatizadas para cantidad, identificadores, seleccion y desalineacion.
- La vision, arquitectura, decisiones y plan quedan documentados.
- Los comandos actuales siguen funcionando.

## Fuera de alcance

- Migrar endpoints a FastAPI.
- Separar fisicamente todos los extractores.
- Cambiar base de datos, puertos o comportamiento de publicacion.
- Modificar PROD.

## Criterios de aceptacion

- `npm test` compila el proyecto y aprueba todas las pruebas.
- Permanecen las 19 tiendas de Guatemala.
- Americana 2000 aparece en el catalogo central.
- Ninguna modificacion de este task se realiza en `WEBSCRAPER PROD`.

## Implementacion

- `src/config/store-catalog.ts`
- `src/specs/store-catalog.test.ts`
- Integracion en `src/catalog-server.ts`
- Validacion del registro en `src/scrape-facenco-energy.ts`
- Documentos de `docs/`

## Pruebas

- Cantidad e identificadores unicos de tiendas.
- Presencia de Americana 2000.
- Seleccion insensible a mayusculas y sin duplicados.
- Rechazo de entradas desconocidas.
- Deteccion de scrapers faltantes o no configurados.
