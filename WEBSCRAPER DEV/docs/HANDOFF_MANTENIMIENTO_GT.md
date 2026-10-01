# Handoff de mantenimiento — Guatemala (GT) — 2026-10-01

## Estado

- País: Guatemala (GT), 19 tiendas del registro.
- Ciclo: en progreso; Furniture City ya devuelve cinco candidatos, todos con
  precio y URL en la auditoría Ubuntu de `73273e2`. Queda validar en Ubuntu la
  normalización local de una leyenda de rango duplicada en un precio variable.
- SPEC: [SPEC-070](../specs/SPEC-070-auditoria-mantenimiento-tiendas-guatemala.md).
- Informe detallado: [auditoría de las 19 tiendas](GT_STORE_AUDIT_2026-09-28.md).
- Base local observada: `87dab77` más cambios locales; Ubuntu confirmó después
  el pull a `73273e2`. Hay cambios ajenos staged y unstaged en el repositorio.
  No limpiar, revertir ni publicar en bloque.
- Ubuntu pasó `pnpm test` 138/138 y `pnpm run build` con `73273e2`; la auditoría
  puntual devolvió 5 productos, 5 nombres, 5 URLs y 5 precios. La suite Node local
  pasó 211/211 y TypeScript compiló tras limpiar el texto del precio. `corepack pnpm test` no pudo crear su carpeta temporal por
  permisos de Windows; se usaron los binarios ya instalados en `node_modules`.
- Ubuntu DEV ejecutó `audit:gt` para una sola tienda; no se escribió en la base ni
  se exportó catálogo.
- La limpieza del texto del precio variable es el siguiente cambio local por
  publicar; aún falta confirmar la auditoría actualizada en Ubuntu.

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
| Furniture City Guatemala | Ubuntu `73273e2`: 5 candidatos, todos con nombre/URL/precio; normalización del texto de un rango ya está local | Publicar normalización y repetir auditoría puntual. |
| La Curacao Guatemala | 35, con precio | Ninguno identificado en esta captura. |
| MAX Guatemala | 581 | Ninguno identificado en esta captura. |
| Elektra Guatemala | 12; títulos limpios tras corrección | Ninguno identificado en esta captura. |
| Walmart Guatemala | 562, con precio normalizado | Ninguno identificado en esta captura. |
| Cemaco Guatemala | 20, con precio; observación anterior de formato por revisar | Confirmar formato con extracción directa/fixture; los ejemplos públicos consultados usan `Q` con miles y centavos. |
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
5 de 5 productos con precio y URL. Una muestra de precio variable aún incluye
una leyenda duplicada; el extractor local normaliza ese texto a los importes
únicos del rango. Falta publicar y verificar esta limpieza final.

## Continuidad

1. Cuando el usuario publique el último ajuste en DEV, repetir la auditoría de
   Furniture City y actualizar fecha, commit, conteo, precios y paginación.
2. Confirmar la extracción de precio de Cemaco con un fixture o salida directa;
   no modificar el parser sin reproducir un valor incorrecto.
3. Repetir los síntomas de Beds & Dreams en el host donde aparecían si se desea
   cerrar ese caso.
4. Mantener Mattress y Bodegangas como bloqueos externos hasta que exista una
   comprobación que permita validar el extractor.
5. Cuando termine o cambie el estado, actualizar este handoff y
   `docs/MANTENIMIENTO_POR_PAIS.md`.

No ejecutar escrituras PostgreSQL/Excel, auditoría general, PROD, proxy o
firewall desde este handoff. Conservar los cambios locales y dejar Git y el
despliegue al usuario.
