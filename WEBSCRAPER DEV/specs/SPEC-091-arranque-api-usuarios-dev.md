# SPEC-091: Arranque separado API de usuarios DEV

Estado: Preparación local, sin arranque Ubuntu ni integración Node.

auth_runtime exige destino webscraper_dev/webscraper_user y revisión 047 antes
de arrancar auth_app. Contraseña por prompt; no escribe .env, tablas ni cuentas.
--check-only valida estado en transacción readonly, sin HMAC ni dominio.
Arranque sólo 127.0.0.1:8041, requiere origen HTTPS canónico y archivo HMAC
privado existente, sin crearlo. Proxies no aportan identidad/IP automáticamente.
Los logs de acceso están desactivados; secretos no aparecen en diagnósticos.
Dominio, confianza del proxy, limpieza de sesiones/intentos, guardia Node y
servicio persistente con inyección segura de secretos siguen pendientes.
No utilizar este comando interactivo como servicio PM2.
