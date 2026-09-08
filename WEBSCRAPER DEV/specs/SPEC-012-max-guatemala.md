# SPEC-012: Extractor especializado de MAX Guatemala

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Mover el extractor especializado de MAX Guatemala a un modulo GT independiente.

## Comportamiento esperado

- Busquedas, preparacion regional, cookies, scroll y lectura de tarjetas viven
  bajo `src/scrapers/gt/`.
- Se conservan las cinco busquedas actuales y una pagina por busqueda.
- Se conservan moneda `GTQ`, deduplicacion y filtro final de Guatemala.
- MAX permanece dentro del registro de 19 tiendas.

## Fuera de alcance

- Cambiar busquedas, marcas, precios o limites de MAX.
- Mover Walmart, Siman u otros extractores.
- Habilitar Honduras, modificar base, frontend o PROD.

## Criterios de aceptacion

- Existe un modulo independiente para MAX.
- El ejecutor deja de contener su implementacion especializada.
- Hay pruebas de busquedas, paginacion y configuracion regional.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `src/scrapers/gt/max.ts`
- Integracion mediante `createMaxGuatemalaScraper`.
- `src/specs/max-gt.test.ts`

## Pruebas

- Cinco busquedas actuales de MAX.
- Una pagina por busqueda para scroll infinito.
- Contexto de pais `GT` y moneda `GTQ` en almacenamiento y cookies.
- Ausencia del extractor especializado en el ejecutor principal.
- Registro completo de 19 tiendas.
