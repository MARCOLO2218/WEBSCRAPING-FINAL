# SPEC-050 - Siman Nicaragua

Estado: Piloto Ubuntu DEV con desglose ejecutado; falta inspeccionar precios descartados y explicar una variación de un producto antes de integrar.

## Objetivo

Incorporar los resultados de camas y colchones de Siman Nicaragua al catálogo regional, reutilizando la estrategia de navegación de Siman Guatemala sin mezclar dominios ni monedas.

## Fuentes confirmadas

- Búsqueda `camas`: 94 resultados observados, páginas 1 a 5.
- Búsqueda `colchones`: 32 resultados observados, páginas 1 y 2.
- Filtros disponibles: categorías, precio, marca, tamaño de cama, materiales y otros atributos según la consulta.

## Criterios de aceptación

- Conservar únicamente productos HTTPS de `ni.siman.com` y precios NIO.
- Recorrer como máximo cinco páginas de camas y dos de colchones.
- Extraer identidad o URL canónica, nombre, marca, categoría, disponibilidad, precios, descuento e imagen.
- Deduplicar por URL canónica los productos presentes en ambas búsquedas.
- Reportar por separado los conteos brutos y el total único.
- Mantener la tienda fuera del ejecutor principal hasta completar el piloto en Ubuntu DEV.

## Evidencia

- El usuario proporcionó capturas y HTML guardado para las cinco páginas de camas y dos de colchones.
- Piloto Ubuntu DEV del 2026-09-25: se extrajeron 20, 20, 20, 20 y 14 tarjetas en camas (94 en total), y 20 y 12 en colchones (32 en total).
- El piloto previo produjo 38 URLs únicas; la ejecución con diagnóstico produjo 37 únicas y 37 con precio, también de solo lectura (`databaseWrites: false`). La diferencia de un producto está pendiente de explicación.
- En la ejecución diagnóstica: 26 tarjetas irrelevantes, 54 con texto de precio no interpretable, 9 repetidas y 37 URLs únicas conservadas. Las categorías de tarjeta suman 126; las 9 repeticiones están dentro de las 46 tarjetas aceptadas antes de deduplicar.
- La muestra contiene productos identificados como camas y colchones, incluyendo una cama inflable.
- El cambio local agrega por página los conteos de tarjetas irrelevantes, URL inválida, precio ilegible, URLs repetidas y aceptadas, más hasta dos ejemplos del texto de precio no interpretable; inspeccionar esos ejemplos en la siguiente ejecución.

## Implementación

- El extractor recorre por separado las cinco páginas de camas y las dos de colchones.
- Usa las tarjetas Algolia vigentes de Siman, moneda NIO, URL canónica y deduplicación entre consultas.
- Se detiene de forma segura ante una página posterior sin productos y sigue fuera del ejecutor principal.
- Piloto Ubuntu DEV: la regla excluye cunas y mini camas; la última ejecución no las mostró en la muestra.
- El reporte incluye conteos brutos y motivos de descarte por página. Mantener la tienda fuera del ejecutor principal hasta inspeccionar los textos de precio y conciliar por qué el total único varió de 38 a 37.
