# SPEC-098: Mantenimiento Mattress Guatemala

Estado: Implementación local; auditoría Ubuntu pendiente.

## Evidencia 2026-10-06

La auditoría Ubuntu contó 49 candidatos, 16 con precio. La inspección DOM
posterior encontró 16 tarjetas li.product: 11 con precio y cinco sin precio.
Colchón Confort Intermedio tampoco publica precio en la ficha inspeccionada.
Los conteos proceden de consultas distintas; validar el resultado tras publicar.

## Cambio

- Mattress extrae exclusivamente tarjetas, sin fallback de enlaces generales.
- Limpia leyendas accesibles repetidas y conserva hasta dos importes distintos
  en los rangos de precios, manteniendo precio regular y de oferta separados.
- Conserva productos sin precio; no inventa importes ni los completa desde otros.
- No cambia otros extractores, configuración, PostgreSQL ni PROD.

## Validación pendiente

Publicar solo el ajuste Mattress y repetir audit:gt en Ubuntu. Comparar nombres,
URLs y precios con las tarjetas actuales. No se ejecutaron pruebas automatizadas
en este cambio; el usuario no las solicitó.
