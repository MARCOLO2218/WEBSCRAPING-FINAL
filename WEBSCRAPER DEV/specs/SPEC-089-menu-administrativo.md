# SPEC-089: Menú hamburguesa y consulta administrativa

Estado: Implementación local; integración de sesión y publicación pendientes.

Portal y NC comparten menú desplegable accesible. Países disponible; administrar
usuarios aparece sólo para sesiones admin/superadmin obtenidas de /auth/me.
Ambos niveles consultan datos de países habilitados según permisos del servidor.
Usuarios conservan múltiples asignaciones; no se infiere autoridad del navegador.
NC recarga el snapshot sin caché al volver a la pestaña, sin iniciar scraping.
No activar autenticación ni PostgreSQL con este cambio. Los controles de UI
no sustituyen la guardia pendiente de conectar en Node.

Validación local: TypeScript y 235 pruebas Node aprobadas. También se corrige
el HTML NC para aplicar realmente nc-main/nc-panel/run-options/nc-filters,
que no había quedado conectado al CSS en la publicación anterior.
Admin no adquiere controles de bloqueo/niveles del superadmin por tener menú.
Sesión real sigue pendiente de integración; sin /auth/me no aparece administrar.
