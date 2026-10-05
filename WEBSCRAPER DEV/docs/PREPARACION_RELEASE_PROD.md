# Preparación del cambio completo a PROD

## Momento adecuado

Preparar ahora el paquete y el procedimiento. Publicar cuando DEV confirme
acceso, catálogo vigente, ejecución por tienda, usuarios, permisos y HTTPS en
PC/tablet/teléfono. Esta guía no modifica WEBSCRAPER PROD ni activa servicios.

## Trabajo necesario

1. Artefacto de versión único: frontend, servidor protegido, backend, migrations
   compatibles y locks. Construcción reproducible; identificar commit y archivos
   exactos. Evitar copiar manualmente todo DEV sobre PROD o mezclar cambios ajenos.
2. Configuración por ambiente: URL/origen, puertos, certificados, destino DB,
   secretos HMAC y rutas de snapshots/Excel/logs. Documentar nombres y validación;
   valores privados suministrados en el servidor, nunca copiados desde DEV.
3. Supervisor: arranque automático y reinicio controlado de web/backend/workers;
   runtime auth actual es interactivo, falta proveedor de credenciales de servicio.
4. Datos: inventariar revisión real y países habilitados en PROD. Plan de migración
   propio con respaldo y restauración ensayada en copia representativa. La revisión
   047 aplicada en DEV no demuestra que PROD esté migrado. Preservar histórico GT,
   snapshots NC, archivos Excel y semántica de publicación validada.
5. Autorización: probar lector/operador/admin/superadmin, creación/asignación,
   bloqueo/reset y revocación. Cerrar puertos/rutas antiguos que eludan login.
6. Publicación: ventana, operador, verificación de salud, validación del catálogo
   y acceso directo a URL estable del dominio. Mantener versión anterior lista.
7. Reversión: código y datos son procedimientos distintos. No aplicar downgrade
   destructivo por fallo de frontend. Respaldo y recuperación con responsables.

## Entregables antes de solicitar promoción

Manifiesto de archivos/commit, matriz de configuración sin secretos, plan de
base de datos, comandos separados Windows/servidor, pruebas de aceptación y
procedimiento de reversión. Infraestructura final Windows Server/Linux y dominio
deben confirmarse para convertir el procedimiento en comandos definitivos.

## Orden propuesto

Cerrar integración y validar DEV → ensayar despliegue completo en copia aislada
→ revisar paquete/ventana → autorización del usuario → promover y verificar PROD.
Docker es una opción posterior de empaquetado; no es requisito para preparar el
release ni reemplaza el diseño de secretos, datos, TLS y restauración.
