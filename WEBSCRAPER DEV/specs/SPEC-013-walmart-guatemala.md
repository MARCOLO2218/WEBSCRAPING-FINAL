# SPEC-013: Extractor especializado de Walmart Guatemala

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Mover el extractor de Walmart Guatemala a un modulo GT independiente.

## Comportamiento esperado

- La URL, busquedas, paginacion API y transformacion viven bajo `src/scrapers/gt/`.
- Se conservan cinco terminos, bloques de 50 y maximo de 300 productos por busqueda.
- Se conservan clasificacion, disponibilidad, precios y filtro final GTQ.
- Walmart permanece dentro del registro de 19 tiendas.

## Fuera de alcance

- Cambiar terminos, limites, categorias o filtros.
- Mover Siman u otros extractores.
- Habilitar Honduras, modificar base, frontend o PROD.

## Criterios de aceptacion

- Existe un modulo independiente para Walmart.
- El ejecutor deja de contener su implementacion y URL.
- Hay pruebas para terminos, paginacion, endpoint y frontera del modulo.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `src/scrapers/gt/walmart.ts`
- Integracion mediante `createWalmartGuatemalaScraper`.
- `src/specs/walmart-gt.test.ts`

## Pruebas

- Cinco terminos actuales de busqueda.
- Bloques de 50 y maximo de 300 productos por termino.
- Endpoint VTEX, URL de origen y filtro GTQ.
- Ausencia del extractor en el ejecutor principal.
- Registro completo de 19 tiendas.
