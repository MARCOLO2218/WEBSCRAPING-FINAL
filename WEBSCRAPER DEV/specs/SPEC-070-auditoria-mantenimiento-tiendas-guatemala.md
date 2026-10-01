# SPEC-070 — Auditoría de mantenimiento para tiendas de Guatemala

## Estado

En progreso.

## Objetivo

Permitir ejecutar los 19 extractores activos de Guatemala en modo de auditoría
sin producir CSV/Excel de catálogo ni guardar productos o ejecuciones en
PostgreSQL. El informe por tienda debe ayudar a detectar fallos de acceso,
cambios estructurales, ausencia de productos y pérdida de campos relevantes.

## Comportamiento esperado

- `pnpm audit:gt` compone el registro oficial de las 19 tiendas GT.
- Ejecuta cada extractor de forma serial con Playwright y continúa aunque una
  tienda falle.
- Imprime una línea JSON por tienda con estado, candidatos, nombres, precios,
  enlaces, duración y detalle de error.
- Cierra navegador y página incluso si hay errores.
- No crea exportaciones ni conecta con PostgreSQL.
- La categoría oficial anidada de camas de Bodegangas se usa como fuente, las
  tarjetas WooCommerce/WoodMart actuales y eTheme anterior se reconocen, y la
  paginación sigue activa. Un resultado bajo 20 provoca reintento y advertencia
  de calidad en el scraper normal.
- Furniture City consulta sólo la categoría oficial vigente de Descanso; no
  recorre categorías relacionadas encontradas en el menú. Los enlaces de fichas
  no generan filas vacías ni amplían el conjunto de resultados.
- Beds & Dreams informa los conteos de sus tres colecciones comerciales y las
  nueve colecciones de confort, además del total único que el extractor forma.
- El motor visual respeta el orden de prioridad de selectores para nombres y
  precios; Elektra y Siman toman el nombre del producto en vez de la marca o
  acción del card, y Siman excluye el porcentaje del texto del precio.

## Fuera de alcance

- Modificar secretos, `.env`, configuración o datos de PostgreSQL.
- Ejecutar la rutina normal de scraping o tocar PROD.
- Añadir fallback HTML de Shopify sin evidencia de fallo del endpoint actual.

## Criterios de aceptación

- Una prueba verifica que Bodegangas consulta la categoría actual y no las
  rutas de búsqueda heredadas, y conserva selectores de tarjeta actuales y
  anteriores. Otra comprueba reintento/advertencia al obtener menos de 20
  productos útiles.
- Beds & Dreams conserva filtros/datos y expone un diagnóstico de los conteos
  de todas las colecciones consultadas.
- La auditoría visita las 19 tiendas mediante el registro compartido y ningún
  camino del comando llama a persistencia o exportación.
- `pnpm test` y `pnpm run build` terminan correctamente.

## Archivos

- `src/gt-maintenance-audit.ts`
- `src/scraper-runtime.ts`
- `src/scrape-facenco-energy.ts`
- `src/scrapers/gt/paged-visual-stores.ts`
- `src/scrapers/gt/beds-dreams.ts`
- `src/scrapers/gt/siman.ts`
- `src/scrapers/gt/card-stores.ts`
- `src/scrapers/gt/furniture-city.ts`
- `src/scrapers/gt/olympia-la-colchoneria.ts`
- `src/scrapers/shared/visual-engine.ts`
- `docs/GT_STORE_AUDIT_2026-09-28.md`
- `src/specs/gt-paged-visual-stores.test.ts`
- `src/specs/furniture-city-gt.test.ts`
- `src/specs/beds-dreams-gt.test.ts`
- `package.json`
