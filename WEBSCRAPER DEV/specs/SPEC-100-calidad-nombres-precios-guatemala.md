# SPEC-100: Calidad de nombres y precios Guatemala

Estado: En progreso; correcciones Serta y Siman locales, validación Ubuntu pendiente.

## Evidencia Ubuntu 2026-10-07

Audit:gt recorrió las 19 tiendas; 18 sin fallo de ejecución, Bodegangas
bloqueada por antibot. Un estado OK no certifica calidad ni cobertura completa.
Serta repite la leyenda accesible del rango de precios. Siman mezcla botones,
marca, nombre, vendedor, precios y cuotas en el nombre, y descuento en el precio.
La Curacao incluye Precio especial y porcentaje en el precio.

## Cambio preparado

Serta reutiliza la normalización de importes de Mattress, conservando hasta dos
importes únicos y separando regular/oferta. Mattress conserva su comportamiento.
No altera filtros, fuentes, datos ni otros comercios.

## Pendientes

- Publicar y validar Serta por auditoría puntual.
- Inspeccionar tarjetas actuales Siman antes de publicar selectores preparados.
- Revisar formato de precio La Curacao y cobertura de Sleep Gallery (122/78).
- Bodegangas sigue pendiente de acceso automatizado permitido.

## HTML renderizado Siman aportado por el usuario

Confirma hitItem, searchProductsItemName y hitLinkItem. Precio regular en
productListPrice .price; oferta en productSellingPriceDiscount .price, descuento
en productDiscountTag. El lector usa estas tarjetas y campos solo para Siman,
sin fallback de enlaces generales. Conserva cuotas fuera del nombre y porcentaje
fuera del precio. Los selectores genéricos preparados previamente se conservan.
