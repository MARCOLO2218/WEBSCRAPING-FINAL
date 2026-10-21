# SPEC-106: servicio regional de ensayo

Estado: Preparado; configuración del NAS y validación con sesión pendientes.

## Contrato

- Entrada nueva catalog-regional-server; no cambia catalog-secure-server ni PM2.
- Sólo catalogocomercial_ensayo_101, rol webscraper_user, credencial privada
  por archivo. No carga .env del catálogo operativo ni permite cambiar de base.
- Origen de ensayo fijo https://catalogo-ensayo.local:8444, escucha loopback
  127.0.0.1; auth separado http://127.0.0.1:8042. Requiere certificado propio
  válido para catalogo-ensayo.local y HMAC nuevo para el servicio Python.
- Cookies aisladas por hostname: no usar el IP del portal con otro puerto.
- --check-only comprueba destino, permisos y lectores sin reclamar cola,
  crear archivos, escribir productos o iniciar HTTPS/workers.
- Arranque explícito compone lector regional, persistencia recuperable GT/NC,
  guardias existentes y workers con configuración regional independiente.
- Precio Excel y logs del ensayo en runtime-dir privado. Copia inicial exclusiva
  del Excel GT si existe; las cargas del ensayo no reemplazan el archivo operativo.
- Shutdown deja de atender, cierra las colas, detiene únicamente workers propios
  regionales y cierra el pool. Usar KillMode=control-group al instalar systemd.
- Si falla el cierre de colas o la conexión, el siguiente arranque recupera
  estados pendientes mediante SPEC-105.
- Rutas conservadas; errores de auth o cola no abren acceso legacy.

## Evidencia recibida del NAS

SPEC-105: exclusión entre instancias, cierre controlado y SIGKILL de proceso de
prueba validados. Usuario conservado; estado interrumpida tras caída abrupta.
Registro SIGKILL: d6b56b9f-dd0a-4fe6-80e8-89acdfcce256. No se ejecutaron scrapers.
Faltan escrituras reales de productos, revocación de permisos y navegador aislado.

## Validación local

Compilación TypeScript y revisión de formato correctas. No se ejecutaron tests
ni conexiones DB locales. El modo check-only debe ejecutarse en el NAS antes
de preparar o instalar servicios. Guía en docs/ENSAYO_REGIONAL_DEV.md.
