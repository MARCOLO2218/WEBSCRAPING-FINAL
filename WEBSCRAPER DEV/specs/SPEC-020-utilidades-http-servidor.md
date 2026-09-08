# SPEC-020: Utilidades HTTP del servidor de catálogo

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Separar del servidor principal las utilidades HTTP reutilizables para cuerpo JSON, respuestas JSON, proxy de imágenes y archivos estáticos.

## Comportamiento esperado

- El cuerpo JSON conserva el límite aproximado de 50 000 caracteres y devuelve un objeto vacío cuando falta o es inválido.
- Las respuestas JSON conservan estado 200 y su tipo de contenido UTF-8.
- El proxy conserva validaciones, estados, encabezados y tiempo de espera actuales.
- Los archivos estáticos conservan protección de ruta, tipos MIME, caché y estados 403/404.
- Todas las rutas API permanecen dentro de `catalog-server.ts` en esta etapa.

## Fuera de alcance

- Cambiar rutas, métodos, mensajes o modelos de respuesta.
- Separar todavía la cola, consultas PostgreSQL o handlers API.
- Introducir FastAPI, autenticación, países o modificar PROD.

## Criterios de aceptación

- Las utilidades viven bajo `src/server/`.
- `catalog-server.ts` las importa y deja de implementarlas.
- Existen pruebas de los contratos HTTP extraídos.
- `npm test` y `npm run build` terminan correctamente.

## Implementación

- `src/server/http.ts`
- Integración desde `src/catalog-server.ts`.
- `src/specs/server-http.test.ts`

## Pruebas

- Lectura de JSON válido e inválido.
- Estado, encabezado y serialización JSON.
- Validaciones locales del proxy de imágenes.
- Protección contra escape del directorio público y archivo inexistente.
- Conservación de las ocho rutas API documentadas.
