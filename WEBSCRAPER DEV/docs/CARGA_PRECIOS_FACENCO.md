# Actualizar precios desde la pantalla DEV

1. Abrir el catálogo actual y expandir Subir precios FACENCO, debajo del estado y antes de los filtros.
2. Seleccionar el Excel .xlsx actualizado, hasta 5 MB.
3. Pulsar Revisar archivo. Revisar cantidad y muestra de productos.
4. Si aparecen errores, corregir fila/columna en Excel y seleccionar nuevamente el archivo.
5. Pulsar Confirmar actualización. Se crea un respaldo y se actualiza el catálogo sin ejecutar el scraper.

Usar hoja Precios FACENCO, con encabezados en fila 4. Las columnas pueden reordenarse; se reconocen por nombre. Se ignoran filas vacías o filas con solo valores predeterminados de plantilla. Las filas con activo=NO no se publican. Producto y al menos un precio son obligatorios para cada fila activa. Moneda debe ser GTQ.

No pegar texto en precios: usar 2500, 2,500.00 o Q2,500.00; sin números negativos. Pegar valores calculados si el origen contiene fórmulas. No duplicar nombres de producto ni códigos. Fechas como celda de fecha Excel o AAAA-MM-DD. Los encabezados desconocidos se informan para detectar columnas mal ubicadas.

El archivo confirmado reemplaza data/precios_facenco.xlsx. El anterior permanece en data/backups/precios_facenco-<identificador>.xlsx. Para recuperar una versión, el operador puede volver a subir ese respaldo. La vista previa no guarda nada. No editar directamente el archivo mientras se realizan cargas. Un fallo de red después de confirmar puede dejar el resultado incierto: revisar el catálogo antes de reintentar.

El validador detecta estructura y tipos, no puede saber que un texto válido de marca fue escrito en otra columna textual. También puede rechazar archivos corruptos, tamaño excesivo o fórmulas; no se limita a errores de casilla.

El catálogo DEV actual no tiene cuentas/roles: quienes accedan al catálogo pueden utilizar esta función. Configurar control de operadores antes de publicar en PROD. Se exige mismo origen desde navegadores. No se ha cambiado PROD ni se han reemplazado precios reales durante las pruebas.
