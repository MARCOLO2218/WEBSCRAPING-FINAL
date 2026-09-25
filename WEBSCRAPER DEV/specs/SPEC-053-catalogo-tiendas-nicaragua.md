# SPEC-053 - Registro central de tiendas de Nicaragua

Estado: En progreso.

## Objetivo

Agregar al catálogo central las cinco tiendas NC que ya cuentan con extractores piloto, conservándolas deshabilitadas hasta completar la integración y validación funcional del país.

## Alcance

- Registrar La Curacao, El Gallo mas Gallo, Siman, Walmart y Maxi Pali con país `NC` y moneda `NIO` por medio del catálogo de países.
- Mantener `enabled: false` para todas las tiendas NC; el selector y ejecutor actuales siguen mostrando únicamente Guatemala.
- Conservar sus extractores fuera del ejecutor principal y no activar Nicaragua ni realizar escrituras en PostgreSQL.

## Criterios de aceptación

- El catálogo central conserva las 19 tiendas habilitadas de Guatemala y añade cinco tiendas NC deshabilitadas.
- No se puede seleccionar ninguna tienda NC mediante la lista de tiendas habilitadas.
- Las pruebas verifican nombres, identificadores, país y estado de habilitación.
- La suite Node completa pasa.

## Fuera de alcance

- Activar el país, exponer su selector visual, integrar las tiendas en la cola principal o persistir resultados.
- Cambios en `WEBSCRAPER PROD` o en bases de datos.
