# SPEC-050 - Siman Nicaragua

Estado: Causa principal de exclusión de precios identificada y corregida localmente; requiere nuevo piloto Ubuntu DEV antes de integrar.

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
- Los ejemplos de tarjetas descartadas muestran que Siman concatena el porcentaje de descuento al monto, por ejemplo `C$25,799.00-50%`; el validador esperaba sólo el precio y descartaba tarjetas cuyo monto sí era legible.
- El cambio local acepta ese sufijo porcentual y normaliza el campo de precio a `C$25,799.00`, manteniendo el descuento separado; las pruebas cubren ese formato. Aún falta confirmar los conteos corregidos en Ubuntu DEV.

## Implementación

- El extractor recorre por separado las cinco páginas de camas y las dos de colchones.
- Usa las tarjetas Algolia vigentes de Siman, moneda NIO, URL canónica y deduplicación entre consultas.
- Se detiene de forma segura ante una página posterior sin productos y sigue fuera del ejecutor principal.
- Piloto Ubuntu DEV: la regla excluye cunas y mini camas; la última ejecución no las mostró en la muestra.
- El reporte incluye conteos brutos, motivos de descarte por página y muestras del texto de precio no interpretable. Mantener la tienda fuera del ejecutor principal hasta repetir el piloto, confirmar que los importes quedaron normalizados y revisar la variación previa de 38 a 37 productos.
