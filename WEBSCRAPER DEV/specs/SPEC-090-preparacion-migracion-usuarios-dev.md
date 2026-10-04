# SPEC-090: Preparación de usuarios en webscraper_dev

Estado: Preparación local; preflight PostgreSQL pendiente.

Autorización del usuario: usar webscraper_dev y aplicar migraciones pendientes
de cuentas. No autoriza modificar base original, PROD, secretos ni .env.
Migrador auth_schema_migration acepta 047_admin_level_event como destino y
conserva restricciones webscraper_dev/webscraper_user, respaldo custom y SHA,
huella regional, bloqueo transaccional y validación de esquema.
047 conserva triggers append-only en pruebas SQLite y rechaza downgrade con
eventos de nivel. PostgreSQL pendiente de verificar, no conexión ejecutada.

Orden: plan sólo lectura, respaldo pg_dump de webscraper_dev e inspección
pg_restore --list, huella, publicación del lote revisado, aplicación por usuario
sin servicio auth activo, verify, composición HTTPS al disponer de dominio.
No reemplazar portada operativa antes de cerrar protección de rutas Node.
