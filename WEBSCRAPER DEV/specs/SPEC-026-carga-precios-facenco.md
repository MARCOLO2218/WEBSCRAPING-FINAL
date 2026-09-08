# SPEC-026: Subir precios FACENCO desde el catálogo

- Estado: Completada
- Ambiente: DEV

## Alcance

Botón Subir precios FACENCO en el catálogo Node actual: elegir XLSX, validar, mostrar errores de fila/columna y confirmar reemplazo. Usar hoja Precios FACENCO y encabezados de fila 4, compatibles con data/precios_facenco.xlsx. Validar por nombre, tolerar orden distinto de columnas y espacios/mayúsculas en encabezados. Ignorar filas vacías. Exigir producto y un precio válido por fila activa, activo SI/NO, precios numéricos no negativos, códigos y productos sin duplicados. Rechazar fórmulas y encabezados desconocidos para no interpretar incorrectamente datos. Fechas ISO o celdas Excel de fecha.

## Seguridad de datos

Primero vista previa sin escritura; confirmación explícita vuelve a validar. Guardado temporal y reemplazo atómico con copia previa en data/backups; solicitudes concurrentes reciben conflicto y archivos inválidos nunca reemplazan el vigente. Tamaño máximo 5 MB. Mismo origen para escrituras desde navegador. El sistema actual carece de usuarios/roles; disponible para operadores con acceso al catálogo DEV, pendiente control de roles antes de promoción.

## Aceptación y límites

Probar errores, encabezados, duplicados, reemplazo, respaldo y conservación del archivo ante rechazo. Refrescar catálogo tras éxito, sin ejecutar scraper. Celdas textuales intercambiadas entre columnas textuales pueden ser imposibles de detectar: no se promete descubrir errores semánticos arbitrarios. Archivo corrupto, formato incompatible, límite de tamaño y fallos del servidor también se notifican. No modificar archivos de precios reales en pruebas ni PROD.

## Implementación y validación

- src/server/facenco-upload.ts, integración en routes.ts, public/price-upload.js e index.html.
- src/specs/facenco-upload.test.ts: 3 pruebas con XLSX temporales y respaldo; suite Node total 67 aprobadas.
- Se leyó la plantilla actual sin modificarla: 4 productos válidos. Se admite columna moneda=GTQ y filas preparadas con FACENCO/GTQ/SI/Disponible pero sin producto.
- Interfaz implementada, pendiente revisión visual y prueba operativa en servidor DEV. Guía docs/CARGA_PRECIOS_FACENCO.md.
