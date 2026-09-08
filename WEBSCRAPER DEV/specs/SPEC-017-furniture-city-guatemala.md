# SPEC-017: Extractor de Furniture City Guatemala

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Mover el extractor de Furniture City Guatemala a un modulo GT independiente.

## Comportamiento esperado

- URL, descubrimiento de catalogos y lectura de tarjetas viven bajo `src/scrapers/gt/`.
- Se conservan enlaces de categorias de colchones y productos individuales.
- Se conservan selectores WooCommerce, deduplicacion y fecha de scraping.
- Furniture City permanece dentro del registro de 19 tiendas.

## Fuera de alcance

- Cambiar rutas, selectores, precios o categorias.
- Mover otros extractores.
- Habilitar Honduras, modificar base, frontend o PROD.

## Criterios de aceptacion

- Existe un modulo independiente para Furniture City.
- El ejecutor deja de contener su implementacion y URL.
- Hay pruebas para descubrimiento, selectores y frontera del modulo.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `src/scrapers/gt/furniture-city.ts`
- Integracion mediante `createFurnitureCityGuatemalaScraper`.
- `src/specs/furniture-city-gt.test.ts`

## Pruebas

- Descubrimiento de categorias y enlaces de producto.
- Navegacion por URL inicial y categorias.
- Selectores WooCommerce y creacion de registros directos.
- Ausencia del extractor en el ejecutor principal.
- Registro completo de 19 tiendas.
