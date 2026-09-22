# SPEC-038: clasificación integral y modelo candidato

## Resultado local sobre evidencia recibida

El informe detallado del 21 de septiembre contiene 178723 filas y 244 ejecuciones.
De las 507 excepciones detalladas del portal Sleep Gallery, las reglas actuales
identifican 377 productos SV, 122 enlaces de navegación/redes y 8 filas pendientes
(URL ausente/malformada). Ninguna fila fue borrada, actualizada ni publicada.
Este resultado sólo corresponde al subconjunto con detalle completo del informe.
El resto del historial necesita ejecución del plan sobre las filas PostgreSQL,
pues los informes anteriores sólo muestran muestras de URLs y no todos los precios.

## Decisión de arquitectura complementaria

Una ejecución histórica no tiene necesariamente país único. El esquema candidato
asocia scraping_runs con paises mediante scraping_run_paises. Productos y
publicaciones referencian el par ejecución/país. Publicación usa país/tienda como
clave. Pendientes y enlaces permanecen identificados, con país NULL, sin país
ficticio y sin borrado de IDs. La API regional futura sólo publicará filas
asignadas y países habilitados/autorizados. Los workers nuevos tendrán país
explícito. No se puede usar run_id como permiso para leer todos sus productos.

regional_schema.py es un contrato mínimo aislado para pruebas de restricciones,
no un reemplazo de los modelos históricos ni una migración ejecutable. Las tablas
reales conservan todos sus campos adicionales (precios, UUID, fechas, bloqueos).
No importar este metadata en Alembic ni llamar create_all en la base DEV.

## Herramienta nueva

Ampliación de diagnóstico: `node scripts/regional-plan-dev.mjs --details`.
Incluye nombre de producto y precios originales, URLs sin credenciales/query/
fragmentos y conteo por tienda/motivo. Separa las muestras de filas publicadas
de las históricas; hasta tres casos distintos de cada clase (primero y últimos
dos por ID). Los conteos no se limitan ni deduplican. No cambia clasificación.
El formato de plan pasa a 2 al añadir producto a la evidencia/huella; comparar
huellas sólo entre informes del mismo formato y reglas. Sin --details se conserva
la salida resumida. No existe flag --apply; no se modifica base, Excel ni PROD.

`node scripts/regional-plan-dev.mjs` usa PostgreSQL readonly y REPEATABLE READ,
clasifica todas las filas en lotes y devuelve resumen por motivo, país y tienda,
ejecuciones mixtas, revisión de publicaciones y huella de la evidencia usada.
No tiene --apply. La huella no sustituye revalidación bajo transacción al migrar.
No cambia el baseline ni la revisión 037. No requiere reiniciar PM2.

Los dominios genéricos necesitan nombre/origen conocido y moneda concordante;
ausencias o conflictos quedan pendientes. Los dominios/rutas nacionales conocidos
aportan evidencia más fuerte. Clasificación de país no es validación de categoría
comercial: un artículo fuera de camas no se elimina en esta etapa.

## Ubuntu DEV (después de publicar archivos)

```bash
(
  cd "/home/administradorgt/WEBSCRAPING-FINAL" || exit 1
  git pull --ff-only || exit 1
  cd "WEBSCRAPER DEV" || exit 1
  node scripts/regional-plan-dev.mjs > /tmp/spec-038-plan-integral.json || {
    cat /tmp/spec-038-plan-integral.json
    exit 1
  }
  cat /tmp/spec-038-plan-integral.json
)
```

## Siguiente etapa

Revisar resumen de todos los registros y publicaciones. Resolver reglas que faltan
con evidencia, conservar pendientes para revisión y diseñar migración transaccional
con su política de acceso. Adaptar DDL heredado, workers y lectores Node/FastAPI
antes de ejecutar esa migración. SPEC-038 continúa En progreso; login y Nuxt aún
no están implementados. PROD no forma parte de esta entrega.

## Si la lectura parece detenida

El CLI ahora escribe progreso a stderr, visible aunque stdout se redirija a JSON:
fases, segundos y productos revisados cada 2000 filas. No es un heartbeat durante
esperas de PostgreSQL. Ctrl+C cancela el informe; el aviso de cancelación fallida
observado no demuestra por sí solo que PostgreSQL se haya caído.
Usar un archivo temporal y renombrarlo sólo si el comando termina con código 0.
El informe de muestras de be5eb58 quedó interrumpido; sigue pendiente recibirlo.
No repetir baseline, aplicar migraciones ni reiniciar PM2 para este diagnóstico.

## Resolución de pendientes — reglas 038-origin-v2

La revisión de muestras confirmó tres señales seguras adicionales: precios
embebidos con texto comercial siguen demostrando GTQ cuando contienen `Q` junto
a una cifra; las rutas raíz de Mattress sin producto son navegación/filtros; y
las rutas `account`/`pages` de Beds & Dreams son navegación. FACENCO sin precio,
Sleep Gallery con ruta no verificable y URLs inválidas permanecen en `revision`.
Las reglas sólo asignan GT cuando coinciden dominio/origen y moneda; no usan el
nombre de la tienda como evidencia única. La nueva huella de reglas es
`038-origin-v2` y debe validarse con un informe completo en Ubuntu antes de
cerrar la spec.
