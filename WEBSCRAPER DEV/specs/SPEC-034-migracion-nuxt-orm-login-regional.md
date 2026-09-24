# SPEC-034: Nuxt, ORM y login regional

Estado: En progreso por incrementos
Fecha: 2026-09-10
Actualización: 2026-09-23. ORM, baseline y países implementados en SPEC-035/036/037;
expansión/backfill ensayados y revertidos en copia en SPEC-042/043. SPEC-044 prepara
la política de acceso por país. SPEC-045 completó localmente el servicio Argon2id,
sesiones revocables, asignaciones y rutas aisladas. SPEC-046 implementa el límite
compartido local; falta validar concurrencia PostgreSQL y bootstrap seguro,
lectores regionales y migración de autenticación. Nuxt sigue pendiente.

## Objetivo

Migrar el mismo proyecto a Nuxt + FastAPI por capas + SQLAlchemy/Alembic,
conservando PostgreSQL, historial y workers TypeScript/Playwright. Sin SAP.
Acceso obligatorio con usuario y contraseña y elección explícita del país.

## Países y permisos

Iniciales: GT/GTQ, HN/HNL, SV/USD, NC/NIO. NC conserva el código del negocio.
El usuario amplía el alcance: admitir países futuros como Costa Rica. No activar
CR ni crear sus scrapers ahora. Catálogo persistente ampliable sin clonar la base
o aplicación; los unions cerrados de SPEC-032 serán sustituidos en la integración.

Confirmado por el usuario: el administrador asigna uno o varios países a cada
usuario. País nuevo no otorga acceso automáticamente. Sin asignaciones no se
puede consultar el catálogo. El servidor verifica usuario, país, acción y recurso
en cada petición; no confiar en filtros ni middleware de navegación de Nuxt.

Contrato preparatorio de SPEC-044: lector por país (consultar/exportar), operador
por país (además cargas y scrapers) y administrador global (usuarios/asignaciones).
Administrar no concede acceso comercial automático a todos los países; ese
acceso también requiere asignación. Alta inicial y recuperación de cuentas se
definirán en la siguiente spec de autenticación. Ningún rol está aún operativo.

## Flujo obligatorio

Login -> elegir país autorizado -> catálogo. Siempre exigir elección al iniciar
sesión, incluso con un solo país. El último país puede sugerirse, no saltar el
paso. Cambiar país mantiene login, revalida permisos y descarta respuestas tardías.
Filtros se recuerdan por usuario y país; no guardar tokens en localStorage.
País sin tiendas muestra estado vacío, nunca resultados de Guatemala.
Cada petición lleva contexto validado: dos pestañas pueden usar países distintos
sin depender de un país global mutable de la sesión. Logout limpia datos privados.

## Capas y persistencia

frontend/app: páginas, componentes, composables y layouts Nuxt.
backend/catalog_api: rutas y schemas Pydantic, servicios, dominio, repositorios,
db (modelos ORM y sesiones), infraestructura Excel/cola. Alembic en backend/migrations.
Los scrapers actuales permanecen en src/scrapers y su coordinación se migra gradualmente.

SPEC-035/036 ya mapearon scraping_runs, productos_catalogo y
catalog_display_snapshots y establecieron el baseline. SPEC-037 creó
catalogo.paises; reutilizarla, no crear una segunda tabla countries. Sigue pendiente
retirar DDL de lectores/workers al tener sustitutos equivalentes. Alembic es el
responsable futuro del esquema, sin un segundo ORM en Nuxt.

SPEC-038/042/043 sustituyen la propuesta inicial de asignar GT a todo: preservar
los registros, IDs y ejecuciones mixtas mediante relaciones complementarias por
país. Origen pendiente permanece null/revision; no se inventa país por omisión.
La proyección 042 se ensayó en copia y se revirtió; no es aún un lector regional
operativo. Las tablas y servicios de usuarios, asignaciones y sesiones están
preparados en SPEC-045, pero 043 no se aplicó y no hay usuarios persistidos.
Auditoría de accesos sigue pendiente.
Preservar Run ID y política de publicación de tres horas durante la transición.

## Autenticación propuesta

Sesiones revocables de servidor, cookie HttpOnly/Secure/SameSite, HTTPS en Ubuntu
antes de usar credenciales reales, protección CSRF, expiración y rotación al login.
Contraseñas Argon2id, límites de intentos y mensajes genéricos. Desactivar usuario
o revocar país debe afectar peticiones nuevas. Sin credenciales predeterminadas
en Git. Alta/recuperación administradas inicialmente como propuesta.
401 sin sesión y 403 sin permiso; consultas por ID también deben estar aisladas.

Al habilitar login, las rutas Node, CSV históricos, imágenes/datos privados,
cargas y trabajos no pueden quedar disponibles por un puerto o ruta que evada
autorización. El proxy y la API, no solo Nuxt, deben garantizarlo.

## Carga regional

SPEC-033 reemplaza el archivo entero. Antes de habilitar operadores restringidos
por país, cambiar a actualización por país o persistencia transaccional: un usuario
GT no puede borrar/modificar HN/SV/NC. Preview y confirmación verifican permisos.
Reemplazo global, si se conserva, requiere administración explícita.

## Orden de ejecución

1. SPEC-033 y base ORM/países SPEC-035/036/037: completadas según registro.
2. SPEC-038 y ensayo de expansión/backfill SPEC-042/043: completados; migración
   de la base original pendiente de autorización explícita.
3. SPEC-044: política de permisos, contexto por petición y pruebas aisladas.
4. SPEC-045/046 preparan sesiones/login y limitación de intentos con datos
   aislados. Sin ruta montada, bootstrap ni migración ejecutada.
5. Lectores regionales sin DDL, aislados por país y recurso, con paridad verificada.
6. Nuxt: login, elección explícita y catálogo. Cargas/trabajos regionales y
   HTTPS/proxy. Cerrar accesos heredados antes de activar login para usuarios.
7. Validar en Ubuntu DEV cuando corresponda; habilitar tiendas progresivamente.
   Incorporar CR en una etapa futura, nunca sólo por aparecer en el catálogo.

## Aceptación

Sin login no hay datos ni operaciones por UI o API directa. Países no asignados
no se pueden consultar/exportar/modificar cambiando URL, ID, filtros o Excel.
Pruebas con dos usuarios y dos países incluyen trabajos y descargas. Cambios de
país no mezclan datos; revocación y logout invalidan accesos. Nuevo país no exige
clonar app/base ni implica tiendas activas. Datos GT e historial se conservan.
Entrega por specs pequeñas, pruebas y comandos de Windows/Ubuntu para el usuario.

## Referencias

- https://docs.sqlalchemy.org/en/20/tutorial/metadata.html
- https://alembic.sqlalchemy.org/en/latest/autogenerate.html
- https://nuxt.com/docs/4.x/getting-started/data-fetching
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
