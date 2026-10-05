# SPEC-097 · Credenciales systemd 0440

Estado: Corrección local; validación Ubuntu pendiente.

Evidencia Ubuntu: LoadCredential entrega postgres-password y auth-hmac en modo
0440; lector preparatorio rechaza por regla de archivos normales. Servicio no
arranca y queda detenido tras diagnóstico. No es fallo de contraseña ni DB.

Permitir 0440 sólo para archivo del CREDENTIALS_DIRECTORY bajo /run/credentials,
sin enlaces simbólicos, sin permisos de escritura de grupo/otros ni acceso de
otros al directorio, propietario root/usuario del proceso. Archivos externos
mantienen regla privada anterior. Nunca aceptar 0444 ni directorios compartidos.

Archivos: auth_runtime.py y test_auth_service_credentials.py. Publicar por
usuario; después validar en Ubuntu y reiniciar sólo facenco-auth-dev.
