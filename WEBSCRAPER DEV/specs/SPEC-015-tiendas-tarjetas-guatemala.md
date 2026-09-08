# SPEC-015: Tiendas de Guatemala basadas en tarjetas

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Mover Sleep Gallery, Serta y Mattress a un modulo GT que reutilice el extractor
compartido de tarjetas.

## Comportamiento esperado

- URLs, selectores y funciones viven bajo `src/scrapers/gt/`.
- Sleep Gallery conserva sus tarjetas y precios propios.
- Serta conserva siete secciones, deduplicacion y filtro GTQ.
- Mattress conserva selectores WooCommerce y fecha de scraping.
- Las tres tiendas permanecen en el registro de 19 tiendas.

## Fuera de alcance

- Cambiar selectores, categorias, URLs o filtros.
- Mover otros extractores.
- Habilitar Honduras, modificar base, frontend o PROD.

## Criterios de aceptacion

- Existe un modulo independiente para las tres tiendas.
- El ejecutor deja de contener sus implementaciones y constantes.
- Hay pruebas de URLs, secciones, selectores y frontera del modulo.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `src/scrapers/gt/card-stores.ts`
- Integracion mediante `createGuatemalaCardStores`.
- `src/specs/gt-card-stores.test.ts`

## Pruebas

- URLs y selectores principales de Sleep Gallery y Mattress.
- Siete secciones de Serta y aplicacion del filtro GTQ.
- Ausencia de las tres implementaciones en el ejecutor principal.
- Registro completo de 19 tiendas.
