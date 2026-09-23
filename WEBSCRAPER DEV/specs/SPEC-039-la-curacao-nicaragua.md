# SPEC-039 — Primera tienda Nicaragua: La Curacao

Estado: En progreso. Manifiesto, validación del precio C$, comparación de
cobertura y control fail-closed de paginación preparados. Falta el adaptador DOM
real, resolver identidad de productos y validar publicación aislada por país.

## Alcance

Primera tienda NC/NIO: `la-curacao-nc`, nombre `La Curacao Nicaragua`.
Trabajar en src/scrapers/nc/; no registrarla en la ejecución GT ni persistir sus
precios en las tablas actuales sin aislamiento de SPEC-038.

## Fuentes y evidencia

Base https://www.lacuracaonline.com, rutas:

- /nicaragua/c/muebles/camas-y-colchones/camas (principal)
- /nicaragua/camas-individuales
- /nicaragua/camas-queen
- /nicaragua/camas-king
- /nicaragua/camas-matrimoniales

Capturas aportadas: principal muestra 24 de 53 resultados, tamaño de página
12/24/36 y filtros de firmeza, plazas, marca, color y material. Las páginas por
tamaño muestran precios C$. Son observaciones de las capturas, no conteos vivos.
Consulta web automatizada de los cinco enlaces: 403. La observación posterior en
navegador confirmó `?p=2` para Camas; aún no se verificaron en DOM los enlaces de
paginación, SKU, URL canónica ni igualdad de conjuntos. No asumir `?page=`.

### Observación en navegador — 2026-09-22

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
compara identidades ya extraídas, no realiza navegación. Extractor NC sigue pendiente.

1. Recorrer principal y cuatro páginas por tamaño con adaptador NC. Capturar
   navegación real siguiente/cargar más y esperar cambio de productos. Registrar
   páginas visitadas, conteos y causa de fin; ciclos, timeout, bloqueo o límite
   de seguridad producen extracción incompleta, nunca éxito silencioso.
   `collectCuracaoNcPages` ya aporta el control de ciclo, límite, deduplicación y
   reporte incompleto, pero espera que un adaptador verificado le provea los
   productos y el siguiente enlace; todavía no navega ni extrae el DOM.
2. SKU cuando esté disponible y URL canónica de producto como identidad. No usar
   título, precio o imagen para fusionar productos. SKU y URL se deben resolver
   consistentemente antes de comparar. Conservar procedencia en todas las fuentes.
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
Implementar SPEC-038 y autenticación antes de habilitar esta tienda en pantalla.
No crear una spec duplicada de login ni dar por implementado un selector visual.

## Entrega actual

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
- Falta verificar el DOM, separar precio regular/oferta desde campos confirmados,
  resolver identidad SKU/URL canónica y construir adaptador de extracción y
  paginación. NC continúa fuera del ejecutor y no operativo.
- Validación local: `npm test` compiló y aprobó 86 pruebas Node (0 fallidas).
