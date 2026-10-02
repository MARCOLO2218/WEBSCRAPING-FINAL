# Handoff de mantenimiento — Guatemala (GT) — 2026-10-01

## Estado

- País: Guatemala (GT), 19 tiendas del registro.
- Ciclo: en progreso; Furniture City ya devuelve cinco candidatos, todos con
  precio y URL y rango limpio en la auditoría Ubuntu posterior a `0adf12c`.
- SPEC: [SPEC-070](../specs/SPEC-070-auditoria-mantenimiento-tiendas-guatemala.md).
- Informe detallado: [auditoría de las 19 tiendas](GT_STORE_AUDIT_2026-09-28.md).
- Base local observada: `0adf12c`; Ubuntu confirmó que estaba actualizado. Hay cambios ajenos staged y unstaged en el repositorio.
  No limpiar, revertir ni publicar en bloque.
- Ubuntu pasó `pnpm test` 139/139 y `pnpm run build` tras publicar `0adf12c`; la auditoría
  puntual devolvió 5 productos, 5 nombres, 5 URLs y 5 precios. La suite Node local
  pasó 211/211 y TypeScript compiló tras limpiar el texto del precio. `corepack pnpm test` no pudo crear su carpeta temporal por
  permisos de Windows; se usaron los binarios ya instalados en `node_modules`.
- Ubuntu DEV ejecutó `audit:gt` para una sola tienda; no se escribió en la base ni
  se exportó catálogo.
- Furniture City validada el 2026-10-01: rango `Q4,829.00 - Q6,379.00`,
  cinco candidatos y cero fallos. Siguiente pendiente: publicar y validar Cemaco en Ubuntu.

## Seguimiento por tienda

| Tienda | Estado de esta evidencia | Siguiente paso |
|---|---|---|
| FACENCO | 13 productos; listado sin precio | Ninguno identificado en esta captura. |
| Camas Olympia Online GT | 41, con precio | Ninguno identificado en esta captura. |
| La Colchoneria Guatemala | 32, con precio; nombre canónico corregido localmente | Ninguno identificado en esta captura. |
| Sleep Gallery Guatemala | 122 candidatos, 78 con precio | Ninguno identificado en esta captura. |
| Serta Guatemala | 14 útiles tras filtro | Ninguno identificado en esta captura. |
| Americana 2000 Guatemala | 40 útiles de 44 recibidos | Ninguno identificado en esta captura. |
| Mattress Guatemala | Error remoto de conexión a la base del comercio | Esperar que el comercio restaure el sitio y repetir comprobación. |
| Beds & Dreams | 39 con precio; no se reprodujeron los 3 reportados | Revisar conteos en el host donde se presente el síntoma. |
| Furniture City Guatemala | Ubuntu tras `0adf12c`: 5 candidatos con nombre/URL/precio y rango limpio | Resuelta para la categoría Descanso observada; revisar en el próximo ciclo. |
| La Curacao Guatemala | 35, con precio | Ninguno identificado en esta captura. |
| MAX Guatemala | 581 | Ninguno identificado en esta captura. |
| Elektra Guatemala | 12; títulos limpios tras corrección | Ninguno identificado en esta captura. |
| Walmart Guatemala | 562, con precio normalizado | Ninguno identificado en esta captura. |
| Cemaco Guatemala | Validación local: 16 páginas, 315 fichas únicas, 311 aceptadas con nombre/precio/URL; 216 pruebas aprobadas | Publicar y repetir auditoría puntual en Ubuntu. |
| Siman Guatemala | 142 candidatos en ocho páginas; página 1 verificada tras corrección | Ninguno identificado en esta captura. |
| Suena Center Guatemala | 18 | Ninguno identificado en esta captura. |
| Dormilandia Guatemala | 70 | Ninguno identificado en esta captura. |
| Dormisuenos Guatemala | 21 | Ninguno identificado en esta captura. |
| Bodegangas Guatemala | Playwright recibe verificación anti-bot; en navegador se vieron 46 camas, páginas con 25 y 21 productos | Validar extracción automatizada desde un host que no reciba el challenge. |

## Actualización Furniture City — 2026-10-01

La ruta anterior [`/mattress-colchones/`](https://www.furniturecity.com.gt/mattress-colchones/)
presenta contenido de marca. La [categoría Descanso](https://www.furniturecity.com.gt/product-category/Descanso/)
publica cinco colchones con precio. El primer ajuste cambió la fuente y quitó
placeholders. Las auditorías Ubuntu encontraron primero 58 y luego 56 candidatos
por categorías relacionadas y enlaces generales. La revisión publicada en
`73273e2` limitó la extracción a las tarjetas de la categoría oficial y produjo
5 de 5 productos con precio y URL. El commit `0adf12c` limpió la leyenda
duplicada del precio variable. Ubuntu confirmó 139/139 pruebas, build correcto
y cinco productos con rango limpio el 2026-10-01. Esta validación corresponde
a la categoría Descanso; la auditoría no actualizó el catálogo operativo.

## Continuidad

1. Publicar y validar la corrección paginada de Cemaco en Ubuntu (referencia local: 311 aceptados en 16 páginas).
2. Repetir los síntomas de Beds & Dreams en el host donde aparecían si se desea
   cerrar ese caso.
3. Mantener Mattress y Bodegangas como bloqueos externos hasta que exista una
   comprobación que permita validar el extractor.
4. Cuando termine o cambie el estado, actualizar este handoff y
   `docs/MANTENIMIENTO_POR_PAIS.md`.

No ejecutar escrituras PostgreSQL/Excel, auditoría general, PROD, proxy o
firewall desde este handoff. Conservar los cambios locales y dejar Git y el
despliegue al usuario.

## Corrección Cemaco — 2026-10-02

La auditoría Ubuntu devolvió 24 candidatos con títulos «Ver más» y «Ver
restricciones» y Q250. La inspección DOM confirmó tarjetas Algolia en enlaces
`a[data-product]` y precios con centavos en un span separado. El extractor
específico ahora lee nombre, marca, URL /p y precios de la misma tarjeta; excluye
el fallback de enlaces generales. La auditoría local de solo lectura obtuvo
20 productos, todos con nombre/precio/URL, cero fallos, y muestras Q5,388.50,
Q6,864.00 y Q3,699.00. Build correcto y 212/212 pruebas Node aprobadas con los
binarios instalados; Corepack falló por EPERM al crear su carpeta temporal.
Cambio local sin publicar: falta validación Ubuntu y revisar cobertura de
paginación; no se certifica todo el catálogo del comercio ni se escribió en DB.

## Cobertura paginada Cemaco — 2026-10-02

La validación final recorrió las 16 páginas anunciadas por el paginador Algolia:
15 páginas de 20 fichas y una última de 15. Total: 315 fichas únicas con precio;
el filtro GT existente aceptó 311 productos de descanso y descartó cuatro
no relacionados. Los 311 aceptados tienen nombre, precio y URL; cero fallos,
215 segundos. Muestras: Colchón Beautyrest Firme Q5,388.50, Set Colchón + Base
Beautyrest Firme Q6,864.00 y Set de Cama Dinasty Plus Q3,699.00.

El paginador abrevia intervalos con puntos suspensivos. El extractor incluye
las páginas intermedias hasta el máximo descubierto, conserva búsqueda e índice,
deduplica por URL y falla explícitamente ante una página sin tarjetas o más de
20 páginas. TypeScript compiló y 216/216 pruebas locales pasaron. Validación de
solo lectura: sin PostgreSQL, exportaciones ni despliegue. Queda publicar y
confirmar esta misma auditoría en Ubuntu; el conteo refleja la búsqueda actual
`camas`, no todo el catálogo comercial ni todas sus variantes.
