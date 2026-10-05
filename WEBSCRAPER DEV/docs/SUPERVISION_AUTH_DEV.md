# Supervisión del backend de acceso DEV

Preparación local SPEC-096. No instalada ni validada con systemd Ubuntu todavía.

## Archivos preparados

- deploy/ubuntu/facenco-auth-dev.service: backend loopback 8041, inicio al boot
  cuando el operador habilite servicio, reinicio limitado tras fallo.
- deploy/ubuntu/auth-runtime.env.example: host DB y origen HTTPS, sin secretos.
- auth_runtime --password-file: lectura exacta de credencial existente sin prompt.

## Configuración privada en el servidor

Ubicación prevista: /home/administradorgt/.config/facenco-dev/auth/, modo 0700.
runtime.env contiene sólo AUTH_DB_HOST y AUTH_HTTPS_ORIGIN. Verificar IP Docker
actual; el valor de ejemplo no es garantía tras recrear contenedor.
postgres-password contiene contraseña UTF-8 exacta del rol webscraper_user, sin
salto de línea agregado. auth-hmac contiene clave existente de 32–4096 bytes.
Ambos archivos 0600 y fuera de Git; no copiar desde otra aplicación/PROD ni
mostrar su contenido. Proveerlos por entrada interactiva privada revisada,
sin contraseña en comandos, variables de entorno, capturas o logs.

systemd LoadCredential crea copias privadas por servicio; ExecStart sólo recibe
referencias %d. El runtime acepta archivos 0400/0600 y rechaza enlaces simbólicos.
La comprobación Windows no sustituye permisos ACL; esta unidad está para Linux.

## Orden de instalación posterior a publicación

1. Validar suite en Ubuntu, incluida prueba POSIX; comprobar destino con
   --check-only usando la credencial sin iniciar servidor ni modificar esquema.
2. Proveer configuración/credenciales del servidor, permisos y certificado TLS.
3. Revisar plantilla con systemd-analyze verify; instalar copia del servicio en
   /etc/systemd/system únicamente mediante operador, sin sobrescribir otra unidad.
4. daemon-reload, habilitar/iniciar facenco-auth-dev y revisar active/listener8041
   y /auth/me sin sesión (debe negar). No habilitar interfaz pública todavía.
5. Preparar entrada HTTPS, probar roles y cerrar listener antiguo en activación.

Comandos definitivos se entregan de dos pasos según resultados reales. Aún no
ejecutar instalación: paquete local pendiente de publicación y certificados.

## Recuperación

Fallo de credencial/revisión detiene arranque, registra diagnóstico sin secreto y
respeta límite de reinicios. Corregir requisito y reset-failed/restart mediante
operador. No ejecutar migración automáticamente. Rotar contraseña/HMAC mediante
proceso separado revisado; reinicio relee archivos, no asegura revocar sesiones
por sí solo. Cambios de IP Docker requieren actualizar configuración no secreta.

No se modifica la base original, PROD, .env ni PM2 durante preparación.
