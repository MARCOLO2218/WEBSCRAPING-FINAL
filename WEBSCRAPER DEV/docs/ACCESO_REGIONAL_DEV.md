# Acceso regional — frontera de SPEC-044

Fecha: 2026-09-23. SPEC-044 completada localmente bajo SPEC-034.
Validación: 96 pruebas Node y 230 Python aprobadas, incluidas 93 nuevas de acceso.
La suite Python conserva dos avisos de dependencias (httpx y BlockingPortal).

## Qué está implementado

`backend/catalog_api/access/policy.py` valida el estado de sesión/usuario, país
explícito, habilitación, asignación, acción y pertenencia del recurso. El catálogo
de países lo recibe del servidor: no replica una lista fija ni asigna GT al faltar
un país. Las acciones permitidas por rol están enumeradas explícitamente.

| Rol | Consultar/exportar país asignado | Cargar precios/ejecutar scraper de ese país | Administrar usuarios/asignaciones |
|---|---|---|---|
| lector | Sí | No | No |
| operador | Sí | Sí | No |
| administrador global sin rol de país | No | No | Sí |

El administrador puede tener además un rol comercial por país. Cambiar la
asignación requiere autorización administrativa en el incremento futuro; esta
entrega no crea usuarios, asignaciones ni endpoints administrativos reales.

`dependencies.py` adapta la política a FastAPI. La cookie `catalog_session` es
sólo un token opaco para el futuro proveedor `AccessProvider.read_access`.
Cabeceras/query/body no definen identidad, rol ni países autorizados.
`require_country(Action.READ)` exige un parámetro de ruta llamado `country_code`;
la lista de países se obtiene con `authorized_countries`, y la administración se
protege con `require_admin`. No hay país seleccionado persistido en la sesión.

| Situación | Respuesta |
|---|---|
| Sesión ausente, desconocida, revocada, vencida o usuario desactivado | 401 |
| País ausente o mal formado | 400, después de comprobar la sesión |
| País desconocido, inhabilitado, no asignado o acción no permitida | 403 |
| Proveedor ausente o falla al leer | 503 genérico |
| Recurso de otro país, sin país, producto en revision/no_producto | 403 |

El contexto resultante es inmutable y lleva usuario, país, moneda y rol del país.
`require_resource_country` compara país obtenido por el servidor. Para productos
de catálogo, usar `require_catalog_product`, que además exige `asignado`.
Ninguna de estas comprobaciones sustituye filtrar consultas SQL por país o
comprobar publicación/tienda. Un run histórico mixto no puede autorizarse sólo
por `run_id`; se debe consultar el par ejecución/país y sus recursos.

## Integración que aún falta

El módulo no se importa en `main.py`. No hay login, cookie emitida, roles
persistidos, nuevos endpoints operativos ni frontend Nuxt. No protege por sí solo
el catálogo vigente. No hay cambios en PostgreSQL, Alembic, .env, Docker o PROD.

Antes de montarlo:

1. Implementar usuarios, contraseñas, asignaciones y sesiones revocables. El
   proveedor debe validar el token y leer usuario/sesión/permisos/países de forma
   coherente por petición. No conservar permisos en cookie ni en caché entre
   peticiones. No registrar el token, contraseña o DSN en logs/respuestas.
2. Preparar emisión/rotación, expiración y logout; cookie HttpOnly/Secure/SameSite,
   CSRF en escrituras, límites de intentos y recuperación administrativa. Las
   pruebas HTTP de esta SPEC simulan identidad; no verifican autenticación real.
3. Implementar lectores regionales sin DDL con contexto obligatorio, filtros SQL
   por país y validación de recursos por ID. No llamar al lector legado como
   supuesto ensayo readonly: `catalog.py` puede crear/sembrar snapshots en un GET.
   La expansión 042 es una proyección ensayada, no un catálogo sincronizado activo.
4. Validar pruebas de permisos con el adaptador real en entorno aislado. Cambios
   de rol, usuario, sesión o habilitación deben afectar la siguiente petición.
5. Preparar Nuxt, login y elección de país. Cerrar el acceso directo a rutas Node,
   CSV, imágenes privadas, cargas y trabajos; validar HTTPS/proxy antes de habilitar
   el flujo con usuarios reales. La elección se exige incluso con un único país.

La migración de la base original sigue requiriendo plan fresco y confirmación
expresa. Esta SPEC no crea ni ejecuta migraciones, backfill o conexiones a DB.

## Pruebas y reproducción

`test_access_policy.py` prueba la matriz de permisos, países futuros, datos
duplicados, moneda inválida, sesiones vencidas/revocadas, admin sin bypass y
recursos sin clasificación segura. `test_access_dependencies.py` monta una API
de prueba en memoria: dos usuarios, dos países por petición, cambio de permisos,
cookie desconocida, identidad falsificada, proveedor fallido y denegación antes
de consultar el contenido del catálogo. Cada petición relee el proveedor; FastAPI
comparte la misma lectura únicamente entre dependencias de esa petición.

Desde Windows PowerShell:

```powershell
cd "C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV"
npm test
if ($LASTEXITCODE -ne 0) { throw "Fallaron pruebas Node." }
Push-Location backend
try {
    .\.venv\Scripts\python.exe -m pytest tests -q
    if ($LASTEXITCODE -ne 0) { throw "Fallaron pruebas Python." }
} finally {
    Pop-Location
}
```

Las pruebas emplean memoria/fixtures y SQLite temporal, sin el PostgreSQL
existente. No levantar la API real ni ejecutar herramientas de migración para
reproducir este incremento. El orden Node→Python conserva la prueba de paridad CSV.

## Fuentes del diseño

- [OWASP: autorización, denegación por defecto y comprobación en cada petición](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
- [FastAPI: dependencias compartidas sólo durante la petición](https://fastapi.tiangolo.com/tutorial/dependencies/sub-dependencies/).
- SPEC-034 define el flujo; SPEC-037 aporta catalogo.paises; SPEC-038/042/043
  definen conservación histórica y clasificación sin asignar GT por defecto.
