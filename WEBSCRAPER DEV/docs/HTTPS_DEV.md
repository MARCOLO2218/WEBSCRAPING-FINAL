# HTTPS y acceso real DEV

## Estado 2026-10-04

Ubuntu recibió be822af: 132 pruebas Python aprobadas; check-only confirmó copia
webscraper_dev y revisión 047 sin escritura. La entrada actual sigue siendo HTTP
3030. SPEC-093/094 están preparadas localmente, no publicadas ni activadas.

## Composición preparada

El servidor HTTPS sirve portal-facenco.html como `/`; no publicar index.html
en este paquete, para conservar la entrada HTTP vigente hasta activación.
Manifiesto exacto: deploy/auth-release-files.json, 35 archivos.
scripts/prepare-auth-release.ps1 sólo prepara/revisa ese paquete al ejecutarlo
el usuario; no hace commit, push, pull ni instalación.
Suite Node vigente: 249 aprobadas, incluida portada HTTPS independiente.

Navegador HTTPS 8443 → catalog-secure-server → backend 127.0.0.1:8041.
La entrada Node sirve archivos/API con guardia y reenvía /auth a FastAPI.
No necesita instalar Nginx/Caddy para este piloto. Exige Host canónico y Origin
correcto, sobrescribe cabeceras de proxy y no publica /auth/check-write.
Uvicorn debe iniciarse con --trusted-local-proxy, sólo confía en 127.0.0.1.
El listener 8041 continúa ligado a loopback.

## Antes de activar

1. Publicar paquete completo y validar Ubuntu, incluida portada/panel real.
2. Proveer certificado TLS para IP 172.16.247.6 (SAN IP), clave privada protegida
   y cadena confiable instalada en cada equipo/teléfono. Dominio final pendiente.
   No compartir claves privadas ni añadirlas al repositorio.
3. Proveer archivo HMAC privado existente y acceso DB para supervisor de proceso;
   SPEC-096 prepara --password-file y systemd LoadCredential (sin instalación).
   Ver SUPERVISION_AUTH_DEV.md. No guardar credenciales en argumentos ni PM2.
4. Revisar países habilitados en copia: habilitación NC no confirmada en DB.
   La existencia del snapshot NC no implica permiso enabled en /auth/me.
5. Completar CSRF en acciones del frontend GT/NC y validar niveles por navegador.
6. Activar entrada protegida; cerrar listener HTTP DEV 3030 en la misma ventana
   de cambio. No apagar PROD ni mover configuración original automáticamente.
7. Actualizar acceso directo a URL HTTPS validada y comprobar PC/tablet/teléfono.

La entrada nueva exige --origin, --cert y --key, con --port 8443. Arrancar desde
directorio DEV, después de build. Es código preparatorio, no orden de despliegue.
No anunciar login obligatorio mientras el listener antiguo permita acceso.

## Validación local

TypeScript compilado; suite Node 243/243; subconjunto Python auth 22/22.
Corepack falló por permisos de caché; Node ejecutado con binarios instalados.
No certificado creado, proceso Ubuntu iniciado ni configuración modificada.
