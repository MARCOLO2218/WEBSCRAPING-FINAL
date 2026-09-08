# SPEC-010: Tiendas visuales paginadas de Guatemala

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Mover Dormisuenos y Bodegangas a un modulo GT independiente que reutilice el
motor visual y conserve su navegacion paginada.

## Comportamiento esperado

- URLs y funciones de ambas tiendas viven bajo `src/scrapers/gt/`.
- Dormisuenos conserva cuatro paginas visuales y su fallback WooCommerce.
- Bodegangas conserva sus tres URLs candidatas y limite de cinco paginas.
- El registro general mantiene exactamente las 19 tiendas.

## Fuera de alcance

- Cambiar productos, filtros, precios o reglas de calidad.
- Mover MAX, Walmart, Siman u otros extractores.
- Habilitar Honduras, frontend, base regional o PROD.

## Criterios de aceptacion

- Existe un modulo GT para las dos tiendas paginadas.
- El ejecutor principal deja de declarar sus funciones.
- Hay pruebas de URLs, paginacion y conexion con el motor.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `src/scrapers/gt/paged-visual-stores.ts`
- Integracion en `src/scrape-facenco-energy.ts`
- `src/specs/gt-paged-visual-stores.test.ts`
- Ampliacion de `src/specs/visual-engine-boundary.test.ts`

## Pruebas

- Cuatro paginas visuales de Dormisuenos.
- Conservacion del fallback WooCommerce.
- Tres URLs candidatas y limite de cinco paginas para Bodegangas.
- Ausencia de ambas funciones en el ejecutor principal.
- Registro completo de 19 tiendas.
