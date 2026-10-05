# SPEC-094 · Composición HTTPS DEV

Estado: En progreso; no activado.

Publicación preparada mediante manifiesto de 35 archivos y script del usuario.
Portada HTTPS dedicada portal-facenco.html; index legacy no se publica ahora.
Suite Node 249 aprobadas. No instalación de servicios ni generación de secretos.

Validación local: build TypeScript y 243 pruebas Node aprobadas; 22 Python auth
aprobadas. Cuatro pruebas del handler cubren Host, Origin, cookie Secure,
sobrescritura de IP y denegación por sesión ausente/backend caído.

Entrada independiente catalog-secure-server.ts con certificados existentes y
origen HTTPS explícitos. Sirve portal/catálogos con guardia por petición y
proxy auth a 127.0.0.1:8041. No cambia el arranque legacy automáticamente.
No genera secretos, no modifica .env ni esquema. Puerto sugerido 8443.

Host y Origin deben coincidir con el origen configurado. Proxy sobrescribe
IP cliente con dirección del socket; no confía en Forwarded del navegador.
Runtime Python sólo confía en proxy loopback con opción explícita de arranque.
Límite de cuerpo auth 50 KB, timeout, sin redirecciones ni cabeceras arbitrarias.

Antes de activación: cert confiable, secreto HMAC privado, habilitación NC en
la copia revisada por separado, comprobar UI/CSRF y cerrar listener legacy DEV
3030. No afirmar login obligatorio mientras 3030 siga sirviendo sin guardia.
PROD permanece fuera de alcance.
