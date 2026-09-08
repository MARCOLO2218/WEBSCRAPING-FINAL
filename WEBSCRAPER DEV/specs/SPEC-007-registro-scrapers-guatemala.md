# SPEC-007: Registro de scrapers de Guatemala

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Iniciar la separacion gradual de scrapers creando una estructura propia para
Guatemala y extrayendo del ejecutor principal el registro de sus 19 tiendas.

## Comportamiento esperado

- El registro de Guatemala vive bajo `src/scrapers/gt/`.
- Conserva exactamente las 19 tiendas, nombres y orden actuales.
- Cada registro sigue ejecutando la misma funcion extractora.
- El catalogo central detecta tiendas faltantes o desconocidas.
- La ejecucion completa y seleccionada conserva su comportamiento.

## Fuera de alcance

- Mover en un solo cambio todas las funciones extractoras.
- Agregar Tiendas Relax o habilitar Honduras.
- Cambiar filtros, limites, base de datos, frontend o PROD.

## Criterios de aceptacion

- Existen tipos comunes y un registro bajo `src/scrapers/gt/`.
- El ejecutor consume el registro extraido.
- Una prueba comprueba cantidad, nombres, orden y vinculacion de funciones.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `src/scrapers/types.ts`
- `src/scrapers/gt/registry.ts`
- Integracion en `src/scrape-facenco-energy.ts`
- `src/specs/guatemala-scraper-registry.test.ts`

## Pruebas

- Correspondencia exacta con las 19 tiendas habilitadas.
- Conservacion del orden del catalogo.
- Ausencia de tiendas faltantes o desconocidas.
- Vinculacion de la funcion extractora y la fecha de ejecucion.
