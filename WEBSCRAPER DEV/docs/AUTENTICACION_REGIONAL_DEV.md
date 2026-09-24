# SPEC-045 — autenticación regional (preparación local DEV)

## Estado

Servicio de identidad, sesiones y router completados para pruebas aisladas.
SPEC-045 cierra este contrato local, pero no la integración operativa. No se montó el router en `catalog_api.main`, no se creó
ninguna cuenta y no se aplicó Alembic 043. Sin activación en Ubuntu o PROD.

## Componentes preparados

- `auth_models.py`: `catalogo.usuarios`, `catalogo.usuario_paises` y
  `catalogo.sesiones_app`; claves foráneas a `catalogo.paises` de SPEC-037.
- `auth.py`: alta interna, normalización de identidad, contraseñas Argon2id,
  login, rehash, tokens opacos, lectura vigente por petición y revocación.
- `auth_routes.py`: router inyectable HTTPS con `/auth/login`, `/auth/me` y
  `/auth/logout`; exige Origin permitido, cookie Secure y protección CSRF.
- `migrations/versions/043_auth.py`: revisión con guardas de upgrade/downgrade,
  dependiente de `042_regional`. Sólo crea/elimina las tres tablas de identidad.

No incluye endpoint público de alta, bootstrap de administrador, cambio de
contraseña, auditoría de acceso ni limitación de intentos. No debe exponerse
hasta resolverlos y cerrar rutas heredadas sin autorización regional.

## Comprobación local

La suite de autenticación usa SQLite `:memory:` y datos sintéticos. No requiere
variables de entorno ni conecta a PostgreSQL. Prueba Argon2id, cookies y CSRF,
origen, expiración, revocación, roles/países frescos, país deshabilitado, errores
genéricos y ausencia de montaje en la aplicación actual.

Resultado SPEC-045 2026-09-23: 96 pruebas Node y 251 pruebas Python aprobadas. Dos avisos
de deprecación de Starlette/httpx y AnyIO. Veinte casos cubren servicio y guardas
de 043; la prueba de revisión ejecuta sus funciones con `Table.create/drop`
contra SQLite efímera, no valida conexión ni ejecución Alembic/PostgreSQL.

SPEC-046, 2026-09-24: 96 Node y 259 Python aprobadas; 1 prueba PostgreSQL
omitida porque no hay motor local; 8 casos nuevos de throttle y migration
añadidos. Sigue pendiente verificar bloqueo transaccional bajo
concurrencia PostgreSQL; las pruebas SQLite no cubren ese comportamiento.
Se añadió `backend/tests/test_auth_throttle_postgres.py`, opt-in mediante
`SPEC046_POSTGRES_TEST_URL` a una base vacía `spec046_scratch_*`; la prueba crea
y elimina únicamente `catalogo.login_intentos` allí. No se ejecutó: en Windows
no hay PostgreSQL local, Docker Desktop está sin motor y WSL devuelve acceso
denegado. No se conectó al NAS ni a las bases existentes.

```powershell
cd "C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV"
npm test
cd backend
.venv\Scripts\python.exe -m pytest tests -q
```

La dependencia `argon2-cffi==25.1.0` está fijada en `backend/requirements.txt`.
La instalación local sólo altera la virtualenv ignorada por Git.

## Límites y orden

043 requiere que 042 exista en el historial de Alembic. Aunque los objetos de
auth son aditivos, esta revisión no se ejecutará hasta contar con confirmación
explícita para la base DEV original, backup verificado, ventana sin escritores y
el plan de migración coordinado. Una futura migración agregaría las tres tablas
y avanzaría `alembic_version`; downgrade elimina todas sus filas y requiere
autorización y backup.

Antes de activar autenticación real, completar bootstrap administrativo
auditado, control de intentos compartido por workers, política/origen del proxy,
HTTPS, lectores regionales, protección de recursos y cierre de rutas/puertos
heredados. SPEC-045 no declara listo el login ni modifica datos PostgreSQL.

## SPEC-046 — límite de intentos

El router exige un servicio compartido para contar intentos de login y responde
503 si ese servicio no está disponible. La revisión 044 prepara
`catalogo.login_intentos` y depende de 043; ninguna revisión se ha ejecutado.
Los contadores sólo persisten HMAC de la identidad/IP. Umbrales provisionales:
8 intentos por usuario y 30 por IP en 15 minutos; el siguiente se bloquea
durante 15 minutos. Cada intento se reserva antes de Argon2; un login correcto
limpia sólo el contador de cuenta y conserva el contador de IP compartido. Se ignora
`X-Forwarded-For`; `request.client.host` será la IP del proxy si hay reverse
proxy, así que hace falta un resolvedor confiable antes del uso público.

La limpieza `prune_expired` borra hasta 1000 filas por llamada y retiene un día;
antes de exponer se debe programar una tarea horaria que procese lotes acotados.
La clave HMAC requiere al menos 32 bytes, igual valor en todos los workers y una
rotación diseñada: al cambiarla dejan de localizarse los contadores previos.
Pruebas SQLite no validan
concurrencia ni operación PostgreSQL.
