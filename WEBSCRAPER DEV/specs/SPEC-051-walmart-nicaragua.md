# SPEC-051 - Walmart Nicaragua

Estado: Piloto Ubuntu DEV repetido; 114 productos únicos y 102 con precio. Pendiente revisar los 12 sin precio y separación por categoría.

## Objetivo

Incorporar camas, colchones y accesorios de descanso de Walmart Nicaragua al catálogo regional sin mezclar las categorías ni reutilizar moneda o dominio de Guatemala.

## Fuentes confirmadas

- Protectores y sábanas: 109 resultados observados.
- Colchones dentro de Colchones y Blancos: 17 resultados observados.
- Colchones ampliados sin el filtro superior Colchones y Blancos: 18 resultados observados.
- Producto de control: Cama Individual Masterbed Orthopremier Comfort Ortopédico, URL terminada en `/p` y precio C$9,700.00.

## Criterios de aceptación

- Conservar únicamente productos HTTPS de `www.walmart.com.ni` y precios NIO.
- Extraer productos mediante la API pública de catálogo usada por el sitio, con rangos máximos de 50 registros.
- Separar accesorios de camas/colchones en los conteos e informes.
- Deduplicar por URL canónica los productos presentes en más de una búsqueda o filtro.
- Conservar disponibilidad, precio regular, precio de oferta, descuento, marca, imagen y URL fuente.
- Mantener la tienda fuera del ejecutor principal hasta completar el piloto en Ubuntu DEV.

## Evidencia pendiente

- Revisar el total único de 114 frente a las tres vistas observadas; el extractor excluye mascotas y categorías ajenas.
- Revisar los 12 productos listados sin precio, que pueden estar agotados o sin oferta pública.
- El piloto Ubuntu DEV del 2026-09-25 mantuvo 114 productos únicos y 102 con precio en modo de solo lectura (`databaseWrites: false`).

## Implementación

- El extractor consulta la API pública por rangos cerrados de hasta 50 productos.
- Descarta coincidencias ajenas a descanso, valida URLs `/p`, normaliza NIO y deduplica entre búsquedas.
- No está registrado todavía en el ejecutor principal.
- El piloto fue de solo lectura y devolvió 114 productos únicos, con 102 precios; la ejecución del 2026-09-25 confirmó el mismo conteo.
