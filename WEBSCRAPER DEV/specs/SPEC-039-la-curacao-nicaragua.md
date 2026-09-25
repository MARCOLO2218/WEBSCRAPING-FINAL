# SPEC-039 — Primera tienda Nicaragua: La Curacao

Estado: Cerrada para el lote de validación con capturas guardadas; cobertura
técnica parcial, sin habilitación operativa. Lector DOM, paginación y ficha de
producto validados offline con HTML real. Camas p1/p2/p3 entrega 53 SKU distintos
de 54 anunciados; por autorización del usuario se omite el puesto no observado
sólo en este lote. Se
revisaron páginas guardadas de Individuales, Queen, King y Matrimoniales: 53
identidades por URL canónica, todas coinciden con los 53 productos observados en
Camas. El usuario confirmó el 2026-09-23 que esas cuatro rutas terminan en las
páginas aportadas y no muestran una extensión o paginación adicional. Sus HTML
siguen sin publicar total ni controles, así que esta confirmación se registra
como evidencia manual y no cambia el resultado conservador del lector DOM. La
vista previa local validó 53 candidatos sin conflictos, sin conexión al sitio o
base. En la categoría superior p2 y p3 se validaron offline, con 23 y 20
tarjetas respectivamente; el acumulado de p1/p2/p3 es 67 productos únicos de 68
anunciados, sin duplicados ni conflictos de identidad. La revisión termina
`count_mismatch`. Se cierra este lote siguiendo la autorización puntual del
usuario para omitir el producto no observado; no se inventa ni persiste. La p1 es
una captura anterior; el conjunto combinado es evidencia de capturas, no una
instantánea única. Esta SPEC no incluye trabajo visual; La Curacao sigue fuera
del ejecutor y del catálogo NC.

## Alcance

Primera tienda NC/NIO: `la-curacao-nc`, nombre `La Curacao Nicaragua`.
Trabajar en src/scrapers/nc/; no registrarla en la ejecución GT ni persistir sus
precios en las tablas actuales sin aislamiento regional. SPEC-038 cerró la
auditoría; SPEC-042/043 se ensayaron en copia, sin migrar la base original.

## Fuentes y evidencia

Base https://www.lacuracaonline.com, rutas:

- /nicaragua/c/muebles/camas-y-colchones/camas (principal)
- /nicaragua/camas-individuales
- /nicaragua/camas-queen
- /nicaragua/camas-king
- /nicaragua/camas-matrimoniales

Capturas aportadas: categoría superior p1 muestra 24 de 68; Camas p1/p2/p3
muestran 24/54, 47/54 y 54/54 en sus contadores, con 24, 23 y 6 tarjetas
respectivamente. Tamaño de página 24; la categoría superior y Camas exponen
grupos de filtros. Las rutas por tamaño muestran precios C$. Son observaciones
de capturas, no conteos vivos.
Evidencia anterior al HTML aportado: consulta automatizada de los cinco enlaces
con 403. La observación posterior en
navegador confirmó `?p=2` para Camas. Las capturas DOM posteriores confirman
enlaces `?p=2`/`?p=3`, SKU y URL canónica para la fuente Camas. Las capturas por
tamaño usan una cuadrícula MGZ sin SKU publicado ni controles visibles; las 53
identidades observadas coinciden con Camas. La falta de total/paginación impide
certificar cobertura. No asumir `?page=`.

### Observación en navegador — 2026-09-22, anterior al HTML aportado

Las URLs se abrieron en navegador y se revisó su árbol de accesibilidad. En la
categoría Camas, pulsar “Página 2” llevó a `?p=2`; la navegación muestra páginas
1, 2 y 3. La categoría superior mostró subcategorías Camas y Colchones y una
mezcla de camas/colchones. La ruta Matrimoniales mostró al menos un colchón, por
lo que no se debe asumir que cada ruta por tamaño contiene exclusivamente camas.

Se observaron precios `C$`, precio de oferta/regular y descuentos. El panel de
filtros de la categoría superior expone Precio, Nivel de firmeza, Plazas, Marca,
Color y Material; el orden permite Recomendados, precio ascendente/descendente
y nombre A-Z/Z-A. No se aplicaron filtros ni se interactuó con el carrito.

Los conteos cambiaron durante las observaciones: Camas mostró 24 de 54 y luego
47 de 54 al pasar a la página 2; el índice público mostró 55. La categoría
superior mostró 24 de 68 y el índice público 69; las capturas aportadas antes
mostraban 53 en Camas. Son fotografías variables, no valores de aceptación.
Las rutas Individuales, Queen, King y Matrimoniales cargaron con productos y
precios C$, pero no se completó su paginación ni una comparación íntegra de IDs.

El árbol de accesibilidad permitió ver nombres/precios y contenedores con
identificadores `product-item-info_*`; no se inspeccionó el HTML ni se validó
que esos textos correspondan a atributos CSS estables. Los selectores, la
extracción de SKU, la URL canónica, el tamaño de página y el fin de paginación
siguen pendientes de verificación en DOM. La observación corrige el bloqueo
de acceso completo, pero no autoriza todavía implementar un parser basado en
selectores supuestos.

## Diseño de extracción y aceptación pendiente

### Ampliación: categoría superior aportada por el usuario

Registrar /nicaragua/c/muebles/camas-y-colchones y conservar como referencia
el enlace con ?product_list_order=product_price_asc. Por su nombre el parámetro
indica orden por precio ascendente; su comportamiento real queda por verificar.
La ruta superior no termina en /camas: puede incluir categorías adicionales.
La herramienta web no pudo acceder al enlace; no se verificaron filtros nuevos,
conteos ni cobertura. No afirmar que incluye todos los productos o tamaños.

Mantener las cinco fuentes de camas existentes. Comparar separadamente la
categoría superior contra su unión, con paginación completa en ambas partes:
cobertura no es igualdad (puede haber colchones u otros artículos adicionales).
La comparación devuelve resultado desconocido si falta una fuente o es parcial.
Los exclusivos de la categoría se clasifican antes de incorporarlos; no extraer
automáticamente accesorios por pertenecer a esta categoría. No multiplicar
fuentes por orden de precio ni por combinaciones de filtros.

categoryUrl y categoryReferenceUrl registran la ampliación; compareCuracaoNcCategory
compara identidades ya extraídas, no realiza navegación. El lector DOM se ha
validado offline en la categoría superior p1 y en Camas p1/p2/p3; falta validar
las fichas y las fuentes por tamaño.

1. Recorrer principal y cuatro páginas por tamaño con adaptador NC. Capturar
   navegación real siguiente/cargar más y esperar cambio de productos. Registrar
   páginas visitadas, conteos y causa de fin; ciclos, timeout, bloqueo o límite
   de seguridad producen extracción incompleta, nunca éxito silencioso.
   `collectCuracaoNcPages` ya aporta el control de ciclo, límite, deduplicación y
   reporte incompleto, pero espera que un adaptador verificado le provea los
   productos y el siguiente enlace. `readCuracaoNcDom` ya lee el DOM cargado;
   la navegación/paginación real completa sigue pendiente.
2. SKU publicado cuando esté disponible; en su ausencia, usar la URL canónica
   completa como identidad provisional y conservarla como `productUrl`. No usar
   título, precio, imagen, `data-product-id` interno ni dígitos del slug para
   fusionar productos. Conservar procedencia en todas las fuentes. La cuadrícula
   MGZ de las rutas por tamaño no publica SKU; se usa fallback por URL y se avisa.
   Cuando una fuente publique SKU y otra sólo URL, comparar por URL canónica si
   ambas identidades conservan ese enlace. Si falta total/controles, la fuente
   sigue incompleta aunque todas las tarjetas observadas sean legibles.
3. Comparar principal contra unión de tamaños después de completar paginación.
   Informar coincidencias, exclusivos de principal y exclusivos de tamaños.
   Sólo afirmar igualdad cuando las cinco fuentes estén completas. La utilidad
   inicial compara identidades ya resueltas; no extrae ni certifica paginación.
4. Principal será única fuente de extracción sólo si evidencia real prueba
   cobertura; de lo contrario, unión sin duplicados. Una extracción parcial no
   reemplaza una publicación completa.
5. Validar país NC, ruta /nicaragua/ y moneda NIO/C$. Conservar precios regular
   y oferta por separado, descuento, cuotas, marca, tamaño, disponibilidad,
   imagen y URLs de origen. No interpretar cuotas como precio de contado ni
   asignar La Curacao como marca del fabricante. `parseCuracaoNcPrice` acepta
   sólo un importe explícito `C$`; rechaza valores sin símbolo, otras monedas o
   varios importes juntos. No decide cuál es precio regular/oferta: eso requiere
   campos DOM verificados y separados.
6. Campos de filtros opcionales: firmeza, plazas, color y material sólo cuando
   se publiquen; ausencia queda vacía. No recorrer cada combinación de filtros:
   paginar catálogo sin filtros y usar tamaños para verificar cobertura.
7. Reutilizar navegación/extracción compartida sólo tras separar filtros GT y
   moneda. El motor actual scrapeGenericGuatemalaStore no es apto para NC.

## Login y selección de país: requisito existente

SPEC-034 ya exige login -> elegir país asignado por administrador -> catálogo.
El selector del catálogo determina qué tiendas se ofrecen para consulta/ejecución;
la tienda tiene país fijo, el operador no reasigna una tienda GT a NC con un botón.
Cambiar país revalida permisos, limpia selección de tiendas y descarta respuestas
anteriores. API, trabajos, productos y CSV verifican país y permiso en backend.
Aplicar aislamiento regional y autenticación antes de habilitarla en pantalla.
No crear una spec duplicada de login ni dar por implementado un selector visual.

## Preparación publicada en ea417ed (antes del HTML aportado)

- src/scrapers/nc/la-curacao.ts: manifiesto de cinco fuentes, validación de URL
  regional, parser estricto de un precio `C$` y comparación de conjuntos con
  estado de completitud explícito.
- src/specs/la-curacao-nc.test.ts: duplicados, diferencias y fuentes parciales.
- src/scrapers/nc/pagination.ts y src/specs/la-curacao-nc-pagination.test.ts:
  recorrido inyectable, deduplicación por identidad, límite, ciclo, contenido
  parcial, página vacía y fallo de lectura; conserva páginas aportantes y reporta
  la URL fallida. Aún sin integración con el DOM real del sitio.
- Las comparaciones de cobertura exponen para cada identidad qué fuentes la
  incluyeron, incluida la categoría superior, sin declarar completitud si falta
  una fuente o la paginación quedó parcial. Recortan espacios accidentales en
  SKU/identidad sin cambiar mayúsculas ni fusionar por título/precio.
- src/scrapers/nc/product.ts: contrato de producto `NC/NIO` separado del CSV
  heredado GT; valida identidad, URL de producto, procedencia registrada y
  precios `C$` antes de normalizar. Incluye firmeza, plazas, color y material
  opcionales. No implementa persistencia ni conversión.
- Sin escrituras de base, nuevas dependencias, cambios GT ni habilitación NC.
- Los lectores de listado y ficha verifican precio regular/oferta, identidad
  SKU/URL canónica y paginación sobre HTML aportado. NC continúa fuera del
  ejecutor y no operativo.
- Validación local: `npm test` compiló y aprobó 86 pruebas Node (0 fallidas).

## Publicación y validación Ubuntu confirmadas

El commit `ea417ed` publicó los seis archivos de preparación NC. El usuario
confirmó un `git pull --ff-only` desde `5a9c2cd` hasta `ea417ed` en Ubuntu DEV;
ese avance incluye también el cierre documental de SPEC-038 y el código de
SPEC-042/043 previamente confirmado en `d89b97b`.

Salida de pruebas aportada por el usuario:

- Node: 86 aprobadas, 0 fallidas; ejecución de pruebas 1.848 s.
- Python: 137 aprobadas en 3.88 s; dos avisos de deprecación de dependencias
  TestClient/BlockingPortal. No son fallos de la suite.

Esto valida el código y sus casos simulados. No acredita extracción contra La
Curacao ni aplicación de la migración en la base DEV original. NC permanece
fuera del ejecutor y no hay cambio visual. No se solicitó reinicio PM2.

## Entrega local: lector DOM con muestra real — 2026-09-22

- `src/scrapers/nc/la-curacao-dom.ts`: lectura de tarjetas, SKU publicado,
  precio habitual/oferta, descuento, imagen y disponibilidad opcional JSON-LD.
  No deduce marca ni características individuales desde filtros/título.
- Verifica 24 tarjetas/24 SKU de 68 anunciados; 22 ofertas y 2 sólo habituales.
  Los enlaces de página 2/3 y el siguiente `?p=2` provienen del HTML recibido.
- Contrasta contador, tamaño seleccionado, página actual, ambos toolbars,
  secuencia y ruta del siguiente. Precios ambiguos, moneda ajena, SKU ausente,
  duplicados o tarjetas truncadas producen página parcial.
- `pagination.ts` requiere total estable e igualdad del total final con los
  SKU únicos cuando el lector provee contador; diferencias no son éxito.
- Fixture reducido en `src/specs/fixtures/la-curacao-nc/categoria-p1.html`:
  sin tokens, scripts ejecutables, acciones de formularios ni datos de sesión.
- `scripts/curacao-nc-offline.mjs`: informe de HTML local, JavaScript del sitio
  y red bloqueados; no consulta el sitio ni toca persistencia.
- `npm test`: 94 aprobadas. `npm run test:curacao-dom`: 15 aprobadas, 0 omitidas.
  Lectura del HTML completo: 0 incidencias; advertencia de imágenes guardadas
  como rutas locales, cuya URL pública no se inventa.
- La prueba de última página es sintética. No se afirma haber recibido o
  recorrido páginas 2/3 reales, ni se certifica equivalencia entre fuentes.
- Sigue local, sin commit/push/despliegue. NC no operativo, fuera de GT;
  base original y PROD intactas. Sin cambios de interfaz.

### Continuación: informe de páginas guardadas

`saved-pages.ts` y el modo `--pages` de `curacao-nc-offline.mjs` recorren capturas
locales de una fuente desde su página 1. Conservan huellas/procedencia y detectan
páginas ausentes, fuente/orden mezclados, URL repetida, conflictos SKU/URL, total
cambiante y capturas sobrantes. La URL grabada por el navegador se contrasta con
la declarada; su ausencia queda advertida. No consulta la web ni persiste datos.

Capturas reales adicionales de Camas, páginas 2 y 3: 23 y 6 SKU, 29 distintos
entre ambas. Falta página 1 de esa subcategoría. El HTML inicial de 24 de 68
SKU pertenece a la categoría superior Camas y Colchones, fuente diferente; no
se combina con las páginas nuevas para afirmar cobertura completa.

Siguiente: recibir las fuentes paginadas por tamaño.
Evidencia, límites y reproducción en `docs/SPEC-039_EVIDENCIA_DOM.md`.

### Actualización de evidencia — 2026-09-23

- Se recibieron y procesaron offline Camas p1/p2/p3. Cada página contiene
  tarjetas completas y enlaza la secuencia esperada, pero la unión tiene 53 SKU
  frente a 54 anunciados; `count_mismatch` continúa impidiendo certificar
  cobertura completa.
- Excepción manual de un solo lote: continuar el análisis con los 53 SKU y
  omitir el puesto 48 no observado. No cambia el colector ni la aceptación de
  futuras ejecuciones.
- `npm test`: 95 aprobadas; `npm run test:curacao-dom`: 15 aprobadas. Incluye
  regresión para no declarar completa una unión de 53/54.
- La consulta web directa devolvió 403 para la ficha y las cuatro rutas por
  tamaño. Se requieren HTML guardados para completar esa evidencia.
- No hay pantalla nueva de Nicaragua: login, país y UI siguen sujetos a sus
  specs regionales. No se activó NC, no se tocó PostgreSQL ni PROD.

### Ficha de producto real recibida — 2026-09-23

El usuario aportó el HTML guardado y la captura de la ficha **Set de Cama Serta
Queen Sleep True Confort Medio**, SKU `457989600019`. Se leyó offline con
JavaScript deshabilitado y todas las solicitudes de red abortadas. La página
publica precio regular C$40,440, oferta C$26,999, descuento 33%, moneda NIO,
stock `InStock`, marca Serta, plazas Queen, color Azul y tipo Set de Cama.
La cuota `12 cuotas de C$2,249.92` se conserva como texto informativo separado
del precio. Firmeza y material quedan vacíos porque no hay valores explícitos
en los atributos verificados. La imagen del HTML usa ruta local `*_files`; su
URL pública no se inventa y se informa advertencia.

Se añadió `src/scrapers/nc/la-curacao-product-dom.ts`: verifica URL canónica,
SKU frente a URL, identidad JSON-LD, precio final y habitual por separado,
moneda/precio de oferta JSON-LD, campos de marca coincidentes y atributos
publicados. No mezcla formularios/productos relacionados con el artículo
principal y nunca toma las cuotas como precio. El comando offline ahora acepta
`--product ficha.html URL_producto URL_fuente`.

Fixture reducido y pruebas en `src/specs/fixtures/la-curacao-nc/producto-serta.html`
y `src/specs/browser/la-curacao-nc-product.test.ts`; no se incluyó el HTML
completo ni su carpeta de recursos en el repositorio. `npm test`: 95/95;
`npm run test:curacao-dom`: 21/21; análisis del HTML completo: ficha completa,
0 incidencias y advertencia de imagen local. Los cambios son locales, sin
commit/push ni despliegue; no hubo acceso a PostgreSQL o PROD.

### Pendientes para completar SPEC-039

Se recibieron las páginas guardadas de Individuales (4 tarjetas), Queen (19),
King (14) y Matrimoniales (16). Suman 53 URL canónicas únicas, sin duplicados
entre tamaños; las 53 coinciden con la unión observada de Camas p1/p2/p3. El
usuario confirmó el 2026-09-23 que cada ruta termina en la página aportada. Esta
confirmación queda registrada como manual: ninguno de los cuatro HTML publica
contador, tamaño de página ni navegación siguiente/anterior, por lo que el
lector mantiene cobertura estructural no verificable.

La vista previa piloto `scripts/curacao-nc-pilot-preview.mjs` validó 53 productos
del HTML con el contrato NC y encontró cero errores y cero diferencias de
nombre/precio/descuento entre páginas. El comando `npm run pilot:curacao-nc --
.regional-validation/spec039-pilot-captures.json` sólo lee capturas locales,
con red y JavaScript bloqueados, y escribe el informe ignorado
`.regional-validation/spec039-pilot-preview.json`. No conecta a PostgreSQL ni
activa NC. La discrepancia de Camas (53 SKU frente a 54 anunciados) permanece
técnicamente `count_mismatch`; la excepción autorizada aplica sólo a este lote.
Las cuatro rutas por tamaño tienen confirmación manual de página final. Para
cerrar la comparación reproducible de la categoría superior
`/nicaragua/c/muebles/camas-y-colchones`, p2/p3 quedaron analizadas offline. P2:
23 tarjetas, 47/68, enlace a p3, SHA-256
`0c058b08aead1b5b7672a3f9b83728cb08806ead3b24ed5ccd5d094b2aab7c0f`. P3: 20
tarjetas, 68/68, sin siguiente, SHA-256
`3cb120ae56652569dfe4ea02eb59849263944fb0c6463936b85865ae198cd075`. Las tres
capturas combinadas extraen 67 productos únicos sin duplicados ni conflictos,
pero el contador anuncia 68 (`count_mismatch`). P1 es una captura anterior, por
lo que no se afirma que los tres HTML representen el mismo instante. No confundirla con
`/nicaragua/c/muebles/camas-y-colchones/camas`. No incorporar NC al ejecutor GT
ni persistir datos. La SPEC no introduce trabajo visual.
