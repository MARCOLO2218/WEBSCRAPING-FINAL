# SPEC-096 · Supervisión de autenticación DEV

Estado: En progreso; sin instalación en Ubuntu.

Runtime admite --password-file explícito en vez de prompt. Lee archivo privado
existente sin imprimir contraseña ni cambiar .env; no altera DB ni crea cuentas.
Sin argumento conserva modo interactivo. No seguir enlaces simbólicos.

Plantilla systemd usa LoadCredential para contraseña y HMAC; configuración
no secreta externa para host DB y origen. Backend sólo loopback 8041, reinicio
limitado tras fallos. Usuario instala después de publicar y revisar requisitos.
No copiar secretos DEV/PROD ni modificar servicios existentes.

Pruebas: lectura exacta, permisos, symlink, tamaño y uso del archivo sin prompt.

Validación local: 29 Python aprobadas y 1 prueba POSIX omitida en Windows.
Pendientes: publicación, POSIX Ubuntu, systemd-analyze verify e instalación.
