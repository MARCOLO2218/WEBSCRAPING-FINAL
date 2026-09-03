# SPEC-002: Registro de contratos actuales de la API

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Registrar el comportamiento observable de la API Node actual antes de iniciar su
migracion gradual a FastAPI.

## Comportamiento esperado

- Cada endpoint actual queda identificado con metodo, parametros, estados y cuerpo.
- Los modelos de producto y trabajo del scraper quedan descritos.
- Los filtros compartidos y el formato CSV quedan registrados.
- Las particularidades actuales se distinguen de decisiones futuras de diseno.
- Una prueba detecta si aparece una ruta API en el servidor sin registro documental.

## Fuera de alcance

- Cambiar respuestas, validaciones, rutas o metodos del servidor.
- Crear la aplicacion FastAPI o un documento OpenAPI.
- Modificar el frontend, la base de datos o PROD.

## Criterios de aceptacion

- `docs/API_CONTRACTS.md` registra las ocho rutas API actuales.
- La ruta de compatibilidad del CSV generado tambien queda registrada.
- La prueba de inventario compara las rutas literales del servidor con el documento.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `docs/API_CONTRACTS.md`
- `src/specs/api-contracts.test.ts`
- Actualizacion del indice de specs, arquitectura y plan de migracion.

## Pruebas

- Correspondencia exacta entre las rutas `/api/*` declaradas en
  `src/catalog-server.ts` y las documentadas.
- Registro de la ruta `/output/comparacion_colchones.csv`.
- Presencia de secciones esenciales del contrato.
