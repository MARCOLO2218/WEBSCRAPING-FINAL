# SPEC-050 - Siman Nicaragua

Estado: Piloto Ubuntu DEV validado; 77 productos únicos con precio y deduplicación entre búsquedas comprobada. Sigue fuera del ejecutor principal.

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
- En el piloto previo al ajuste de precio se obtuvieron 37 productos únicos con precio; la causa quedó identificada en el sufijo del descuento unido al monto.
- En el piloto Ubuntu DEV posterior al ajuste: 126 tarjetas extraídas, 26 irrelevantes, 100 aceptadas y con precio interpretable, cero URLs inválidas, cero precios descartados y 23 repetidas entre búsquedas; quedaron 77 URLs únicas, todas con precio. Ejecución de solo lectura (`databaseWrites: false`).
- Desglose: camas aportó 71 productos válidos; colchones aportó 29, de los cuales 23 ya estaban en camas y 6 fueron nuevos.
- La muestra contiene productos identificados como camas y colchones, incluyendo una cama inflable.
- Siman concatena el porcentaje de descuento al monto, por ejemplo `C$25,799.00-50%`; el extractor ahora acepta ese sufijo y normaliza el precio a `C$25,799.00`, manteniendo el descuento separado.
- El piloto posterior confirmó que los importes se interpretan correctamente y que la deduplicación reduce el total de 100 productos aceptados a 77 únicos.

## Implementación

- El extractor recorre por separado las cinco páginas de camas y las dos de colchones.
- Usa las tarjetas Algolia vigentes de Siman, moneda NIO, URL canónica y deduplicación entre consultas.
- Se detiene de forma segura ante una página posterior sin productos y sigue fuera del ejecutor principal.
- Piloto Ubuntu DEV: la regla excluye cunas y mini camas; la última ejecución no las mostró en la muestra.
- El reporte incluye conteos brutos, motivos de descarte por página y muestras si vuelve a haber precios no interpretables. Mantener la tienda fuera del ejecutor principal hasta integrar las cuatro tiendas de Nicaragua mediante el flujo controlado previsto.
