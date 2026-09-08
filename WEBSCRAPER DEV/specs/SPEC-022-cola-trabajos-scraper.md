# SPEC-022: Cola de trabajos del scraper

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Separar de `catalog-server.ts` la ejecución del proceso scraper y la cola de trabajos en memoria.

## Comportamiento esperado

- Se conservan los estados `queued`, `running`, `done` y `error`.
- Se mantienen fechas, salida resumida, selección de tiendas y posición en cola.
- Solo se ejecuta un trabajo a la vez y los demás conservan su orden.
- Se mantienen el timeout por cantidad de tiendas, el log técnico y el máximo de 50 trabajos terminados.
- Los endpoints de ejecución, consulta individual y estado global conservan su contrato.

## Fuera de alcance

- Incorporar una cola externa, persistencia de trabajos o cancelación.
- Cambiar mensajes, estados, rutas o selección de tiendas.
- Separar todos los handlers HTTP, introducir FastAPI o modificar PROD.

## Criterios de aceptación

- La cola vive bajo `src/server/`.
- El servidor principal utiliza una interfaz de cola y deja de administrar su estado.
- Existen pruebas de orden, posiciones, éxito, error y resumen de salida.
- `npm test` y `npm run build` terminan correctamente.

## Implementación

- `src/server/scraper-job-queue.ts`
- Integración desde `src/catalog-server.ts`.
- `src/specs/scraper-job-queue.test.ts`

## Pruebas

- Ejecución secuencial y posición de trabajos pendientes.
- Transiciones de éxito y error.
- Snapshot global, último trabajo y consulta individual.
- Resumen de salida y mensajes técnicos.
- Frontera entre la cola y el servidor principal.
