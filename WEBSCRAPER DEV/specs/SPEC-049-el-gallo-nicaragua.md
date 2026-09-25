# SPEC-049 - El Gallo mas Gallo Nicaragua

Estado: Piloto Ubuntu DEV validado para las consultas actuales: 40 productos por búsqueda y 40 productos únicos con precio. La tienda sigue fuera del ejecutor principal.

## Objetivo

Incorporar las camas y colchones de El Gallo mas Gallo Nicaragua al catálogo regional sin activar todavía Nicaragua en el ejecutor principal.

## Fuentes confirmadas

- Búsqueda `camas` con tipos Individual, Matrimonial, Queen y King y marcas Capri, Olympia, Facenco, Indufoam, Armonía y Therapedic.
- Búsqueda `colchon` con los mismos tipos y marcas.
- Paginación explícita de 1 a 5.
- Ficha de control SKU `115353`, Set Colchón Matrimonial Capri EXCLUSIVA.

## Evidencia recibida

- Las capturas originales indicaban 43 resultados de camas y 42 de colchones.
- La ficha de control publica moneda NIO, precio de oferta C$10,999 y precio regular C$13,999.
- El catálogo se renderiza con Magento y Algolia; los HTML guardados conservan configuración y conteos, pero no todas las tarjetas generadas en el navegador.
- Piloto Ubuntu DEV del 2026-09-25: 40 productos únicos, todos con precio; ejecución de solo lectura (`databaseWrites: false`).
- Desglose observado para cada búsqueda (`camas` y `colchones`): páginas 1–4 con 9 tarjetas y página 5 con 4 (40 tarjetas por búsqueda).
- La URL previamente duplicada quedó normalizada correctamente.
- El piloto más reciente mostró en el sitio `1-9 out of 40 resultados encontrados` y, al paginar, rangos 10-18, 19-27, 28-36 y 37-40 para ambas consultas. Se extrajeron 9, 9, 9, 9 y 4 tarjetas por búsqueda, todas con precio; el total vigente observado es 40 en camas y 40 en colchones.
- La diferencia con los conteos anteriores de 43 y 42 queda explicada por el conteo visible de la sesión actual; no faltaron tarjetas respecto al total que el sitio publicó durante el piloto.

## Criterios de aceptación

- Conservar únicamente URLs HTTPS del dominio Nicaragua.
- Extraer SKU o URL canónica, nombre, marca, tipo, disponibilidad, precios NIO, descuento e imagen.
- Recorrer hasta cinco páginas por fuente y detenerse de forma segura cuando no existan resultados.
- Deduplicar productos repetidos entre las búsquedas de camas y colchones.
- Usar 40 por consulta como conteo observado en el piloto actual; los conteos pueden cambiar según el catálogo publicado.
- Mantener la tienda fuera del ejecutor principal hasta completar el piloto y la validación en Ubuntu DEV.
