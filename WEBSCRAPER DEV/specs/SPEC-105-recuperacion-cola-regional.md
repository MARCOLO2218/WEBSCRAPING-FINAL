# SPEC-105: recuperación de cola regional

Estado: Preparado; ensayo PostgreSQL e integración del servicio pendientes.

## Contrato

- Composición explícita, sin cambiar el servidor activo.
- Una conexión PostgreSQL mantiene un advisory lock de sesión por país.
  Si otro servicio ya posee ese lock, no se inicia la cola de ese país.
- Antes de aceptar solicitudes se recuperan las solicitudes manuales encoladas
  con el mismo UUID, autor, tiendas y fecha original. Se revalida permiso al iniciar.
- Las ejecuciones que quedaron ejecutando no se repiten automáticamente:
  si confirmaron resultados se cierra según result_state; de lo contrario
  se marcan interrumpidas. Así un worker antiguo no puede guardar después
  de la recuperación, pues el escritor exige estado ejecutando y bloquea la fila.
- El historial reciente mantiene estado público queued/running/done/error;
  interrumpida, parcial y fallida se muestran como error, con explicación.
- La inicialización es única por instancia y las solicitudes nuevas esperan su
  resultado. Un fallo de recuperación impide aceptar y ejecutar trabajos.
- La pérdida de la conexión propietaria invalida la persistencia de la instancia.
  Se requiere recrear el servicio; no se reconecta y reclama trabajos en silencio.
- Cada transacción de cola comprueba en PostgreSQL el PID y fecha de inicio
  de la conexión propietaria y su lock. Un segundo lock transaccional coordina
  esa comprobación con la recuperación, evitando usar sólo una bandera en memoria.
- Cierre explícito de la cola recuperable: bloquear nuevas operaciones, cerrar
  ejecuciones pendientes de resultado y liberar el lock. Las encoladas se conservan.
- No hay garantía de reintento automático ni de continuar el navegador anterior.
  Los logs de progreso siguen siendo temporales; se recuperan identidad y estado.

## Respuestas HTTP

El POST sigue respondiendo 202 sólo después de guardar la solicitud. Durante
fallo de inicialización/propiedad responde 503, sin aceptar otra solicitud.
GET de estado o trabajo espera recuperación; falla con 503 si no está disponible.
Los permisos GT/NC y la protección de sesión/CSRF no cambian.

## Evidencia previa

Lectura real del ensayo: GT 1923 publicados con complemento Excel; NC 339,
310 con precio. El usuario otorgó permisos de escritura sólo en la base de ensayo.
Esta fase requiere aún verificación de reinicio, exclusión entre instancias,
revocación de acceso y rechazo de un worker antiguo antes de activación.

## Validación local

Compilación TypeScript correcta y revisión de formato del diff. No se ejecutaron
tests ni se conectó el entorno local a la base. El entry point actual no inyecta
esta persistencia recuperable; no se reiniciaron servicios.

## Corrección posterior al primer ensayo

La exclusión de segunda instancia y liberación/reobtención del lock se validaron
en PostgreSQL del NAS sin scrapers. El ensayo posterior de creación/recuperación
falló con `inconsistent types deduced for parameter $2`. La creación reutiliza
el parámetro del usuario en INSERT SELECT y en la autorización. Se fijan casts
text explícitos en ambas posiciones y en las comparaciones de inicio/cierre;
el código de país también declara su tipo. Compilar no verifica el análisis SQL
de PostgreSQL: repetir el ensayo real después de publicar esta corrección y
revisar los registros manuales de prueba que pudieran haber quedado.
