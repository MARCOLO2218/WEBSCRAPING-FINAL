# SPEC-016: Extractor Shopify de Beds & Dreams

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Mover el extractor de Beds & Dreams a un modulo GT independiente para tiendas
basadas en colecciones JSON de Shopify.

## Comportamiento esperado

- URL, colecciones, confort y transformacion viven bajo `src/scrapers/gt/`.
- Se conservan tres colecciones comerciales y nueve colecciones de confort.
- Cada consulta conserva el limite de 250 productos.
- Se conservan variantes, precios, marcas, imagenes y deduplicacion.

## Fuera de alcance

- Agrupar Furniture City, que utiliza una tecnica distinta.
- Cambiar colecciones, precios, clasificacion o filtros.
- Habilitar Honduras, modificar base, frontend o PROD.

## Criterios de aceptacion

- Existe un modulo independiente para Beds & Dreams.
- El ejecutor deja de contener su implementacion y URL.
- Hay pruebas para colecciones, limite Shopify y frontera del modulo.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `src/scrapers/gt/beds-dreams.ts`
- Integracion directa en el registro GT.
- `src/specs/beds-dreams-gt.test.ts`

## Pruebas

- Tres colecciones comerciales.
- Nueve colecciones de confort.
- Endpoint JSON y limite de 250 productos por coleccion.
- Ausencia del extractor en el ejecutor principal.
- Registro completo de 19 tiendas.
