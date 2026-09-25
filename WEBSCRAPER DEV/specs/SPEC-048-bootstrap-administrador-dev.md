# SPEC-048 — bootstrap controlado del primer administrador DEV

## Estado

En progreso. Implementación y pruebas locales preparadas; sin usuario real aún.

## Objetivo

Crear exactamente una cuenta administradora global inicial en la copia
PostgreSQL `webscraper_dev`, sin activar rutas HTTP, frontend o acceso de país.

## Contrato

- Aceptar únicamente `webscraper_dev`, rol `webscraper_user`, revisión
  `044_login_throttle` y la huella regional revisada.
- Exigir un respaldo custom cuya huella SHA-256 coincida antes de escribir.
- Exigir que usuarios, asignaciones, sesiones e intentos estén vacíos.
- Pedir el nombre por entrada interactiva y la contraseña dos veces mediante
  `getpass`; nunca aceptar, registrar ni devolver la contraseña.
- Normalizar el nombre con el servicio existente y almacenar sólo Argon2id.
- Crear una cuenta habilitada con `global_admin=true`, sin asignaciones de país
  y sin sesiones. Administración global no concede acceso al catálogo.
- Bloquear las cuatro tablas dentro de una transacción y volver a comprobar el
  estado antes del INSERT. Toda divergencia revierte la transacción.
- Una repetición exacta verifica usuario y contraseña contra el hash existente,
  conserva UUID/hash y responde `ya_aplicado`; cualquier diferencia se rechaza.
- Permitir rollback sólo para UUID y usuario exactos, con respaldo, autorización de
  pérdida y ausencia total de asignaciones, sesiones e intentos.
- Mantener sin montar `auth_routes`; no hay login visual en esta SPEC.

## Archivos

- `backend/catalog_api/db/auth_admin_bootstrap.py`
- `backend/tests/test_auth_admin_bootstrap.py`
- `specs/SPEC-048-bootstrap-administrador-dev.md`
- `specs/README.md`

## Aceptación

1. El ensayo efímero crea un administrador habilitado y sin relaciones.
2. Repetición exacta es idempotente; credenciales distintas se rechazan.
3. Huella distinta y rollback con UUID o usuario incorrectos se rechazan.
4. El rollback exacto recupera las cuatro tablas vacías.
5. Contraseña y hash nunca aparecen en el informe.
6. Suites Node y Python permanecen aprobadas.
7. SPEC-046 está cerrada con concurrencia PostgreSQL y limpieza final validadas.
8. Antes del apply real se crea y valida un respaldo fresco de `webscraper_dev`.
