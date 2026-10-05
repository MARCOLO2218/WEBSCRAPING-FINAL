# SPEC-093 · Proveedor de acceso Node

Estado: Implementación aislada validada; integración operativa pendiente.

Conectar la guardia preparada con el backend mediante lecturas de sesión por
petición y comprobación CSRF contra la sesión vigente. El transporte interno
acepta únicamente loopback explícito, no redirecciones y timeout de cinco segundos.
No confiar en identidad enviada por el navegador ni cachear permisos.

El endpoint POST /auth/check-write comprueba Origin, cookies y CSRF en DB;
no modifica sesiones, cuentas ni catálogo. No autoriza un país: esa decisión
corresponde a la guardia sobre /auth/me.

No montar todavía en catalog-server.ts. HTTPS, proxy, cierre de accesos directos
y revisión de frontend deben completarse juntos antes de activar.

Criterios: sesión ausente devuelve null; fallo/malformación niega acceso;
se reenvían únicamente Cookie, Origin y X-CSRF-Token; escritura sin protección
se rechaza. Pruebas locales sin conexión PostgreSQL ni sitios externos.

Archivos: src/server/auth-provider.ts, src/specs/auth-provider.test.ts,
backend/catalog_api/auth_routes.py, backend/tests/test_auth_check_write.py.
Validación 2026-10-04: TypeScript compilado; 8 pruebas Node y 22 Python
aprobadas (incluye guardia, administración y runtime). No desplegado.
