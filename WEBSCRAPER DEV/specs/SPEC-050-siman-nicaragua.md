# SPEC-050 - Siman Nicaragua

Estado: Piloto Ubuntu DEV repetido; extracción y paginación responden, pero falta conciliar deduplicación y filtros antes de integrar.

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
- El resultado final contiene 38 URLs únicas y 38 con precio; ejecución de solo lectura (`databaseWrites: false`).
- La muestra contiene productos identificados como camas y colchones, incluyendo una cama inflable.
- El cambio local agrega por página los conteos de tarjetas irrelevantes, URL inválida, precio ilegible, URLs repetidas y aceptadas; todavía falta subirlo y ejecutar el piloto en Ubuntu DEV para obtener esas cifras reales.

## Implementación

- El extractor recorre por separado las cinco páginas de camas y las dos de colchones.
- Usa las tarjetas Algolia vigentes de Siman, moneda NIO, URL canónica y deduplicación entre consultas.
- Se detiene de forma segura ante una página posterior sin productos y sigue fuera del ejecutor principal.
- Piloto Ubuntu DEV: la regla excluye cunas y mini camas; la última ejecución no las mostró en la muestra.
- El reporte incluirá conteos brutos y motivos de descarte por página. Mantener la tienda fuera del ejecutor principal hasta revisar el nuevo piloto y las 38 URLs resultantes.
