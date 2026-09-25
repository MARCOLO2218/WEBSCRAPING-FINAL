# SPEC-051 - Walmart Nicaragua

Estado: Implementación preparada; piloto pendiente.

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

- Ejecutar el piloto API desde Ubuntu DEV y comparar los conteos con las tres vistas observadas.
- Confirmar el total único después de eliminar duplicados entre los conjuntos de 17 y 18 colchones.

## Implementación

- El extractor consulta la API pública por rangos cerrados de hasta 50 productos.
- Descarta coincidencias ajenas a descanso, valida URLs `/p`, normaliza NIO y deduplica entre búsquedas.
- No está registrado todavía en el ejecutor principal.
