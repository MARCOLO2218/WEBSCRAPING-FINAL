# SPEC-005: Configuracion y calidad por tienda

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Separar del ejecutor principal los minimos de calidad y las reglas de reintento
por tienda, manteniendo sus valores y mensajes actuales.

## Comportamiento esperado

- Las reglas viven en un modulo de configuracion independiente.
- Una tienda sin regla de reintento conserva el minimo predeterminado de uno.
- Las advertencias de calidad conservan el texto y las condiciones actuales.
- Ninguna regla puede referirse a una tienda inexistente en el catalogo central.
- Los scrapers y sus resultados no cambian.

## Fuera de alcance

- Modificar los minimos actuales.
- Separar cada scraper en archivos individuales.
- Agregar paises o tiendas.
- Cambiar base de datos, frontend o PROD.

## Criterios de aceptacion

- Existe un modulo central de reglas por tienda.
- El ejecutor importa las funciones del modulo nuevo.
- Hay pruebas para minimos, advertencias y correspondencia con el catalogo.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `src/config/store-rules.ts`
- Integracion en `src/scrape-facenco-energy.ts`
- `src/specs/store-rules.test.ts`

## Pruebas

- Minimos de reintento de La Curacao y Walmart.
- Minimo predeterminado para tiendas sin regla de reintento.
- Advertencias por cantidades inferiores al minimo de calidad.
- Correspondencia de todas las reglas con el catalogo central de tiendas.
