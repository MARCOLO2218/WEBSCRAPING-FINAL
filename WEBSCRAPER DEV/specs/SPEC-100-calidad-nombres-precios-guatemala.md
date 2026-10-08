# SPEC-100: Calidad de nombres y precios Guatemala

Estado: En progreso; Serta, Siman y Curacao validadas en Ubuntu; Sleep Gallery pendiente.

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

- Publicar y validar el ajuste de Sleep Gallery por auditoría puntual.
- Bodegangas sigue pendiente de acceso automatizado permitido.

## HTML renderizado Siman aportado por el usuario

Confirma hitItem, searchProductsItemName y hitLinkItem. Precio regular en
productListPrice .price; oferta en productSellingPriceDiscount .price, descuento
en productDiscountTag. El lector usa estas tarjetas y campos solo para Siman,
sin fallback de enlaces generales. Conserva cuotas fuera del nombre y porcentaje
fuera del precio. Los selectores genéricos preparados previamente se conservan.

## Validación Ubuntu ace6c53 — 2026-10-07

TypeScript compiló. Serta: 14 productos con nombre/precio/URL, rangos sin
leyendas repetidas. Siman: ocho páginas, 147 productos únicos con nombre,
precio y URL; muestras de nombres limpios y ofertas Q3,519/Q3,189/Q6,044.
Cero fallos. La auditoría no publicó datos ni escribió PostgreSQL.

## Curacao preparada

Normaliza únicamente los campos regular_price/sale_price de La Curacao GT,
extrayendo importes Q/GTQ y conservando hasta dos importes únicos para rangos.
Elimina Precio especial y porcentaje del campo precio; conserva descuento
por separado. No cambia nombres, tarjetas, filtros ni otros comercios.
Validación Ubuntu 9fbbd2c (2026-10-08): 35 productos con nombre/precio/URL,
ofertas limpias Q3,958.00/Q3,978.00/Q2,938.00; cero fallos de ejecución.
La auditoría no escribió PostgreSQL ni exportó el catálogo.

## Sleep Gallery: tarjetas reales

Auditoría Ubuntu 2026-10-08: 122 filas, 78 con precio. Inspección Playwright
aportada por el usuario: 78 tarjetas article.sg-card, todas con sg-card-price,
ninguna tarjeta sin precio. El fallback de enlaces generales añade 44 filas
fuera de las tarjetas del catálogo.

Se desactiva includeLinkFallback únicamente en Sleep Gallery. Se conservan
las tarjetas y sus selectores de nombre, precios, URL e imagen; no se exige
precio para conservar una tarjeta real. Resultado esperado en esta captura:
78 productos con nombre/precio/URL. Validación Ubuntu pendiente.
