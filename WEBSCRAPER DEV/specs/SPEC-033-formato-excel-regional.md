# SPEC-033: Formato Excel FACENCO por país y moneda

Estado: Completada

## Objetivo

Implementar el siguiente paso de SPEC-029 con un único Excel, hoja Precios
FACENCO, encabezados fila 4 y datos desde fila 5. Agregar pais y conservar moneda.
Plantilla vacía descargable desde el panel, con listas GT/HN/SV/NC y GTQ/HNL/USD/NIO.
No modificar el archivo operativo para generar la plantilla.

## Reglas

- Archivo antiguo sin columna pais: solo GT/GTQ, moneda vacía conserva compatibilidad.
- Con columna pais: exigir país y moneda en cada producto activo, normalizar códigos
  y validar con SPEC-032. No convertir importes. Admitir importes numéricos y código
  de moneda correspondiente; símbolos Q, L, $, C$ según el país.
- Duplicados de producto/código se validan por país. Una fila de otro país no
  reemplaza una referencia GT de igual nombre.
- Revisar muestra país, moneda y conteos por país. Guardar reemplaza el archivo
  completo: conservar filas de todos los países que se deseen mantener. Informarlo
  antes de confirmar; conservar respaldo, revalidación y escritura atómica.
- Lectores Node y Python actuales consumen solamente GT/GTQ, aceptando archivos
  históricos sin pais. País explícito vacío/desconocido o moneda distinta nunca
  se convierten en Guatemala. No cambiar el contrato actual de productos.
- La pantalla explica que las filas regionales se conservan pero solo GT se muestra
  hasta implementar el aislamiento API/UI. Descargar plantilla no modifica precios.

## Fuera de alcance

Selector de países, migración PostgreSQL, scrapers nuevos y PROD. No actualizar
el Excel real durante pruebas. La plantilla nueva está vacía y requiere productos.

## Aceptación

Pruebas de los cuatro pares, combinaciones incorrectas, duplicados por país,
compatibilidad histórica, lectura GT aislada en ambos servidores, preview sin
escritura y respaldo regional. Verificar plantilla descargable, encabezados,
listas y layout. npm test y Pytest antes de entrega.

## Resultado local

Plantilla descargable, validación regional, preview por país/moneda y lectores GT
Node/Python implementados. 74 Node y 40 Python aprobadas, dos avisos de dependencias.
Plantilla renderizada y comprobada con ExcelJS; descarga y preview en Chromium
con HTTP simulado. Archivo operativo no modificado. Publicación Ubuntu pendiente.
SPEC-034 requiere adaptar el reemplazo global antes de permitir operadores por país.
