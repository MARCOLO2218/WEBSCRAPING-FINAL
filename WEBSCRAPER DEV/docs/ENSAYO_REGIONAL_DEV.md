# Servicio regional aislado: ensayo en NAS

## Estado

Entrada preparada, no instalada ni activada. Portal PM2 facenco-portal-dev y
auth facenco-auth-dev conservan su configuración. Sólo se usa la base
catalogocomercial_ensayo_101 de tickets_it_db, en el servidor anterior.

El usuario confirmó en PostgreSQL:

- GT 1923 productos publicados con complemento Excel y NC 339 / 310 con precio.
- Exclusión de segunda instancia y liberación/reobtención del bloqueo GT.
- Recuperación de pendiente con usuario tras cierre controlado.
- Recuperación tras SIGKILL con usuario conservado y estado interrumpida.

Los tres registros de prueba creados llevan verification_only=true. No deben
interpretarse como solicitudes reales de scraping ni trasladarse como actividad
real al promover el ensayo. No se ejecutaron scrapers en estas comprobaciones.

## Comprobación de preparación (Ubuntu NAS)

Desde WEBSCRAPER DEV, después de compilar:

```bash
node dist/catalog-regional-server.js \
  --db-host 172.20.0.2 \
  --password-file /home/administradorgt/.config/facenco-dev/auth/postgres-password \
  --check-only
```

No carga .env, crea archivos, reclama colas ni inicia servicios. Reporta los
permisos pendientes de autenticación, los conteos publicados GT/NC y el destino.
`requisitos_db_validados` sólo confirma preparación de la base; no confirma
certificado, autenticación HTTP o navegador.

## Composición prevista

- HTTPS: https://catalogo-ensayo.local:8444, escucha sólo 127.0.0.1.
- Auth Python regional: http://127.0.0.1:8042, esquema administracion.
- Certificado con SAN catalogo-ensayo.local y HMAC propio fuera del repositorio.
- runtime-dir privado (0700), Excel de ensayo y logs separados del portal.
- POST de ejecución: autor autenticado, CSRF, permisos y solicitud persistida.
- GT/NC: advisory locks dedicados, recuperación antes de reanudar trabajos.
- Lectura: publicaciones de guatemala/nicaragua, sin fallback legacy.

El hostname separado evita compartir cookies con el portal por IP. Otro puerto
en el mismo IP no aísla cookies. Primero probar con curl --resolve en el NAS;
el acceso visual puede realizarse después con túnel SSH y resolución del nombre.
No se requiere abrir el puerto de ensayo al resto de la red.

## Antes de instalar o activar

1. Validar preparación y otorgar sólo los permisos administrativos reportados.
2. Preparar certificado, clave, HMAC nuevo y directorio runtime privados.
3. Preparar servicios separados, sin cambiar los actuales; KillMode=control-group.
4. Probar acceso sin sesión, login, roles, CSRF y lectura GT/NC con cookie jar aparte.
5. Probar persistencia de productos y autor, tiendas fallidas, permiso revocado,
   aislamiento de Excel, y rechazo de resultados de un worker interrumpido.
6. Validar navegador y luego definir el cambio de conexión del portal DEV.

El traslado al nuevo servidor y cualquier promoción a PROD siguen pendientes.
