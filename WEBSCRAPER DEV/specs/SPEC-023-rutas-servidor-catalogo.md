# SPEC-023: Rutas del servidor de catálogo

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Separar los handlers y rutas HTTP de `catalog-server.ts` y cerrar la modularización del servidor Node actual.

## Comportamiento esperado

- Se conservan las ocho rutas API, la descarga CSV de compatibilidad y el fallback estático.
- Se mantienen métodos, estados, encabezados, cuerpos y mensajes de error documentados.
- El archivo de arranque solamente carga ambiente, configura dependencias, crea el servidor y escucha el puerto.
- Los servicios de catálogo y cola ya separados continúan siendo utilizados por las rutas.

## Fuera de alcance

- Cambiar contratos HTTP o comportamiento visible.
- Incorporar FastAPI, autenticación, base regional o frontend de países.
- Modificar PROD.

## Criterios de aceptación

- Las rutas viven bajo `src/server/`.
- `catalog-server.ts` queda como punto de composición y arranque.
- Las pruebas de contrato reconocen las rutas en su nuevo módulo.
- `npm test` y `npm run build` terminan correctamente.

## Implementación

- `src/server/routes.ts`
- Composición mínima en `src/catalog-server.ts`.
- `src/specs/server-routes.test.ts`
- Actualización de `src/specs/api-contracts.test.ts`.

## Pruebas

- Conservación de las ocho rutas API documentadas.
- Estado global de la cola.
- Respuesta para un trabajo inexistente.
- Fallback de archivos estáticos.
- Frontera de composición y arranque.
