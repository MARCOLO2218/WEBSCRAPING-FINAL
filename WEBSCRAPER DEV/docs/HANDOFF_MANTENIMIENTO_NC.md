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

## La Curacao validada en Ubuntu — 2026-10-04

El usuario publicó `51de964` y confirmó su pull en Ubuntu. El piloto en vivo
compiló y terminó con status ok, complete true, reason finished: 65 productos
únicos en tres páginas (24+24+17), total anunciado estable 65, cero duplicados,
problemas o advertencias. Precios NIO habitual/oferta y stock JSON-LD reconocidos;
los ejemplos incluyen C$19,000.00 habitual y C$10,399.00 oferta. Sin escrituras.
La validación cubre la categoría superior Camas y Colchones actual, no certifica
la equivalencia con las fuentes de tamaños ni todos los atributos de ficha.

Las cinco tiendas confirmadas ya responden mediante sus pilotos. Siguiente
trabajo: ejecutor NC independiente con salida regional homogénea (país/moneda,
identidad, campos opcionales y cobertura), incluyendo corrección de disponibilidad
Walmart. Después validar el conjunto en Ubuntu y preparar la vista NC en DEV;
no escribir en PostgreSQL ni activar el ejecutor GT/PROD durante esta preparación.
## Ejecutor unificado NC — SPEC-082 — 2026-10-04

Preparado localmente `pnpm run scrape:nc`, selección opcional
`--stores=la-curacao,el-gallo,siman,walmart,maxipali`. Serial, navegador compartido,
filas completas con país NC/moneda NIO, identidad e importes numéricos; continúa
tras error por tienda y reporta cobertura verificada/acotada sin equipararlas.
El piloto de cuatro tiendas conserva su CLI y ahora exporta una función reutilizable,
sin iniciar Chromium al importar. Walmart informa «No disponible» ante falta de
stock explícita. Build y 221/221 pruebas locales aprobadas; sintaxis de scripts
e importación sin ejecución verificadas. Falta publicación y ejecución conjunta
en Ubuntu. Salida completa sólo en consola; no activa NC ni persiste datos.
Después de validar este ejecutor: preparar vista NC y revisar las compuertas
pendientes para persistencia/exportación regional; no modificar PostgreSQL.

## Ejecución conjunta Ubuntu — 2026-10-04 — 68d83aa

Usuario confirmó pull, 149/149 pruebas aprobadas (incluyen compilación), y
`scrape:nc -- --summary` con status ok, NC/NIO y databaseWrites false.
Resultados: La Curacao 65/65 con precio; El Gallo 35/35; Siman 77/77;
Walmart 154/143; Maxi Palí 6/0. Total 337 productos, 320 con precio y 17 sin
precio. Las cinco tiendas respondieron; tiempo por tienda 7.938, 60.017,
70.297, 8.750 y 30.712 segundos respectivamente.
La Curacao certifica su categoría; las otras cuatro conservan cobertura acotada.
El ejecutor independiente está validado en DEV, no es catálogo operativo.

Antes de la vista NC, corregir campos auxiliares observados: Maxi Palí usa
`https://wmcamcdn.com/biformato/icon_sf.png` como imagen (icono, no producto),
y Siman trae texto de precio junto al porcentaje en discount. No inventar una
foto ni un descuento. Siguiente bloque: vista NC alimentada con resultados
reales del ejecutor y flujo por tienda; persistencia/exportación regional sigue
pendiente de integración sin modificar PostgreSQL en este ciclo.

## Vista NC DEV — SPEC-083 — 2026-10-04

Preparada localmente `/catalogo-nicaragua.html`, enlazada desde el portal. Lee
un snapshot real generado explícitamente con
`corepack pnpm run scrape:nc -- --publish-preview --summary`. Sólo publica tras
éxito de las cinco tiendas; falla sin reemplazar la versión previa en caso
parcial. No agrega datos ficticios ni modifica PostgreSQL. El JSON local queda
fuera de Git. Muestra fecha, filtros, fotos y precios NIO; error si no existe
snapshot. Siman limpia discount; Maxi Palí descarta icon_sf.png como foto.
Build y 224/224 pruebas locales aprobadas. Falta publicación, generación en
Ubuntu y revisión visual. Después: acciones operativas y exportación/persistencia
regional con sus compuertas; el botón de actualización actual sólo relee datos.
