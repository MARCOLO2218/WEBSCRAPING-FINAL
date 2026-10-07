# SPEC-099: Mantenimiento del HTML de Bodegangas

Estado: Preparado localmente; validación y acceso automatizado pendientes.

## Evidencia 2026-10-06

HTML aportado por el usuario: tarjetas etheme-product-grid-item, nombres en
woocommerce-loop-product__title, precios WooCommerce, marcas y siguiente
página mediante a.next.page-numbers. Paginador anuncia páginas 1 y 2.
La navegación habitual muestra productos; Windows visible y Ubuntu automatizado
reciben Checking your browser. El HTML guardado no resuelve ese bloqueo.

## Cambio

- Lee importes de .price .woocommerce-Price-amount, evita leyendas duplicadas,
  conserva rangos y separa precio regular de oferta. Agotados pueden no tener precio.
- Sigue el enlace siguiente del comercio dentro de la misma categoría y host.
- Rechaza páginas bloqueadas, sin tarjetas, ciclos y límite de cinco páginas
  con siguiente pendiente, en lugar de devolver un resultado parcial exitoso.
- No copia sesiones ni intenta eludir la verificación antibot.

## Pendientes

Validar extracción y paginación con HTML de ambas páginas y confirmar ejecución
en vivo cuando el comercio permita el acceso automatizado. No se ejecutaron
pruebas ni se publicó este cambio. No cambia datos, secretos ni PROD.

## HTML de última página

El segundo archivo aportado por el usuario contiene 21 tarjetas eTheme.
El paginador marca página 2 actual, ofrece anterior/página 1 y no tiene
enlace siguiente. Confirma la condición de terminación preparada en el lector.

Conteo estático de ambos archivos: 25 + 21 tarjetas, 46 URLs de producto
únicas y 12 tarjetas con indicador Agotado. No se guarda el HTML completo
en Git, porque contiene contenido y configuración ajenos al proyecto.
