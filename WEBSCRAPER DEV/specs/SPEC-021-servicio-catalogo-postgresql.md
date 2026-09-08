# SPEC-021: Servicio de catálogo PostgreSQL

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Separar de `catalog-server.ts` la consulta del catálogo, el complemento de precios FACENCO, la comparación comercial y la serialización CSV.

## Comportamiento esperado

- Se conservan el esquema PostgreSQL, snapshot publicado por tienda, filtros y orden actuales.
- Se mantiene la lectura opcional de `data/precios_facenco.xlsx`.
- Se preservan la referencia FACENCO, etiquetas de comparación y cálculo de precio numérico.
- La exportación conserva BOM, columnas, orden y escape CSV.
- Las rutas API siguen respondiendo con los mismos contratos.

## Fuera de alcance

- Cambiar consultas SQL, filtros, columnas o reglas comerciales.
- Separar la cola del scraper o los handlers HTTP.
- Introducir países en base de datos, FastAPI o modificar PROD.

## Criterios de aceptación

- El servicio vive bajo `src/server/`.
- El servidor principal consume el servicio y deja de implementar sus funciones.
- Existen pruebas de precios, comparación y CSV.
- `npm test` y `npm run build` terminan correctamente.

## Implementación

- `src/server/catalog-service.ts`
- Integración desde `src/catalog-server.ts`.
- `src/specs/catalog-service.test.ts`

## Pruebas

- Lectura del menor precio expresado en quetzales.
- Mezcla de precios FACENCO desde Excel sin alterar otras tiendas.
- Diferencias y etiquetas respecto de FACENCO.
- BOM, columnas y escape de la exportación CSV.
- Frontera entre el servicio y el servidor principal.
