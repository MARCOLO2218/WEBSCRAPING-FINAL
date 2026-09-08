# SPEC-009: Primeras tiendas visuales de Guatemala

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Mover La Curacao, Elektra, Cemaco y Dormilandia a un modulo de tiendas GT que
consuma el motor visual compartido extraido en la spec anterior.

## Comportamiento esperado

- Las URLs y funciones de las cuatro tiendas viven bajo `src/scrapers/gt/`.
- Cada tienda conserva nombre, marca, URL y fecha de scraping actuales.
- El registro general mantiene exactamente las 19 tiendas.
- El archivo principal deja de declarar las cuatro funciones.

## Fuera de alcance

- Mover MAX, Walmart, Siman, Dormisuenos o Bodegangas.
- Cambiar selectores, filtros, reintentos o minimos de calidad.
- Habilitar Honduras, base regional, frontend o PROD.

## Criterios de aceptacion

- Existe un modulo GT para las cuatro tiendas visuales.
- Hay pruebas de los parametros enviados al motor.
- Las cuatro funciones ya no se declaran en el ejecutor principal.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `src/scrapers/gt/visual-stores.ts`
- Integracion en `src/scrape-facenco-energy.ts`
- Tipo publico del motor en `src/scrapers/shared/visual-engine.ts`
- `src/specs/gt-visual-stores.test.ts`
- Ampliacion de `src/specs/visual-engine-boundary.test.ts`

## Pruebas

- URL, nombre y marca exactos de las cuatro tiendas.
- Fecha de scraping transmitida sin modificaciones.
- Ausencia de las cuatro declaraciones en el ejecutor principal.
- Presencia de las tiendas en el modulo GT.
- Registro completo de 19 tiendas.
