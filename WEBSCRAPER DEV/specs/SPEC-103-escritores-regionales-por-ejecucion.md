# SPEC-103: escritores regionales por ejecución

Estado: Preparado; integración y validación PostgreSQL pendientes.

## Contrato

- Activación explícita CATALOG_REGIONAL_WRITES=1, conexión DEV separada,
  rol webscraper_user y atribución completa de ejecución, usuario y país.
- Revalidar usuario habilitado, país y permiso de operador al guardar.
- Exigir ejecución manual en estado ejecutando y selección original de tiendas.
- GT escribe guatemala; NC escribe nicaragua. Conservar catalogo como legado.
- Validar origen, moneda, precios y fecha UTC. Una tienda inválida conserva
  su publicación anterior; las tiendas válidas pueden confirmar resultados.
- Productos, publicación y marcador result_committed se confirman juntos.
- El cierre diferencia completada, parcial y fallida; no declara éxito por
  finalizar el proceso sin resultado confirmado.
- GT conserva bloqueo de publicación de tres horas y reemplazo por mayor conteo.
- Los workers regionales no reemplazan los archivos CSV/XLSX o JSON legacy.
- La clasificación TypeScript 038-origin-v3 es dependencia del escritor GT.

## Alcance operativo

No se conecta aún este escritor al portal activo. Faltan lectores regionales,
configuración del servicio, recuperación de cola, permisos de escritura y
ensayo funcional aislado antes del cambio de conexión.

## Evidencia previa

En NAS, auth_regional_runtime --check-only validó catalogocomercial_ensayo_101:
4 países, 5 usuarios, 12 permisos, 35 sesiones, 19 eventos y 5 intentos.
La comprobación no ejecutó escrituras. Los permisos otorgados hasta esta fase
permiten lectura de administración y uso de los tres esquemas.
