# SPEC-018: Olympia y La Colchonería Guatemala

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Mover los extractores de Camas Olympia Online GT y La Colchonería Guatemala a un módulo GT independiente.

## Comportamiento esperado

- Se conservan las URLs, selectores, nombres de tienda, categorías y precios actuales.
- Cada scraper navega una vez a su página de origen y asigna la fecha recibida a sus productos.
- Ambos scrapers permanecen registrados dentro de las 19 tiendas de Guatemala.

## Fuera de alcance

- Cambiar la lógica de extracción o los filtros finales.
- Mover FACENCO u otros extractores.
- Habilitar Honduras, cambiar la base de datos, el frontend o PROD.

## Criterios de aceptación

- Olympia y La Colchonería viven bajo `src/scrapers/gt/`.
- El ejecutor principal ya no contiene sus URLs ni funciones de extracción.
- Existen pruebas de navegación, fecha, selectores y frontera del módulo.
- `npm test` y `npm run build` terminan correctamente.

## Implementación

- `src/scrapers/gt/olympia-la-colchoneria.ts`
- Integración mediante `createOlympiaLaColchoneriaGuatemalaScrapers`.
- `src/specs/olympia-la-colchoneria-gt.test.ts`

## Pruebas

- Navegación a las dos URLs originales.
- Asignación de la fecha de scraping.
- Conservación de selectores específicos de ambas tiendas.
- Ausencia de las funciones y constantes en el ejecutor principal.
- Registro completo de 19 tiendas.
