# SPEC-014: Extractor especializado de Siman Guatemala

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Mover el extractor paginado de Siman Guatemala a un modulo GT independiente.

## Comportamiento esperado

- URL, paginacion, timeout por pagina y deduplicacion viven bajo `src/scrapers/gt/`.
- Se conservan ocho paginas, 90 segundos por pagina y resultados parciales.
- Siman sigue reutilizando el extractor generico visual.
- El limite especial de diez minutos por intento permanece en el ejecutor.

## Fuera de alcance

- Cambiar URL, paginas, tiempos, filtros o resultados.
- Mover otros extractores.
- Habilitar Honduras, modificar base, frontend o PROD.

## Criterios de aceptacion

- Existe un modulo independiente para Siman.
- El ejecutor deja de contener su implementacion y URL.
- Hay pruebas de paginacion, tiempos y frontera del modulo.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `src/scrapers/gt/siman.ts`
- Integracion mediante `createSimanGuatemalaScraper`.
- `src/specs/siman-gt.test.ts`

## Pruebas

- Ocho paginas y timeout de 90 segundos por pagina.
- Limite especial de diez minutos por intento.
- Detencion despues de una pagina posterior vacia.
- URL paginada con parametro `page`.
- Ausencia del extractor en el ejecutor principal.
