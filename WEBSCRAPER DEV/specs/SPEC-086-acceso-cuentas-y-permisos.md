# SPEC-086: Acceso según cuentas y países

Estado: En progreso. Frontend preparado; integración y autorización servidor pendientes.

No se permite elegir rol al ingresar. Login consulta /auth/login y /auth/me.
Las tarjetas aparecen para todos los países; enlace disponible sólo cuando
can_access y enabled son verdaderos. Una cuenta usuario admite múltiples
asignaciones de país. Retorno al portal recupera sesión del servidor.

Política solicitada: superadmin controla todas las cuentas, bloqueos y resets;
admin entra a países habilitados y gestiona contraseñas, roles y asignaciones
de usuarios subordinados; usuario accede a sus países. Admin no puede elevarse
a superadmin ni controlar superadmins. Definir y probar cambios de nivel y
password de usuarios; política actual reserva resets al superadmin.

Actualización local: reset de contraseña permitido al admin sólo sobre cuentas
usuario; validación transaccional del actor en AuthRepository y revocación de
sesiones. UI muestra el botón según jerarquía; API conserva CSRF/origen.
Superadmin sigue habilitado para resets administrativos; bloqueos sin cambios.
14 pruebas de rutas administrativas aprobadas (SQLite temporal).

Cambio de nivel local: sólo superadmin convierte usuario/admin; no permite
alterar superadmins ni autoeditarse. Cambia global_admin, conserva asignaciones
por país, revoca sesiones y registra nivel_cambiado de forma transaccional.
Admin sigue editando roles lector/operador y países de usuarios subordinados.
Nueva migración 047_admin_level_event preparada con guarda y downgrade que
rechaza perder eventos; no aplicada ni validada en PostgreSQL.
create_auth_app compone login, sesión, logout y administración con repositorio,
throttle y orígenes HTTPS explícitos; no conecta ni monta main.py.
Validación local: 317 Python aprobadas, una opcional omitida; 229 Node aprobadas.

Guardia Node preparada por inyección: HTML, JSON NC, CSV GT, consultas,
ejecuciones y administración comprueban sesión y país por petición; escrituras
requieren validador CSRF/origen del proveedor. Lector no ejecuta scrapers.
No está activada en catalog-server: falta proveedor real y composición HTTPS.
No representa protección ya desplegada. Pendiente confirmar destino DB autorizado
y URL HTTPS DEV; consulta enviada al usuario, sin tocar configuración ni datos.

Pendientes obligatorios: montar API con HTTPS y repositorio autorizado,
migraciones de niveles/auditoría existentes, proteger archivos y rutas NC/GT
en servidor. Ocultar enlaces no sustituye autorización. No activar cambios
PostgreSQL/configuración con esta preparación. Vista 3040 es sólo estática.
