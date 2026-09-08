# SPEC-006: Separacion de persistencia PostgreSQL

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Extraer del scraper principal la configuracion y persistencia PostgreSQL sin
cambiar tablas, consultas, Run ID ni reglas de publicacion.

## Comportamiento esperado

- La configuracion PostgreSQL se resuelve en un modulo independiente.
- La creacion compatible de tablas e indices conserva el SQL actual.
- Cada ejecucion y sus productos se guardan dentro de una transaccion.
- La publicacion visual conserva la llave de tres horas por tienda y permite
  publicar antes una cantidad mayor.
- Sin variables PostgreSQL completas se omite el guardado como hasta ahora.

## Fuera de alcance

- Cambiar el esquema o ejecutar una migracion regional.
- Agregar pais, moneda o Tiendas Relax a la base.
- Cambiar consultas del servidor de catalogo.
- Modificar frontend o PROD.

## Criterios de aceptacion

- Existe `src/persistence/postgres.ts`.
- El scraper invoca el modulo nuevo.
- Hay pruebas para configuracion, esquema y variables faltantes.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `src/persistence/postgres.ts`
- Integracion en `src/scrape-facenco-energy.ts`
- `src/specs/postgres-config.test.ts`

## Pruebas

- Esquema `catalogo` predeterminado.
- Deteccion ordenada de variables PostgreSQL faltantes.
- Habilitacion con configuracion completa.
- Rechazo de nombres de esquema inseguros.
- Suite completa de contratos, productos y tiendas.
