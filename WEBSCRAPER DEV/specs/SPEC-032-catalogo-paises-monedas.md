# SPEC-032: Catálogo central de países y monedas

Estado: Completada

## Objetivo

Primera implementación de SPEC-029: configuración tipada GT/GTQ, HN/HNL,
SV/USD y NC/NIO. Mantener únicamente GT operativo mientras los demás países
están pendientes de aislamiento y tiendas. No confundir país configurado con operativo.

## Aceptación

Un catálogo central inmutable define códigos, nombres, monedas y estado operativo.
La validación rechaza países desconocidos y moneda incompatible sin convertir
importes ni usar GT como fallback. El tipo CountryCode del catálogo de tiendas
se comparte, manteniendo sus importaciones existentes y las 19 tiendas GT.
Pruebas cubren los cuatro pares, pares cruzados, códigos desconocidos y GT.

## Límites

Sin migraciones, Excel, endpoints ni cambios visuales. No habilitar tiendas de
otros países todavía. El formato del Excel sigue pendiente de definición.
Validación real FastAPI sigue pendiente; esta configuración independiente permite
avanzar en regionalización sin cambiar las consultas existentes.

## Resultado

src/config/countries.ts implementa catálogo y validación; store-catalog.ts comparte
el tipo sin romper sus consumidores. src/specs/countries.test.ts agrega tres
pruebas. npm test: 70 aprobadas. Pytest: 39 aprobadas, dos avisos de dependencias.
Implementado localmente; publicación Ubuntu pendiente.
