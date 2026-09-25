# SPEC-047 — migración controlada del esquema de autenticación DEV

## Estado

En progreso.

## Objetivo

Aplicar y verificar las revisiones `043_auth` y `044_login_throttle` únicamente
en la copia PostgreSQL `webscraper_dev`, después de confirmar `042_regional`,
con respaldo validado y sin crear usuarios ni habilitar el login.

## Comportamiento esperado

- Rechazar cualquier base o rol distinto de `webscraper_dev` y
  `webscraper_user` antes de tomar bloqueos o ejecutar DDL.
- Aceptar únicamente la cadena `042_regional`, `043_auth` o
  `044_login_throttle` y detectar estados parciales entre Alembic y tablas.
- Exigir que `regional_lotes` conserve la huella 042 revisada antes de escribir.
- Crear `usuarios`, `usuario_paises`, `sesiones_app` y `login_intentos` en una
  sola transacción mediante las revisiones Alembic publicadas.
- Verificar columnas, revisión final y conteos; la aplicación inicial no inserta
  cuentas, sesiones, asignaciones ni intentos.
- Exigir un respaldo custom cuya huella SHA-256 coincida exactamente con la
  evidencia revisada para aplicar o revertir.
- Rechazar rollback con datos salvo autorización explícita de pérdida.
- Mantener fuera `WEBSCRAPING_CAMAS_DEV`, PROD, Docker y rutas operativas.

## Fuera de alcance

- Crear el primer administrador o cualquier contraseña de aplicación.
- Montar `auth_routes` en FastAPI o exponer login.
- Configurar proxy HTTPS, HMAC del limitador o limpieza programada.
- Cambiar lectores heredados o activar la interfaz Nuxt.

## Archivos

- `backend/catalog_api/db/auth_schema_migration.py`
- `backend/tests/test_auth_schema_migration.py`
- `specs/SPEC-047-migracion-esquema-autenticacion-dev.md`
- `specs/README.md`

## Criterios de aceptación

1. El flujo efímero aplica 042→044, verifica idempotencia y revierte a 042.
2. Un destino distinto se rechaza antes de DDL o bloqueos.
3. Un estado parcial y un rollback con datos se rechazan.
4. Una huella regional o de respaldo distinta se rechaza antes de crear tablas.
5. La suite Python completa permanece aprobada.
6. El comando se publica por Windows→GitHub→Ubuntu antes de ejecutarlo en DEV.
7. Tras ejecutar en PostgreSQL DEV, se registran revisión, tablas y filas; la
   SPEC permanece en progreso hasta esa evidencia.
