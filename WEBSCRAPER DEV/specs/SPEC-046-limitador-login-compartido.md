# SPEC-046 — límite compartido de intentos de login

Estado: En progreso — diseño e implementación aislados en DEV
Fecha: 2026-09-24
Depende de SPEC-045. No depende de aplicar la revisión 043 en la base existente.

## Objetivo

Evitar intentos repetidos y password spraying antes de ejecutar Argon2id. El
límite se comparte entre workers mediante una tabla preparada en PostgreSQL;
no se usa memoria local como control de producción. Integrarlo al router exige
inyectar el repositorio del límite; si falta, la construcción falla cerrada.

## Reglas

- Registrar todos los intentos por nombre de usuario normalizado y por IP de conexión, pero
  guardar sólo HMAC-SHA-256 con secreto privado, nunca el usuario ni IP.
- Ventana provisional de 15 minutos: se permiten 8 intentos por cuenta y 30 por IP;
  el siguiente intento se bloquea por 15 minutos. Aplicar los límites a cuentas
  existentes e inexistentes para no revelar usuarios.
- Reservar cada intento bajo bloqueo transaccional antes de verificar la
  contraseña, para que varios workers no superen el umbral concurrentemente.
  Una petición bloqueada recibe 429 genérico con `Retry-After`; credenciales
  incorrectas conservan el 401 genérico.
- Al login correcto se borra sólo el contador de esa cuenta; se conserva el
  contador compartido de IP para proteger a los demás usuarios de la red. No
  aceptar `X-Forwarded-For` de forma implícita. Una futura configuración de proxy
  debe resolver la IP confiable.
- El almacenamiento debe usar transacciones y bloqueo/upsert atómico en
  PostgreSQL para serializar workers. Backend no soportado o errores de store
  producen 503 genérico; nunca se omite el control.
- El router requiere un proveedor compartido explícito y continúa fuera de
  `catalog_api.main`. No añade tabla a SPEC-045 retroactivamente; la revisión
  `044_login_throttle` es aditiva, depende de `043_auth` y está protegida por
  flags. No ejecutar migraciones en PostgreSQL.

## Fuera de alcance

Bootstrap de administrador, panel/login visual, montaje en FastAPI, proxy,
producción, reinicios, credenciales, escrituras en PostgreSQL existente o
ejecución Alembic real. Una IP de proxy compartida puede hacer más estricto el
límite; confiar en cabeceras reenviadas requiere otra decisión/configuración.

## Requisitos operativos pendientes

- La clave HMAC será un secreto de al menos 32 bytes, suministrado fuera de Git
  y común a todos los workers. La rotación cambia los hashes y deja de reconocer
  los contadores previos; no rotar hasta definir transición y limpieza segura.
- El router usa `request.client.host` y no consume `X-Forwarded-For`. El servicio
  piloto escucha en loopback; antes de colocarlo detrás de un proxy hay que
  definir sus direcciones de confianza y comprobar qué IP entrega Uvicorn.
- `prune_expired` conserva un día y elimina lotes de hasta 1000 filas. Aún no hay
  scheduler; proponer una tarea horaria que repita lotes acotados y registre si
  alcanza su máximo, sin bloquear solicitudes de login.
- Ninguno de estos valores está cableado a `main.py`; el router sigue sin montar.

## Aceptación

Pruebas SQLite temporal: límites separados por cuenta/IP, umbral y expiración,
reset tras éxito, llamada al limitador antes de Argon2id, fail-closed si falta
proveedor/storage, aislamiento entre usuarios, hashes opacos, limpieza en lotes,
guardas de migración y rechazo de direcciones inválidas. Probar
las funciones guardadas de migración sólo contra SQLite temporal.

Registrar archivos, pruebas y limitaciones al cerrar la SPEC. La base real
permanece inalterada; cualquier activación/migración requiere otra autorización.
La prueba de concurrencia PostgreSQL se habilita únicamente con
`SPEC046_POSTGRES_TEST_URL` a una base vacía dedicada `spec046_scratch_*`; crea y
elimina `catalogo.login_intentos` sólo allí. Sin esa variable se omite, y no se
intenta descubrir ni conectar a la base DEV.

## Implementación local y estado

Preparados `backend/catalog_api/auth_throttle.py` y
`auth_throttle_models.py`; `auth_routes.py` ahora exige el proveedor y reserva el
intento antes de Argon2. La revisión `backend/migrations/versions/044_login_throttle.py`
depende de `043_auth`; `backend/migrations/env.py` sólo la admite con flags de
esquema específicos. Pruebas: `test_auth_throttle.py`,
`test_auth_throttle_migration.py` y regresión de `test_auth_service.py`.
Documentación: `docs/AUTENTICACION_REGIONAL_DEV.md`, ADR-016.

Validación 2026-09-24: `npm test` — 96 aprobadas; pytest completo — 259
aprobadas, 1 omitida (integración PostgreSQL) y 2 avisos conocidos (deprecations Starlette/httpx y AnyIO). Ocho
casos nuevos ejercitan contadores, bloqueo, expiración, HMAC, limpieza y guardas
de migración en SQLite efímera. Se añadió `test_auth_throttle_postgres.py`: hace
32 reservas concurrentes y comprueba la serialización, pero requiere una base
PostgreSQL scratch explícita y no se pudo ejecutar en esta máquina: Docker
Desktop no tiene motor iniciado, no hay PostgreSQL local y WSL devolvió acceso
denegado. No se conectó al NAS ni a una base existente. SQLite ignora `FOR
UPDATE`; falta ejecutar el ensayo PostgreSQL aislado antes de cerrar esta SPEC.
La clave HMAC y la limpieza periódica aún requieren integración de despliegue.

Tras aplicar 044 en `webscraper_dev`, se preparó un ensayo operativo adicional
en `backend/catalog_api/db/auth_throttle_probe.py`. Sólo acepta esa copia, el rol
`webscraper_user`, revisión 044, huella regional revisada y las cuatro tablas de
autenticación vacías. Ejecuta 32 reservas simultáneas con identidad/IP sintéticas,
espera 8 permitidas y 24 bloqueadas, comprueba ambos contadores en 9 y elimina
exactamente sus dos hashes bajo una guarda advisory. SPEC-046 permanece en
progreso hasta recibir el resultado PostgreSQL y confirmar el conteo final cero.
