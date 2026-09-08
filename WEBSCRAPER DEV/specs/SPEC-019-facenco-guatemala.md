# SPEC-019: Extractor de FACENCO Guatemala

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Mover el extractor especializado de FACENCO a un módulo GT independiente.

## Comportamiento esperado

- Se conserva el descubrimiento de líneas, catálogos y productos de FACENCO.
- Se mantienen la deduplicación, inferencia de línea y lectura de detalles, garantía y beneficios.
- Los productos conservan sus campos actuales y la fecha de scraping recibida.
- FACENCO permanece dentro del registro de 19 tiendas de Guatemala.

## Fuera de alcance

- Cambiar el complemento de precios desde Excel o los filtros comerciales posteriores.
- Cambiar URLs, selectores o reglas de extracción.
- Mover rutas del servidor, habilitar Honduras o modificar PROD.

## Criterios de aceptación

- El extractor completo vive bajo `src/scrapers/gt/`.
- El ejecutor principal deja de contener la URL y funciones especializadas de FACENCO.
- Existen pruebas para descubrimiento, navegación, metadatos y frontera del módulo.
- `npm test` y `npm run build` terminan correctamente.

## Implementación

- `src/scrapers/gt/facenco.ts`
- Integración mediante `createFacencoGuatemalaScraper`.
- `src/specs/facenco-gt.test.ts`

## Pruebas

- Descubrimiento y navegación de catálogo y producto.
- Inferencia de línea y conservación de metadatos.
- Selectores, detalles, garantía y beneficios.
- Ausencia de la URL y funciones FACENCO en el ejecutor principal.
- Registro completo de 19 tiendas.
