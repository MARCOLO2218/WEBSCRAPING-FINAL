# Traslado y separación del Catálogo Comercial DEV

Estado: preparación SPEC-101; no ejecutar DDL sobre el origen operativo.

## Ensayo regional verificado y preparación de aplicación

Usuario confirmó 101_comercial (2026-10-21 18:05:22 UTC) y consultó:
legado 189328, guatemala.productos 181160, nicaragua.productos 339,
administracion.usuarios 5 y usuario_paises 12. Vistas de ejecuciones: 254 GT
historico y cinco NC importacion_snapshot, todas sin autor identificado.
No repetir fases 101 ni borrar esquemas al recibir error de esquemas no vacíos.

SPEC-102 prepara identidad de sesión -> cola -> repositorio regional y contexto
privado por worker, con inyección explícita todavía ausente del arranque actual.
El repositorio confirma la solicitud antes de ejecutarla y no declara completo
un worker que no confirmó productos regionales en su transacción. No habilitarlo
antes de conectar los escritores nuevos. Recuperación de cola tras reinicio y
conexión de lecturas quedan pendientes.

Nuevo módulo auth_regional_runtime aislado: --database catalogocomercial_ensayo_101,
--db-host explícito y --password-file privado existente; --check-only sólo lectura.
Requiere grants a webscraper_user sobre administracion y validación de las fases
101 antes de poder entrar. No correr todavía sobre un rol sin preparar permisos;
no cambiar facenco-auth-dev ni PM2. La futura API usa puerto loopback 8042.
Un puerto HTTPS diferente en la misma IP no aísla cookies por host: definir
origen de ensayo o usar cliente separado antes de probar login en navegador.

## Tres fuentes, una futura base

| Fuente actual | Contenido | Evidencia |
|---|---|---|
| 10.238.13.227 / WEBSCRAPING_CAMAS_DEV | Productos y publicaciones GT operativos | 189328 productos, último run 256 |
| NAS tickets_it_db / webscraper_dev | Usuarios, permisos y fotografía regional anterior | 180382 productos, último run 246, revisión 047 |
| NAS DEV / public/nicaragua-catalogo.json y archivos de tienda | Publicación NC | No incluida en pg_dump |

FACENCOADDONS/WSL Ubuntu-24.04 contiene catalogocomercial-dev-db con una copia
restaurada de la segunda fuente. No contiene los últimos productos comerciales
por el hecho de haberse restaurado correctamente. webscraper_user destino aún
NOLOGIN, sin contraseña; la aplicación sigue usando NAS y la fuente comercial.

## Respaldo de la fuente comercial (NAS, no Windows ni servidor nuevo)

Publicar el script por Git y descargar mediante pull --ff-only gestionado por
el usuario. En /home/administradorgt/WEBSCRAPING-FINAL/WEBSCRAPER DEV:

1. node scripts/backup-commercial-dev.mjs (plan de sólo lectura).
2. sudo -v
3. node scripts/backup-commercial-dev.mjs --backup

El script acepta únicamente el host, base, rol y esquema inventariados; lee
.env sin cambiarlo ni volcar credenciales. Exige PostgreSQL 16, abre transacción
read-only repeatable read, obtiene conteos y exporta su snapshot a pg_dump.
Usa el cliente de tickets_it_db sin escribir en su base. Requiere conectividad
desde ese contenedor hacia la fuente; ante error no confirmar el respaldo.

Salida privada bajo ~/backups/webscraper/comercial-dev-*:
comercial_dev.dump, inventario.txt, manifiesto.json y SHA256SUMS. No subirlos
a Git. Env-file de contraseña sólo temporal; SIGKILL/caída del host puede
interrumpir su limpieza: revisar archivo .pg-env-temporal antes de compartir
o archivar carpetas. No confundir inventario legible con restore de ensayo.

## Orden de incorporación

### Separación comercial de ensayo (preparada, no aplicada)

101_administracion confirmado por el usuario en ensayo el 2026-10-21
17:51:05 UTC: cinco usuarios y doce asignaciones verificadas. Origen y portal
no cambiaron. Continuar desde backend del NAS tras publicar country_rehearsal:

    sudo -v
    .venv/bin/python -m catalog_api.db.country_rehearsal \
      --nc-snapshot /home/administradorgt/backups/webscraper/nicaragua-101-Yor0gMCo/nicaragua-catalogo.json \
      --expected-nc-sha256 647295e87a9b88e34aae2f048df9aa88aa6408dc781012f2198d9e2635ff7e76

Leer el plan real antes de aplicar con --apply --confirm-rehearsal y
--expected-plan-sha256. El plan no escribe ni migra tablas. Si la fase ya se
aplicó, no repetir ni borrar esquemas para evitar su rechazo: reconciliar primero.

Destino físico comercial guatemala/nicaragua: tiendas, ejecuciones, productos
y publicaciones. Guatemala copia sólo productos asignados GT por reglas v3,
dejando el legado original completo. El resto de países y pendientes permanecen
en catalogo con ledger de clasificación: nada se elimina ni reasigna por defecto.
Nicaragua importa los 339 productos del respaldo; no inventa usuario ni historia
de scraping: cada tienda se etiqueta importacion_snapshot. Fechas/monedas/precios
se conservan con validación. Las publicaciones GT del ensayo son derivadas; no
activar el portal hasta comprobar equivalencia, conteos y reglas de publicación.

Vistas administrativas v_productos_cubo y v_ejecuciones_cubo unen GT/NC con
usuario y país. Histórico sin autor = Sin usuario registrado; no atribuirlo a
admin. Las ejecuciones futuras manual/programado requieren FK a usuario real.
La captura del usuario en servidor y persistencia desde cola/worker aún está
pendiente: no afirmar que el catálogo operativo ya registra ese dato.

### Administración de ensayo (primera fase preparada)

Ya restaurada por el usuario catalogocomercial_identidad_101 en tickets_it_db:
5 usuarios, 12 asignaciones, revisión 047. Respaldo identidad:
identidad-101-xQbBaObl/identidad_dev.dump,
SHA256 97e25a83aa962f1771d13fac17fe802a6ee3c2082425cdf5cd61cf717452c5ae.
Snapshot NC guardado en nicaragua-101-Yor0gMCo/nicaragua-catalogo.json,
SHA256 647295e87a9b88e34aae2f048df9aa88aa6408dc781012f2198d9e2635ff7e76:
339 productos, cinco tiendas, 310 con precio, fecha 2026-10-21T15:45:47.079Z.

Desde backend del NAS, tras publicar y descargar el módulo nuevo:

    sudo -v
    .venv/bin/python -m catalog_api.db.administration_rehearsal

El plan sólo lee ambas bases de ensayo y compila el DDL. Muestra conteos y
identity_sha256; nunca hashes de contraseña ni tokens. Conservar salida para
aplicación posterior mediante --apply --confirm-rehearsal y
--expected-identity-sha256 con la huella exacta. No ejecutar apply antes de
revisar el plan real.

La fase crea administracion con tablas y copia identidad/permisos/auditoría;
reserva guatemala/nicaragua vacíos. Todavía no mueve los productos ni conecta
auth/API/workers. Rechaza esquemas preexistentes, no repite ni hace DROP CASCADE.
No cambia la revisión Alembic legacy; registra su fase en migraciones_ensayo.
El runtime operativo conserva sus conexiones y tablas anteriores.

Ensayo comercial confirmado: catalogocomercial_ensayo_101 en tickets_it_db,
189328 productos, 255 runs, 19 publicaciones, run máximo 256. Restauración
--no-owner --no-privileges: no existe rol postgres en ese cluster.
Historial hasta run 246 coincide con webscraper_dev: 245 runs y 180382 productos,
comparados por huellas MD5 de filas completas ordenadas por ID. Diferencia
posterior: 10 runs y 8946 productos. No activar el catálogo sobre esta base:
todavía no contiene identidad regional ni datos NC ni la separación solicitada.

1. Respaldo de ambas fuentes y copia de snapshots NC/Excel con fechas y hashes.
2. Restaurar respaldo comercial en scratch separado. Comparar identidad y
   contenido de runs/productos compartidos con la fotografía 042.
3. Definir mapeo por país, preservar SV y pendientes en legado sin atribuirlos
   a GT, conservar usuarios reales y no inventar autor de ejecuciones antiguas.
4. Preparar migración administracion/guatemala/nicaragua y esquema de reporting.
5. Integrar autor autenticado con cola persistente, worker y resultados. Debe
   registrarse también ejecución fallida/parcial, no sólo productos insertados.
6. Adaptar login y catálogo, importar NC y ensayar consultas/reportes por país.
7. Corte posterior en servidor nuevo: respaldo fresco, detener escrituras,
   restaurar/validar, cambiar conexiones y comprobar rollback antes de retirar NAS.

public contiene pgcrypto: no eliminarlo ni mover su extensión en esta etapa.
Ningún comando de esta guía restaura o altera la base de origen.
