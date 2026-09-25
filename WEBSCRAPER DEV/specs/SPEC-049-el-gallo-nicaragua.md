# SPEC-049 - El Gallo mas Gallo Nicaragua

Estado: Piloto inicial ejecutado; ajuste de URL y desglose por página pendientes de revalidación.

## Objetivo

Incorporar las camas y colchones de El Gallo mas Gallo Nicaragua al catálogo regional sin activar todavía Nicaragua en el ejecutor principal.

## Fuentes confirmadas

- Búsqueda `camas` con tipos Individual, Matrimonial, Queen y King y marcas Capri, Olympia, Facenco, Indufoam, Armonía y Therapedic.
- Búsqueda `colchon` con los mismos tipos y marcas.
- Paginación explícita de 1 a 5.
- Ficha de control SKU `115353`, Set Colchón Matrimonial Capri EXCLUSIVA.

## Evidencia recibida

- La búsqueda de camas declara 43 resultados.
- La búsqueda de colchones declara 42 resultados.
- La ficha de control publica moneda NIO, precio de oferta C$10,999 y precio regular C$13,999.
- El catálogo se renderiza con Magento y Algolia; los HTML guardados conservan configuración y conteos, pero no todas las tarjetas generadas en el navegador.
- Piloto Ubuntu DEV inicial: 40 productos únicos, 40 con precio. Se detectó una ficha con el slug repetido en la URL; la normalización ya quedó ajustada localmente.
- El piloto ahora reportará cuántas tarjetas leyó en cada página y consulta, para explicar la diferencia con los 43 y 42 declarados.

## Criterios de aceptación

- Conservar únicamente URLs HTTPS del dominio Nicaragua.
- Extraer SKU o URL canónica, nombre, marca, tipo, disponibilidad, precios NIO, descuento e imagen.
- Recorrer hasta cinco páginas por fuente y detenerse de forma segura cuando no existan resultados.
- Deduplicar productos repetidos entre las búsquedas de camas y colchones.
- Comparar los conteos observados con 43 camas y 42 colchones sin asumir que su suma es el total único.
- Mantener la tienda fuera del ejecutor principal hasta completar el piloto y la validación en Ubuntu DEV.
