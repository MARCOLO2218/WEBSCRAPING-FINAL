# Handoff Nicaragua — 2026-10-04

## Alcance confirmado

El usuario confirmó La Curacao, El Gallo más Gallo, Siman, Walmart y Maxi Palí
como las cinco tiendas solicitadas por los clientes. No volver a pedir el roster.
País NC, moneda NIO. Todas permanecen deshabilitadas en el catálogo operativo.

## Estado y orden de trabajo

1. Cuatro pilotos revalidados en Ubuntu el 2026-10-04 (evidencia abajo).
   No repetirlos completos sin necesidad; priorizar La Curacao y los defectos observados.
2. La Curacao requiere tratamiento separado: el piloto existente revisa capturas
   con manifiesto y no es un scraper operativo. Resolver lectura en vivo,
   paginación y diferencias entre categoría principal y tamaños antes de integrarla.
3. Corregir únicamente fallos reproducibles con SPEC/pruebas, incluyendo moneda,
   precio opcional, nombres, URLs, deduplicación y cobertura por tienda.
4. Preparar un ejecutor NC independiente de GT, con reporte por tienda. Conservar
   productos sin precio como tales (Maxi Palí), sin inventar importes.
5. Integrar en DEV después de validar el ejecutor y la separación país/moneda;
   ninguna confirmación de roster autoriza escribir PostgreSQL ni activar PROD.

## Evidencia anterior

El Gallo y Siman tienen pilotos previos; Walmart registró 153 productos, 141
con precio; Maxi Palí seis fichas sin precio. Son referencias históricas y deben
contrastar con los sitios actuales. El registro `src/scrapers/nc/registry.ts`
exige habilitación explícita de país y tienda, y no está conectado al ejecutor GT.
SPEC-039, SPEC-049 a SPEC-054 y docs/MIGRATION_PLAN.md conservan los antecedentes.

## Continuidad

GT: Furniture City y Cemaco validadas en Ubuntu; Beds & Dreams devuelve 39
productos el 2026-10-04. Mattress y Bodegangas mantienen bloqueos externos.
Trabajar sólo DEV, conservar cambios locales y dejar Git/despliegue al usuario.
No cambiar secretos, configuración, PostgreSQL, proxy, firewall ni PROD.
## Pilotos Ubuntu — 2026-10-04

Resultado aportado por el usuario, `databaseWrites: false`:

| Tienda | Productos únicos | Con precio | Evidencia y límites |
|---|---:|---:|---|
| El Gallo más Gallo | 35 | 35 | Ambas búsquedas anuncian 35: páginas 9+9+9+8, quinta vacía; deduplicadas entre búsquedas. |
| Siman | 77 | 77 | Camas: cinco páginas (20+20+20+20+10); colchones: dos (20+11). Filtra irrelevantes y deduplica. No se confirmó un total anunciado independiente. |
| Walmart | 154 | 143 | 21 camas/colchones y 133 accesorios. Once sin precio; ofertas observadas tienen Price/ListPrice 0, AvailableQuantity 0 e IsAvailable false. |
| Maxi Palí | 6 | 0 | Seis fichas confirmadas por el piloto; no publica precio. Lista acotada, no certifica descubrimiento completo del sitio. |
| La Curacao | Pendiente | Pendiente | Falta validar acceso y lector en vivo; capturas previas no certifican el sitio vigente. |

Defecto reproducible pendiente Walmart: las ofertas no disponibles se reportan
como «Listado en tienda online»; preparar una distinción explícita de falta de
stock sin convertir precio cero en precio comercial. Mantener precio ausente.
Siguiente: comprobar La Curacao desde Ubuntu, luego preparar ejecutor NC
independiente con resultados y límites de cobertura explícitos. Los cuatro
pilotos no constituyen integración ni activación del catálogo regional.
## La Curacao: preparación en vivo — 2026-10-04

Ubuntu confirmó HTTP 200 y HTML con 65 productos anunciados, tarjetas Magento,
precios C$ y enlace siguiente `?p=2`. SPEC-081 agrega el runner
`pnpm run pilot:curacao-nc-live`, que reutiliza el lector y collector de SPEC-039.
Build y 217/217 pruebas Node locales aprobadas con binarios instalados. Falta
publicar el runner y ejecutarlo en Ubuntu; la muestra de página 1 no certifica
los 65 productos ni la equivalencia con fuentes de tamaños.
