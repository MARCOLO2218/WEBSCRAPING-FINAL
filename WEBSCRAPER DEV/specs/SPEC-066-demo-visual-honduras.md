# SPEC-066 — Vista visual de Honduras en demo regional

Estado: Implementación local.

## Objetivo

Extender la demo estática de acceso por país para presentar Honduras y el estado
real de preparación de sus tiendas, sin insinuar que el catálogo consulta datos
en vivo ni que Honduras ya es operativo.

## Criterios

- Honduras aparece en el selector como inactiva para ejecución normal.
- Se puede abrir una vista ilustrativa con la evidencia confirmada del piloto
  Walmart HN: 19 productos únicos, 16 con precio y 3 sin precio.
- La Curacao HN y Diunsa HN se presentan como módulos en preparación, con
  lectores/paginación pendientes.
- La vista identifica los conteos como evidencia de piloto y no como catálogo
  conectado; botones no llaman API, scraper ni base de datos.
- La vista enlaza a las categorías oficiales de Walmart HN, La Curacao HN y
  Diunsa HN para que la evidencia de catálogo se pueda contrastar al presentar.
- Mantener la paleta WMS y el flujo actual de Guatemala/Nicaragua.

## Fuera de alcance

Autenticación, conexión al scraper o PostgreSQL, activación de tiendas, cobertura
completa de Honduras y cambios a la interfaz operativa.

## Archivos y validación

- `public/demo-acceso-pais.html`
- `src/specs/demo-acceso-pais.test.ts`
- `specs/README.md`

Validar con `npm test` y revisar la página estática en navegador.
