# SPEC-102: Autor autenticado y registro persistente de solicitudes

Estado: En progreso; preparación local, no activada en el portal.

## Objetivo y alcance

Registrar usuario real de solicitudes manuales GT/NC y preparar autenticación
sobre administracion en la base separada por esquemas. Sólo DEV; sin cambios
de conexión, .env, procesos, datos originales o PROD desde esta preparación.

SPEC-101 aplicada por usuario en catalogocomercial_ensayo_101: 189328 filas de
legado intactas, 181160 GT, 339 NC, cinco usuarios, doce permisos; 254 ejecuciones
GT históricas y cinco importaciones NC sin autor. No atribuirles usuario ahora.

## Componentes preparados

- auth-provider valida user_id recibido de /auth/me. access-guard conserva la
  identidad en WeakMap por IncomingMessage sólo tras permisos/CSRF satisfactorios;
  la limpia al validar de nuevo. No lee user_id del body ni de headers públicos.
- La cola admite ExecutionPersistence inyectada. Sin ella conserva el modo
  operativo anterior; el arranque actual no la inyecta ni cambia su conexión.
- Una cola persistente rechaza enqueue sin actor. enqueueAuthenticated exige
  usuario, crea UUID y confirma PostgreSQL antes de aceptar/ejecutar. Persiste
  selección y revalida usuario habilitado, país habilitado y permiso de operador
  o nivel admin/superadmin al registrar y al empezar el trabajo.
- Guardar autor y país por job, no en variables globales. Transferir al worker
  por entorno de proceso propio con CATALOG_EXECUTION_ID/USER_ID/COUNTRY;
  limpiar esos campos heredados si el proceso no recibe contexto.
- País se fija al componer el repositorio (GT/NC), nunca desde el navegador.
- NC limita cinco trabajos incluyendo reservas pendientes durante INSERT async.
- Registrar estado al iniciar y cerrar. Si falla cierre DB, no informar éxito.
  Un proceso que devuelve exit 0 no prueba persistencia: exigir marcador
  source_payload.result_committed=true escrito atómicamente por el futuro worker
  con sus productos/publicaciones. Sin marcador el registro se cierra fallido.
- finish conserva autor; un fallo antes de arrancar no inventa fecha de inicio.
  Selección/ID/estado/origen se guardan; no persistir stderr ni credenciales en
  source_payload. Las vistas de cubos ya enlazan usuario_id con usuarios.
- Repositorio rechaza toda DB distinta de webscraper_dev o
  catalogocomercial_ensayo_101 y exige las dos fases 101. No crea tablas ni hace
  DDL al aceptar peticiones. El rol y los grants deben prepararse explícitamente.

## Autenticación regional aislada

backend/catalog_api/auth_regional_runtime.py admite sólo bases DEV migradas,
rol webscraper_user y metadatos de administracion consistentes. Usa
schema_translate_map catalogo -> administracion para AuthRepository, países,
permisos, sesiones, limitador y auditoría. No duplica usuarios ni cambia modelos
globales del runtime antiguo. --check-only lee y reporta conteos sin escribir.
Arranque sólo loopback, puerto 8042 por defecto, rechaza 8041 ocupado por auth
actual; origen HTTPS y HMAC explícitos, credenciales con lector privado existente.
No instalar/reiniciar servicios ni reutilizar cookies en navegador actual hasta
definir origen aislado: cookies por host no se aíslan únicamente con otro puerto.

## Fuera de esta entrega y siguientes pasos obligatorios

- Falta implementar/activar escritor regional de workers GT/NC y publicación
  transaccional con marcador de resultado ligado a ejecución/actor.
- Falta conectar consultas del portal a los nuevos schemas y auth al nuevo
  runtime, con configuración separada y proveedor de sesión correspondiente.
- Falta preflight/grants, lease de consumidor, reconciliación tras reinicio y
  revalidación de trabajos pendientes. La tabla conserva solicitudes, pero esta
  primera composición todavía no recupera ni reejecuta automáticamente la cola.
- No inyectar ExecutionPersistence sobre workers legacy todavía: escribirían
  fuera del contrato y no podrían confirmar un resultado regional correcto.
- Programados/cuentas de servicio: política y aprovisionamiento explícitos;
  esta cola implementa sólo origen manual autenticado.

## Criterios de aceptación de integración

Dos usuarios simultáneos conservan su propia atribución en GT/NC; body/header
falsificados no cambian autor; sin sesión/CSRF/grant no se inicia el worker.
Fallos de persistencia no aceptan ni publican éxito. Un usuario revocado antes
del inicio no ejecuta el trabajo. Productos/publicación/resultado se confirman
en una transacción. Reinicio no pierde atribución ni duplica solicitudes.
Auth regional relee permisos de administracion y no toca catalogo. Validar
aislamiento por país y reporting por usuario, manteniendo histórico sin autor.

## Validación de preparación

Compilación TypeScript y sintaxis Python locales. No se añadieron ni ejecutaron
tests ni conexiones DB. Pruebas funcionales/ensayo PostgreSQL y activación siguen
pendientes; preparar no significa que el portal ya persista el autor.
