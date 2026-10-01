# Auditoría en vivo de tiendas GT — 2026-09-28

## Alcance y método

Se revisaron las 19 tiendas del registro oficial con `pnpm run audit:gt`. El
comando invoca extractores actuales en serie y reporta conteo, campos y ejemplos;
no genera CSV/Excel ni guarda en PostgreSQL. Los resultados son una fotografía
del catálogo público, no una garantía de conteo permanente.

Los conteos siguientes corresponden al recorrido completo. Elektra y Siman se
volvieron a inspeccionar selectivamente después de ajustar selectores; esos
resultados actualizados se explican en su fila.

| Tienda | Resultado observado | Lectura de mantenimiento |
|---|---:|---|
| FACENCO | 13, sin precio | Funciona; esta fuente publica ficha/descripción sin precio en listado. |
| Camas Olympia Online GT | 41, 41 con precio | Funciona. |
| La Colchoneria Guatemala | 32, 32 con precio | Funciona; se igualó `source_site` al nombre canónico del registro para evitar reintentos falsos. |
| Sleep Gallery Guatemala | 122 candidatos, 78 con precio | Funciona; categorías de sábanas/protectores no son fichas de cama. |
| Serta Guatemala | 14 útiles; 16 antes del filtro | Funciona en las secciones registradas. |
| Americana 2000 Guatemala | 40 | API responde: 44 recibidos, 40 marcas incluidas. |
| Mattress Guatemala | Error del sitio | Devuelve “Error establishing a database connection”; el extractor ya lo reporta como error, no catálogo vacío. |
| Beds & Dreams | 39, todos con precio | API Shopify responde: Simmons 26, Indufoam 13, bases eléctricas 1; 17 coincidencias en colecciones de confort. No se reproduce el resultado bajo de 3 en esta validación. |
| Furniture City Guatemala | 61 candidatos, 7 con precio | El selector general incluye enlaces de navegación; la regla final reduce a productos útiles. Conviene una revisión específica posterior de la categoría/paginación. |
| La Curacao Guatemala | 35, todos con precio | Funciona. |
| MAX Guatemala | 581 | Funciona; sus cinco búsquedas cargan contenido dinámico y el barrido tarda más de dos minutos. |
| Elektra Guatemala | 12, todos con precio | Selector corregido para tomar el nombre del artículo y no la marca; comprobación selectiva confirmó títulos completos. |
| Walmart Guatemala | 562, 562 con precio normalizado | API responde y mantiene filtro por producto. |
| Cemaco Guatemala | 20, todos con precio | Funciona; los precios vienen sin separador decimal normalizado en algunos casos y se debe revisar su parser aparte. |
| Siman Guatemala | 142 candidatos en ocho páginas | Selector Algolia corregido. La validación nueva de página 1 devolvió 20 nombres limpios y precios limpios. La revisión completa original tardó 443 segundos. |
| Suena Center Guatemala | 18 | API Algolia responde. |
| Dormilandia Guatemala | 70 | Funciona. |
| Dormisuenos Guatemala | 21 | Funciona. |
| Bodegangas Guatemala | Bloqueo anti-bot en Playwright | El extractor no lee la página automatizada: responde “Checking your browser”. Una referencia indexada (posible caché) anuncia 48 camas, 20 por página y paginación, pero no confirma el total vivo actual. El lector contempla selectores WooCommerce/WoodMart y eTheme; falta validarlo desde un host no bloqueado. |

## Cambios aplicados

- Bodegangas: fuente canónica anidada `/categoria-producto/dormitorio/camas/`,
  tarjetas `.product-grid-item`/`li.product` actuales y
  `.etheme-product-grid-item` anterior, enlaces de producto y paginación.
  El scraper normal reintenta si entrega menos de 20 productos útiles y emite
  advertencia de calidad si el resultado final sigue bajo ese umbral.
- Beds & Dreams: conteos diagnósticos de las 12 colecciones consultadas para
  separar descarga de colección de filtrado/deduplicación.
- La Colchoneria: `source_site` usa el nombre exacto registrado y no provoca
  reintentos innecesarios.
- Mattress: detección explícita del error remoto de base de datos.
- Elektra y Siman: se prioriza el texto del título frente a marca/acción; Siman
  también separa el precio de venta del descuento porcentual.
- El coordinador no inicia el scraping normal al ser importado y carga `.env`
  sólo desde su `main()` directo. Así, el comando de mantenimiento no dispara
  accidentalmente exportación ni persistencia.

## Validación

`pnpm test`: 181 pruebas aprobadas; `pnpm run build`: aprobado. Elektra y Siman
se volvieron a consultar después de sus correcciones. Bodegangas sigue limitado
por el challenge anti-bot; Mattress depende de que el comercio restaure su base.

## Verificación adicional en navegador — 2026-09-27

El navegador integrado abrió Bodegangas en vivo: la categoría reportó 46 camas;
la página 1 mostró 25 tarjetas y `/page/2/` abrió la segunda página con 21
productos distintos. El control “1 / 3” visible corresponde al carrusel de
categorías, no a las páginas de productos. Esto confirma categoría y paginación
HTTP, pero no ejecuta el extractor TypeScript ni expone sus selectores DOM.
Mattress devolvió
`Error establishing a database connection` tanto en `/` como en
`/wp-json/wc/store/v1/products?per_page=5`, así que un fallback de catálogo por
esa API tampoco es posible en este momento.

## Seguimiento de Furniture City — 2026-10-01

Una consulta de solo lectura a la web pública encontró que la ruta configurada
[`/mattress-colchones/`](https://www.furniturecity.com.gt/mattress-colchones/)
ahora presenta contenido de marca y no el listado de productos. La
[categoría oficial `/product-category/Descanso/`](https://www.furniturecity.com.gt/product-category/Descanso/)
muestra cinco colchones con precios y fichas de producto. También se identificó que el scraper
añadía filas placeholder sin precio al descubrir enlaces `/producto/`; estas
podían sustituir filas de categoría con precio por compartir la misma URL. La
fuente se cambió a la categoría de Descanso, el descubrimiento se limita a
categorías de descanso/colchones y se eliminaron los placeholders de fichas.
La prueba automatizada protege la categoría y la conservación de precios. Falta
validar el extractor en DEV frente al sitio y revisar la paginación actual; esta
consulta web no equivale a ejecutar Playwright ni certifica cobertura completa.
Validación local de este incremento: TypeScript compiló y Node aprobó 210/210
pruebas. `corepack pnpm test` no pudo iniciar porque Windows negó crear la
carpeta temporal de Corepack; se usaron los binarios de `node_modules` sin
cambiar esa configuración.

## Resultado de auditoría puntual Ubuntu — 2026-10-01

Con `9e7af1d` y luego el ajuste de compilación `72a80e0`, `audit:gt` llegó a
ejecutar sólo Furniture City sin errores de navegación: 58 candidatos, 58 con
nombre, 58 con URL y 7 con precio. La extracción aún no está resuelta. El
auditor recorría todas las URLs de categorías enlazadas cuyo path contenía
`colchones` o `descanso`; se acotó localmente a la categoría oficial
`/product-category/Descanso/`, que la página pública anuncia con cinco
resultados. Una nueva prueba verifica que no se navegue a categorías enlazadas.
Falta publicar este último ajuste y repetir la auditoría puntual antes de valorar
conteo, precios y paginación.

El ajuste compiló localmente y la suite Node pasó 210/210. No se ha ejecutado
todavía la auditoría con la extracción acotada.
