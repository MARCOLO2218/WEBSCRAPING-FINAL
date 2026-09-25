# SPEC-051 - Walmart Nicaragua

Estado: Piloto Ubuntu DEV y diagnóstico de ofertas validados; 114 productos únicos (19 camas/colchones y 95 accesorios), 102 con precio. Falta certificar cobertura total frente a las vistas de referencia.

## Objetivo

Incorporar camas, colchones y accesorios de descanso de Walmart Nicaragua al catálogo regional sin mezclar las categorías ni reutilizar moneda o dominio de Guatemala.

## Fuentes confirmadas

- Protectores y sábanas: 109 resultados observados.
- Colchones dentro de Colchones y Blancos: 17 resultados observados.
- Colchones ampliados sin el filtro superior Colchones y Blancos: 18 resultados observados.
- Búsqueda de texto `camas` sin filtros de categoría o marca: 143 resultados en el HTML guardado; página 1 muestra 21 productos y enlace a página 2.
- Nueva fuente agrupada por marcas King Koil, Masterbed y Olympia para Colchones; nueva fuente agrupada por marcas Disney Minnie, Hotel Style, King Koil, Mainstays, Mainstays Kids, Masterbed, Olympia y We Bare Bears para Colchones y Blancos.
- Alcance de marcas confirmado por el usuario: al aplicar filtros, Walmart reduce/oculta las marcas disponibles. Se considerará cada URL seleccionada como la combinación máxima disponible que el sitio permite consultar, sin perseguir marcas que desaparecen de los filtros. Las fuentes pueden solaparse y deben consolidarse por URL canónica.
- Producto de control: Cama Individual Masterbed Orthopremier Comfort Ortopédico, URL terminada en `/p` y precio C$9,700.00.

## Criterios de aceptación

- Conservar únicamente productos HTTPS de `www.walmart.com.ni` y precios NIO.
- Extraer productos mediante la API pública de catálogo usada por el sitio, con rangos máximos de 50 registros.
- Separar accesorios de camas/colchones en los conteos e informes.
- Deduplicar por URL canónica los productos presentes en más de una búsqueda o filtro.
- Conservar disponibilidad, precio regular, precio de oferta, descuento, marca, imagen y URL fuente.
- Mantener la tienda fuera del ejecutor principal hasta completar el piloto en Ubuntu DEV.

## Evidencia y cobertura pendiente

- Revisar los totales únicos de la búsqueda amplia y las combinaciones filtradas indicadas por el usuario; el extractor excluye mascotas y categorías ajenas. La cifra 143 de la búsqueda amplia no se sumará directamente a las fuentes filtradas: se deduplicarán los productos por URL canónica.
- El piloto Ubuntu DEV del 2026-09-25 mantuvo 114 productos únicos y 102 con precio en modo de solo lectura (`databaseWrites: false`).
- El diagnóstico de ese piloto clasificó 19 como camas/colchones y 95 como accesorios. En los 12 sin precio, la API devolvió oferta del vendedor Walmart con `Price=0`, `ListPrice=0`, `AvailableQuantity=0` e `IsAvailable=false`.
- Esos doce productos se conservan con precio vacío: no se inventa precio ni disponibilidad a partir de una ficha listada en búsqueda.
- Auditoría de `SOLO CAMAS SIN FILTROS HTML.html`: conserva `selectedFacets=[ft:camas]`, `recordsFiltered=143`, rango 0–20 y enlace a página 2. Es una fuente amplia separada de las combinaciones acotadas por categoría/marca.
- Dos HTML filtrados guardados muestran rutas canónicas con los filtros esperados, pero su estado serializado de VTEX contiene `selectedFacets=[]`, `recordsFiltered=16407` y productos de abarrotes. Esas capturas no certifican los resultados filtrados; se validarán las URLs actuales durante el piloto.
- Pendiente para cerrar cobertura: ejecutar, en solo lectura, cada fuente seleccionada por separado, registrar conteo/páginas por fuente, total bruto, total deduplicado, intersecciones y discrepancias respecto a las cifras visibles. No ampliar automáticamente las facetas más allá de las combinaciones máximas confirmadas por el usuario.
- Se agregó `scripts/walmart-nc-filter-audit.mjs` para hacer esa auditoría en el navegador, recorrer páginas hasta que no aparezcan productos nuevos (con tope configurable), reportar facetas visibles y contar intersecciones. Es una prueba de navegación de solo lectura; no importa conexión a PostgreSQL.
- La primera ejecución del auditor no certifica cobertura: detectó 175 resultados en la fuente amplia, pero solo 16 URLs en dos páginas; tres fuentes no produjeron enlaces reconocidos. Se corrigió la detección para aceptar URLs con query string y ya no detenerse por una página corta. Repetir auditoría antes de registrar conteos.

## Implementación

- El extractor consulta la API pública por rangos cerrados de hasta 50 productos.
- Descarta coincidencias ajenas a descanso, valida URLs `/p`, normaliza NIO y deduplica entre búsquedas.
- No está registrado todavía en el ejecutor principal.
- El piloto fue de solo lectura y devolvió 114 productos únicos, con 102 precios; la ejecución del 2026-09-25 confirmó el mismo conteo y diagnosticó los doce restantes como ofertas no disponibles. Esto valida extracción y precios disponibles, pero no certifica igualdad con todos los totales de referencia.
