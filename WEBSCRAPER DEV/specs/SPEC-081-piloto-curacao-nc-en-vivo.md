# SPEC-081 — Piloto La Curacao NC en vivo

Estado: implementación local; validación Ubuntu pendiente.

## Alcance

El usuario confirmó las cinco tiendas NC el 2026-10-04. Ubuntu obtuvo HTTP 200
y HTML con 65 productos anunciados en la categoría Camas y Colchones.
Se agrega `pnpm run pilot:curacao-nc-live` separado del piloto de capturas.

## Criterios

- Reutiliza `readCuracaoNcDom` y `collectCuracaoNcPages` de SPEC-039.
- Recorre exclusivamente la categoría NC, hasta diez páginas; verifica total
  estable, identidad, precio NIO y paginación con los controles existentes.
- Informa resultado parcial con código de salida 1 cuando la cobertura no se
  valida. No considera HTTP 200 suficiente ni fuerza el número 65 en código.
- Reporta páginas, problemas, duplicados y muestras; cierra Chromium siempre.
- No guarda archivos, escribe PostgreSQL ni activa NC/PROD. La comparación con
  las fuentes de tamaños y la integración operativa siguen pendientes.

## Validación

Pruebas existentes del lector/collector cubren precios, identidad, totales,
páginas parciales, límites y ciclos. Se añade prueba de frontera del runner.
La prueba real debe ejecutarse en Ubuntu, donde se confirmó el acceso al sitio.
