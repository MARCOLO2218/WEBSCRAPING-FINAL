# SPEC-051 - Walmart Nicaragua

Estado: En progreso. El scraper Windows DEV actual coincide por URL con las cuatro fuentes filtradas: 153 productos (19 camas/colchones y 134 accesorios), 141 con precio. El log Ubuntu aportado valida 123 pruebas y el piloto de la implementación anterior (112 productos, 98 con precio); falta publicar y validar allí el código actual.

## Objetivo

Incorporar camas, colchones y accesorios de descanso de Walmart Nicaragua al catálogo regional sin mezclar las categorías ni reutilizar moneda o dominio de Guatemala.

## Fuentes confirmadas

- Protectores y sábanas: referencia histórica 109; conteo GraphQL actual 134.
- Colchones dentro de Colchones y Blancos: referencia histórica 17; conteo GraphQL actual 19.
- Colchones ampliados sin el filtro superior Colchones y Blancos: referencia histórica 18; conteo GraphQL actual 19.
- Búsqueda `camas` sin filtros de categoría o marca: 175 productos actuales; la captura histórica guardada mostraba 143.
- Nueva fuente agrupada por marcas King Koil, Masterbed y Olympia para Colchones; nueva fuente agrupada por marcas Disney Minnie, Hotel Style, King Koil, Mainstays, Mainstays Kids, Masterbed, Olympia y We Bare Bears para Colchones y Blancos.
- Alcance de marcas confirmado por el usuario: al aplicar filtros, Walmart reduce/oculta las marcas disponibles. Se considerará cada URL seleccionada como la combinación máxima disponible que el sitio permite consultar, sin perseguir marcas que desaparecen de los filtros. Las fuentes pueden solaparse y deben consolidarse por URL canónica.
- Producto de control: Cama Individual Masterbed Orthopremier Comfort Ortopédico, URL terminada en `/p` y precio C$9,700.00.

## Criterios de aceptación

- Conservar únicamente productos HTTPS de `www.walmart.com.ni` y precios NIO.
- Extraer productos mediante la API pública REST de catálogo, con filtros de categoría/marca y rangos máximos de 50 registros.
- Separar accesorios de camas/colchones en los conteos e informes.
- Deduplicar por URL canónica los productos presentes en más de una búsqueda o filtro.
- Conservar disponibilidad, precio regular, precio de oferta, descuento, marca, imagen y URL fuente.
- Mantener la tienda fuera del ejecutor principal hasta completar el piloto en Ubuntu DEV.

## Evidencia y cobertura pendiente

- La búsqueda amplia y las cuatro combinaciones filtradas se auditan por separado. La amplia contiene todas las URLs de esas combinaciones más 22 URLs fuera de las facetas elegidas; no se suman como productos adicionales sin clasificación. Se deduplica por URL canónica.
- El piloto Ubuntu DEV del 2026-09-25 mantuvo 114 productos únicos y 102 con precio en modo de solo lectura (`databaseWrites: false`).
- El log Ubuntu DEV aportado el 2026-09-26 ejecutó `npm install`, `npm test` y el piloto en la misma sesión: 123/123 pruebas aprobadas; piloto `status: piloto`, `databaseWrites: false`, 112 productos únicos (19 camas/colchones, 93 accesorios), 98 con precio y 14 sin precio. La salida corresponde a la implementación anterior por términos, no a los filtros REST categoría/marca de este checkout; se registra como referencia histórica, no como validación de la versión actual.
- El diagnóstico de ese piloto clasificó 19 como camas/colchones y 95 como accesorios. En los 12 sin precio, la API devolvió oferta del vendedor Walmart con `Price=0`, `ListPrice=0`, `AvailableQuantity=0` e `IsAvailable=false`.
- Esos doce productos se conservan con precio vacío: no se inventa precio ni disponibilidad a partir de una ficha listada en búsqueda.
- Auditoría de `SOLO CAMAS SIN FILTROS HTML.html`: conserva `selectedFacets=[ft:camas]`, `recordsFiltered=143`, rango 0–20 y enlace a página 2. Es una fuente amplia separada de las combinaciones acotadas por categoría/marca.
- Dos HTML filtrados guardados muestran rutas canónicas con los filtros esperados, pero su estado serializado de VTEX contiene `selectedFacets=[]`, `recordsFiltered=16407` y productos de abarrotes. Esas capturas no certifican los resultados filtrados; se validarán las URLs actuales durante el piloto.
- La auditoría completa de solo lectura de las cinco fuentes ya registra rangos, totales GraphQL, URLs únicas e intersecciones. Se conserva el límite de las cuatro combinaciones filtradas elegidas por el usuario; los 22 productos exclusivos de la búsqueda amplia quedan identificados aparte.
- Se agregó `scripts/walmart-nc-filter-audit.mjs` para hacer esa auditoría en el navegador, recorrer páginas hasta que no aparezcan productos nuevos (con tope configurable), reportar facetas visibles y contar intersecciones. Es una prueba de navegación de solo lectura; no importa conexión a PostgreSQL.
- La primera ejecución del auditor no certifica cobertura: detectó 175 resultados en la fuente amplia, pero solo 16 URLs en dos páginas; tres fuentes no produjeron enlaces reconocidos. Se corrigió la detección para aceptar URLs con query string y ya no detenerse por una página corta. Repetir auditoría antes de registrar conteos.
- Diagnóstico de solo lectura en Windows, 2026-09-26: el navegador renderiza resultados por carga dinámica; esperar sin desplazar mostró sólo 8 enlaces, mientras desplazar elevó temporalmente el DOM a 21. Por ello los conteos DOM del auditor no se consideran completos.
- Una primera consulta diagnóstica escrita manualmente omitió un nivel `brand` y por eso devolvió cero productos; ese resultado no correspondía a la URL del repositorio. La URL exacta guardada en `src/scrapers/nc/walmart.ts` y en el auditor tiene nueve niveles `brand` alineados con nueve marcas del `query`, además de `ft=camas`. Al probar esa URL exacta, GraphQL reportó `recordsFiltered: 19` y devolvió 19 productos con las facetas esperadas. El código existente ya conserva ese mapeo correcto.
- Otras fuentes consultadas devolvieron mediante GraphQL 19 productos para colchones ampliados, 133 para Colchones y Blancos y 134 para Protectores y Sábanas. Esos totales son observaciones actuales, no equivalen a las referencias históricas de 18, 17 y 109. Colchones y Blancos y Protectores y Sábanas devolvieron 21 productos en la primera página (`from=0`, `to=20`); la paginación posterior avanzó por rangos de 21 (`from=21`, luego `42`). Falta recopilar todas las páginas y deduplicar.
- La búsqueda amplia `camas?map=ft` informa `recordsFiltered: 175`. El scroll activa `productSearchV3`; al repetir la consulta pública con rangos de 21 se obtuvieron nueve páginas (21, 21, 21, 21, 21, 21, 21, 21, 7), 175 registros y 175 URLs canónicas únicas, sin duplicados. El total coincide con lo visible en la página.
- Auditoría previa de solo lectura 2026-09-26: los filtros de colchones devolvieron 19/19; Colchones y Blancos devolvió 133 registros pero 132 URLs únicas por una repetición; Protectores y Sábanas devolvió 134/134. Una repetición de consulta posterior confirmó 133/133 para Colchones y Blancos y 134/134 para Protectores y Sábanas, cada fuente igualando su total GraphQL. Las variables se leen de las consultas reales.
- Resultado conjunto actual: suma de 480 apariciones únicas por fuente y 175 URLs deduplicadas entre las cinco fuentes. La unión de los cuatro filtros tiene 153 URLs; todas están presentes en la búsqueda amplia. Las otras 22 URLs pertenecen solo a la búsqueda amplia. Los conteos son de fuentes, no una suma de productos del scraper.
- Verificación adicional de solo lectura del endpoint público de catálogo, 2026-09-26: `cama` devolvió 102 productos únicos en rangos 0–49 (50), 50–99 (50) y 100–149 (2); la API no publicó `Content-Range` ni `x-total-count`. Incluye coincidencias léxicas fuera del alcance, como productos para mascotas, “camarón”, “camara” y “sofá cama”, de modo que no representa por sí sola la categoría filtrada de descanso.
- El endpoint REST por término `camas` devolvió un array vacío; no reproduce la búsqueda por faceta. En la página amplia, `productSearchV3` aparece después de activar la carga dinámica con scroll y permite consultar sus rangos completos.
- Una primera extracción DOM solo recogió 71 URLs y una pasada posterior con scroll llegó a 131; ambas quedan reemplazadas por la paginación GraphQL completa de 175/175.
- Reconciliación exacta, de solo lectura, del scraper REST frente a las cuatro fuentes GraphQL: 153 URLs en cada conjunto; 153 coincidencias, cero faltantes y cero extras. Las fuentes GraphQL actuales devolvieron 19, 19, 133 y 134 registros; sus 305 apariciones se deduplican a 153 URLs. Las 22 URLs restantes de la búsqueda amplia quedan fuera de las facetas elegidas.
- Reejecución local en Windows del conjunto de términos predeterminado (`cama`, `colchon`, `protector cama`, `sabana`): 112 únicos (19 camas/colchones, 93 accesorios), 98 con precio y 14 sin precio. El piloto Ubuntu del 2026-09-25 había dado 114 (19 y 95; 102 con precio), por lo que la variación entre fecha/ambiente sigue observada y no se ha atribuido a una causa.
- Un experimento previo con términos adicionales produjo 193 productos e incorporó 40 fuera de las facetas exactas; esa estrategia no se adoptó. La consulta REST por categoría y marca cubre las URLs seleccionadas sin esos extras.
- Implementación local en `src/scrapers/nc/walmart.ts`: consulta REST `C:14/115/566` con marcas King Koil, Masterbed y Olympia usando `ft=cama`/`ft=colchon`, y `C:14/115/563` con las seis marcas elegidas para Protectores y Sábanas. Usa rangos de hasta 50. El filtro por nombre descarta la coincidencia ajena `Set Olympia Easy Firm Imperial` y recupera el colchón Masterbed sin “cama” en el título.

## Implementación

- El extractor consulta la API pública REST con filtros de categoría y marca y rangos de hasta 50 productos.
- Valida URLs `/p`, conserva precios NIO, clasifica por subcategoría y deduplica por URL canónica.
- No está registrado todavía en el ejecutor principal.
- El piloto local Windows de solo lectura de la implementación actual devolvió 153 productos, 141 con precio y 12 sin precio. La coincidencia exacta con las cuatro fuentes GraphQL quedó validada. Pendiente: desplegar esta versión en Ubuntu DEV, confirmar que `npm test` y el piloto den 153 productos (19 y 134), y mantener `databaseWrites: false`. La tienda continúa deshabilitada y fuera del ejecutor principal.
