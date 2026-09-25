# SPEC-051 - Walmart Nicaragua

Estado: Piloto Ubuntu DEV y diagnóstico de ofertas validados; 114 productos únicos (19 camas/colchones y 95 accesorios), 102 con precio. Falta certificar cobertura total frente a las vistas de referencia.

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

## Evidencia y cobertura pendiente

- Revisar el total único de 114 frente a las tres vistas observadas; el extractor excluye mascotas y categorías ajenas.
- El piloto Ubuntu DEV del 2026-09-25 mantuvo 114 productos únicos y 102 con precio en modo de solo lectura (`databaseWrites: false`).
- El diagnóstico de ese piloto clasificó 19 como camas/colchones y 95 como accesorios. En los 12 sin precio, la API devolvió oferta del vendedor Walmart con `Price=0`, `ListPrice=0`, `AvailableQuantity=0` e `IsAvailable=false`.
- Esos doce productos se conservan con precio vacío: no se inventa precio ni disponibilidad a partir de una ficha listada en búsqueda.

## Implementación

- El extractor consulta la API pública por rangos cerrados de hasta 50 productos.
- Descarta coincidencias ajenas a descanso, valida URLs `/p`, normaliza NIO y deduplica entre búsquedas.
- No está registrado todavía en el ejecutor principal.
- El piloto fue de solo lectura y devolvió 114 productos únicos, con 102 precios; la ejecución del 2026-09-25 confirmó el mismo conteo y diagnosticó los doce restantes como ofertas no disponibles. Esto valida extracción y precios disponibles, pero no certifica igualdad con todos los totales de referencia.
