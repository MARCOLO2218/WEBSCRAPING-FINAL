# SPEC-050 - Siman Nicaragua

Estado: Piloto inicial ejecutado; exclusión de cunas y revalidación pendientes.

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

## Evidencia pendiente

- Confirmar mediante ejecución piloto los productos únicos y las diferencias entre ambas búsquedas.
- Conservar muestras locales de las cinco páginas de camas para pruebas de regresión del DOM.

## Implementación

- El extractor recorre por separado las cinco páginas de camas y las dos de colchones.
- Usa las tarjetas Algolia vigentes de Siman, moneda NIO, URL canónica y deduplicación entre consultas.
- Se detiene de forma segura ante una página posterior sin productos y sigue fuera del ejecutor principal.
- Piloto Ubuntu DEV inicial: 57 productos únicos, 57 con precio. Una cuna apareció en la búsqueda de camas por contener “mini cama”; el extractor ahora excluye cunas y mini camas.
- La próxima salida incluirá conteos por búsqueda y página para comparar con los 94 resultados de camas y 32 de colchones declarados.
