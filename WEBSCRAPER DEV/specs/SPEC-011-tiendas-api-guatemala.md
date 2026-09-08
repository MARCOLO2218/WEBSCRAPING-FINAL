# SPEC-011: Tiendas de Guatemala basadas en API

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Mover Americana 2000 y Suena Center a un modulo GT independiente para
extractores basados en API.

## Comportamiento esperado

- URLs, configuracion y funciones de ambas tiendas viven en `src/scrapers/gt/`.
- Suena Center conserva consulta Algolia, marcas, confort, variantes y precios.
- Americana 2000 conserva consulta WooCommerce, marcas permitidas y validacion GTQ.
- El registro general conserva exactamente las 19 tiendas.

## Fuera de alcance

- Cambiar credenciales publicas de consulta, endpoints o filtros.
- Mover tiendas visuales o extractores especializados restantes.
- Habilitar Honduras, modificar base, frontend o PROD.

## Criterios de aceptacion

- Existe un modulo GT para ambas tiendas API.
- El ejecutor deja de contener sus implementaciones y constantes.
- Las pruebas protegen configuracion, moneda y limites de consulta.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `src/scrapers/gt/api-stores.ts`
- Integracion en `src/scrape-facenco-energy.ts`
- `src/specs/gt-api-stores.test.ts`

## Pruebas

- Endpoint, indice y limite Algolia de Suena Center.
- Categoria, limite y filtro monetario GTQ de Americana 2000.
- Ausencia de ambas implementaciones en el ejecutor principal.
- Registro completo de 19 tiendas.
