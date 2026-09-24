# SPEC-045 — Sesiones revocables y API de autenticación

Estado: Completada para el contrato local aislado; integración operativa pendiente
Fecha: 2026-09-23
Depende de SPEC-034 y SPEC-044; reutiliza `catalogo.paises` de SPEC-037.

## Objetivo

Preparar persistencia de usuario, asignación usuario-país y sesión de servidor;
hash de contraseña Argon2id y rutas FastAPI de login, estado de sesión y logout.
Una sesión conserva sólo el resumen criptográfico del token y el hash CSRF; cada
petición relee usuario/estado/asignaciones del repositorio y conecta con la
política SPEC-044.

## Límite de activación

La fábrica/rutas se prueban en SQLite aislado y requieren un repositorio inyectado.
No se conectan a `catalog_api.main`, al catálogo heredado o a PostgreSQL. La
migración Alembic se prepara con guardas explícitas, pero no se ejecuta en esta
SPEC ni en Ubuntu. No se crean usuarios reales, contraseñas, bootstrap admin,
endpoint de alta/gestión de usuarios ni frontend.

No activar con usuarios hasta completar control de intentos distribuido, HTTPS,
configuración de orígenes del proxy, administración segura/rotación de cuentas,
CSRF validado, cierre de rutas heredadas y revisiones de infraestructura. El
login local no es todavía un sistema listo para exposición.

## Contrato

- Usuario normalizado y único; cuenta deshabilitada y credenciales incorrectas
  producen el mismo 401. Nunca se devuelve si el usuario existe.
- Contraseña mínima de 12 caracteres Unicode y máximo 1024 bytes. Guardar
  únicamente Argon2id con sal aleatoria; verificar el hash ficticio para un
  usuario inexistente y rehashear al iniciar sesión si los parámetros cambiaron.
- Token de sesión de 256 bits en cookie host-only `catalog_session`, HttpOnly,
  Secure, SameSite=Lax, Path=/, con expiración finita. El valor sin procesar no
  se almacena ni aparece en JSON/logs. Persistir SHA-256 del token aleatorio.
- CSRF aleatorio por sesión; guardar sólo SHA-256, devolver el valor una vez en
  la respuesta de login y exigirlo en `X-CSRF-Token` para logout. Login exige
  Origin exacto de una lista inyectada; lista ausente rechaza la solicitud.
- Logout valida CSRF y revoca la sesión actual en la misma escritura. Una nueva
  lectura de SPEC-044 rechaza token desconocido/revocado/vencido o usuario inactivo.
- `AccessProvider.read_access` consulta sesión, usuario, roles y `catalogo.paises`
  en transacción coherente, sin confiar en permisos o país provenientes del token.
  Ninguna asignación se crea automáticamente por habilitar un país.
- Código no administrable por el usuario: sólo los roles `lector` y `operador`
  son aceptados por la política. El alta inicial y administración se dejan fuera.
- Cookie siempre Secure en el router preparado. El proxy público necesitará HTTPS.

## Persistencia preparada

Agregar `catalogo.usuarios`, `catalogo.usuario_paises` y `catalogo.sesiones_app`.
La migración 043 depende de 042 y debe ejecutarse sólo mediante el mecanismo
controlado con flags `auth_schema_migration` o `auth_schema_rollback`. No altera
productos, ejecuciones, tiendas, publicaciones, snapshots ni el baseline.
Downgrade borra cuentas, asignaciones y sesiones; es irreversible para esos datos.

No se proporciona comando de ejecución hasta acordar ventana, backup y orden
respecto de 042/backfill sobre la base DEV original.

## Pruebas de aceptación

Ejecutar tests SQLite/in-memory: hash Argon2id y rehash, alta duplicada, bloqueo
de username no válido, cuenta inactiva, error genérico para usuario desconocido,
token/CSRF aleatorios con sólo hashes almacenados, flags de cookie, origin,
expiración, logout/revocación, roles/paises frescos en la petición siguiente,
revocación de país/cuenta, país futuro sin asignación, rollback de transacción y
no montaje en la API heredada. Red y PostgreSQL deshabilitados.

## Resultado local

Implementados `backend/catalog_api/auth.py`, `auth_models.py`, `auth_routes.py`,
`backend/migrations/versions/043_auth.py` y sus dos suites de prueba; `env.py`
permite sólo los flags de esquema previstos. Documentación: `docs/AUTENTICACION_REGIONAL_DEV.md`,
decisión ADR-015.

Verificación 2026-09-23: 96 pruebas Node y 251 pruebas Python aprobadas; dos
avisos de deprecación existentes en Starlette/httpx y AnyIO. Las 21 pruebas
nuevas de autenticación y revisión 043 usan SQLite temporal y datos sintéticos.
La revisión se prueba invocando sus funciones con SQLite; no se ejecuta Alembic
ni se valida PostgreSQL. No se conectó a ninguna base. SPEC-045 queda completada
sólo para esta preparación aislada: login no montado ni listo para exponer.

## Siguiente paso

Una SPEC posterior debe completar bootstrap seguro de administrador, control de
intentos compartido por workers y pruebas de CSRF/proxy. Luego implementar
lectores aislados por país antes de montar autenticación en la app. No ejecutar
043 ni cualquier otra migración en PostgreSQL DEV sin confirmación explícita.
