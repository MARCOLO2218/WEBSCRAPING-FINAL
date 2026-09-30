# SPEC-076 — Vista previa de administración de usuarios

Estado: implementación local; lista para revisión visual en DEV después de la publicación del archivo estático.

## Objetivo

Permitir revisar el diseño de niveles globales, permisos por país y bitácora antes de activar SPEC-075 en la aplicación.

## Alcance y seguridad

- Agregar `public/admin-usuarios-demo.html`, servida como archivo estático por el catálogo Node existente.
- Identificar la página de forma persistente como demostración no operativa y usar únicamente cuentas/eventos ficticios.
- Permitir probar visualmente asignación de países, niveles, creación y bloqueo/desbloqueo en memoria de página. Recargar restaura los ejemplos.
- Simular reset de clave sin pedir ni almacenar una contraseña.
- No usar `fetch`, API, cookies, almacenamiento local, PostgreSQL ni servicios de autenticación; ningún cambio llega al servidor.
- Mantener `public/admin-usuarios.html`, los routers y las rutas operativas sin cambios ni montaje.

## Validación

Build TypeScript aprobado y suite Node completa: 207/207. La prueba estática
`src/specs/admin-users-demo.test.ts` verifica que la página identifica sus
límites y no contiene mecanismos de transmisión o persistencia. `pnpm test` no
pudo iniciar porque pnpm intentó descargar `@pnpm/exe` y la red local bloqueó
la conexión; se ejecutó el mismo compilador y runner Node desde `node_modules`.

La revisión visual en Ubuntu DEV queda pendiente de que el usuario publique el archivo. URL esperada: `/admin-usuarios-demo.html` en el mismo host/base URL de DEV.
