# SPEC-031: Espacio y cierre del panel FACENCO

Estado: Completada

## Objetivo y aceptación

Dar margen y padding al panel, separar archivo, acciones y resultado, permitir
ajuste a pantallas pequeñas y agregar Cerrar. Cerrar pliega el panel y devuelve
el foco al disparador, conservando archivo y resultado al reabrir. No cancela una
petición en curso ni guarda datos. Confirmar permanece oculto hasta revisión
válida y después de guardar; CSS debe respetar hidden en los botones.

Sin cambios de API, Excel, validaciones ni PROD. Validar interacción en navegador
con respuestas simuladas, ejecutar npm test y Pytest. Archivos: public/index.html,
public/styles.css, public/price-upload.js y registro documental.

## Resultado

Panel con margen exterior, tarjeta con padding, acciones separadas y resultado
con ajuste de texto. Cerrar conserva el contenido y devuelve el foco al summary.
Corregida la prioridad CSS de hidden para no mostrar Confirmar antes de revisión.
67 pruebas Node y 39 Python aprobadas (dos avisos de dependencias). Chromium
local verificó abrir/cerrar/reabrir, confirmación oculta y ancho móvil de 390 px.
Publicación y revisión visual final en Ubuntu DEV pendientes.
