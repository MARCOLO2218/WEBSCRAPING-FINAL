# SPEC-039 — Primera tienda Nicaragua: La Curacao

Estado: En progreso. Estructura y comparación de cobertura preparadas; extractor
real, paginación y publicación pendientes de validación.

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
Consulta web de los cinco enlaces: 403. No se verificaron DOM, SKU, parámetros
de paginación ni igualdad de conjuntos. No inventar selectores o asumir `?page=`.

## Diseño de extracción y aceptación pendiente

1. Recorrer principal y cuatro páginas por tamaño con adaptador NC. Capturar
   navegación real siguiente/cargar más y esperar cambio de productos. Registrar
   páginas visitadas, conteos y causa de fin; ciclos, timeout, bloqueo o límite
   de seguridad producen extracción incompleta, nunca éxito silencioso.
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
   asignar La Curacao como marca del fabricante.
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
  regional y comparación de conjuntos con estado de completitud explícito.
- src/specs/la-curacao-nc.test.ts: duplicados, diferencias y fuentes parciales.
- Sin escrituras de base, nuevas dependencias, cambios GT ni habilitación NC.
- Falta validar en navegador real y construir adaptador de extracción/paginación.
- Validación local: npm test, compilación y 78 pruebas Node aprobadas.
