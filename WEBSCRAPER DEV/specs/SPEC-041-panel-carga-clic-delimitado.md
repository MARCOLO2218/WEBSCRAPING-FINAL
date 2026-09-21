# SPEC-041 — Selección de archivo delimitada

Estado: En progreso. Corrección DEV previa al corte SPEC-040.

Separar preparación, selección y revisión del XLSX. Sólo el botón Seleccionar
archivo abre el selector nativo; ocultar input y eliminar label envolvente.
El resumen del panel debe ocupar sólo el ancho de su botón. Clics en textos,
espacios vacíos y catálogo no seleccionan archivos. Mantener nombre visible,
navegación por teclado, preview, confirmación y respaldo existentes.
No modificar API, datos ni PROD. Validar npm test y comportamiento en navegador.

Implementado localmente: tres secciones, input oculto, botón exclusivo, nombre
visible y revisión deshabilitada sin archivo. npm test: 78 aprobadas. Prueba
Chromium intentada pero el entorno rechazó iniciar el proceso (spawn EPERM);
comprobación real de clics y presentación pendiente en DEV.

Revisión tras feedback: usuario acepta el aspecto visual pero sigue reportando
activación fuera de botones. Se reemplaza details/summary por botón explícito
con aria-expanded/aria-controls y panel hidden. Sólo abrir/cerrar mediante sus
botones; sólo choosePriceFile invoca el selector. Sin listeners en títulos,
nombre del archivo o contenedores. Validar nuevamente el caso reportado en DEV.
