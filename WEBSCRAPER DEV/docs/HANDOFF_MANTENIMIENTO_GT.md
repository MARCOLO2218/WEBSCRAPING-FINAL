# Handoff de mantenimiento — Guatemala (GT) — 2026-10-01

## Estado

- País: Guatemala (GT), 19 tiendas del registro.
- Ciclo: en progreso; Furniture City sigue sin resolución. La última auditoría
  Ubuntu encontró 58 candidatos y sólo 7 precios; hay un nuevo ajuste local para
  limitar la consulta a la categoría oficial.
- SPEC: [SPEC-070](../specs/SPEC-070-auditoria-mantenimiento-tiendas-guatemala.md).
- Informe detallado: [auditoría de las 19 tiendas](GT_STORE_AUDIT_2026-09-28.md).
- Base local observada: `72a80e0` más cambios locales; hay cambios ajenos staged y
  unstaged en el repositorio. No limpiar, revertir ni publicar en bloque.
- La suite Node local pasó 210/210 y TypeScript compiló después del ajuste de
  Furniture City. `corepack pnpm test` no pudo crear su carpeta temporal por
  permisos de Windows; se usaron los binarios ya instalados en `node_modules`.
- Ubuntu DEV ejecutó `audit:gt` para una sola tienda; no se escribió en la base ni
  se exportó catálogo.
- El último ajuste de Furniture City aún no se ha publicado ni validado en DEV.

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
| Furniture City Guatemala | Última auditoría Ubuntu: 58 candidatos, 58 con nombre/URL, 7 con precio; código local ahora consulta sólo Descanso | Publicar el último ajuste y repetir auditoría/paginación en DEV. |
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
placeholders, pero la auditoría Ubuntu aún recorrió categorías relacionadas y
devolvió 58 candidatos, sólo 7 con precio. El código local ahora consulta una
sola categoría. Esta segunda corrección aún requiere publicarse y verificarse en
Ubuntu; el problema no está resuelto todavía.

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
