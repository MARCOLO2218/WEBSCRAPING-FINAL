# SPEC-095 · Acciones del catálogo autenticadas

Estado: En progreso, preparación local.

Implementación cliente validada: build y 248 pruebas Node aprobadas,
cinco nuevas con navegador simulado. Publicación y validación visual pendientes.

Cliente común para GT/NC: en entrada HTTPS consulta /auth/me y controla acciones
según país enabled/can_access y rol operador o nivel administrativo. No permite
elegir identidad ni guarda credenciales. Cada escritura relee sesión y adjunta
CSRF de cookie; sesión vencida limpia permisos. El servidor sigue siendo la
autoridad, incluso si el usuario muestra botones manualmente.

En HTTP legacy conserva comportamiento existente durante preparación; no se
considera acceso protegido y debe cerrarse al activar HTTPS. No rediseñar GT.
No modificar BD/PROD/configuración. Pruebas con navegador simulado sin red.
