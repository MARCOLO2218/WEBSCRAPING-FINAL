# Traslado y separación del Catálogo Comercial DEV

Estado: preparación SPEC-101; no ejecutar DDL sobre el origen operativo.

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
