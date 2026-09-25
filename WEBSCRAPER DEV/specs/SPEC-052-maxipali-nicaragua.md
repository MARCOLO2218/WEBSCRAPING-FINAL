# SPEC-052 - Maxi Pali Nicaragua

Estado: Implementación preparada; piloto pendiente.

## Objetivo

Incorporar los pocos resultados útiles de camas, colchones y cubrecamas publicados por Maxi Palí Nicaragua, evitando coincidencias textuales ajenas al catálogo de descanso.

## Fuentes y cobertura confirmadas

- Búsqueda `cama`: una cama y dos cubrecamas útiles.
- Búsqueda `colchon`: tres colchones inflables útiles.
- Excluir resultados como `Carro RC Camara` y `limpia colchón`.
- Las seis fichas útiles publican nombre, imagen, disponibilidad en Maxi Palí e identificador en la URL.
- Las fichas no publican precio; el scraper debe conservar el precio vacío y no inferirlo.

## Criterios de aceptación

- Conservar únicamente URLs HTTPS de `maxipali.com.ni`.
- Identificar cada producto mediante el código de 12 a 14 dígitos al final de su URL.
- Clasificar por separado cama, colchón y accesorio.
- Excluir coincidencias de cámara y productos de limpieza.
- No inventar precios, descuentos, cuotas ni disponibilidad de inventario.
- Deduplicar por identificador publicado.
- Mantener la tienda fuera del ejecutor principal hasta completar el piloto en Ubuntu DEV.
