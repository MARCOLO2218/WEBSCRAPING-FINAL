# Revisión del informe real SPEC-038

Informe aportado por el usuario: spec-038-origen-dev.json, capturado en Ubuntu
DEV el 2026-09-21 08:55:50 -06:00, revisión 037_countries.

## Hallazgos verificados

- 173772 productos, 241 filas de ejecuciones, 19 publicaciones, 2899 grupos.
- Sin anomalías de run_id/run_uuid según los controles del auditor.
- No hay ejecuciones vacías ni diferencias entre total_products y conteo observado.
- Todas las publicaciones referencian ejecuciones existentes.
- 20 nombres distintos de tienda: incluye dos representaciones del nombre de
  La Colchonería (una con mojibake); no equivale a 20 tiendas diferentes.
- Run 242 del 21 de septiembre registra 1634 productos.
- Sleep Gallery usa tanto sleepgalleryca.com/gt/ como paises.sleepgalleryca.com.
  En este último origen hay 1163 registros con host de producto sleepgalleryca.com
  y 20 registros repartidos en URLs inválidas, WhatsApp, Facebook, Instagram y
  YouTube (4 por grupo). Instagram incluye sleepgallerysv. Esto es evidencia
  ambigua, no prueba de que todas esas filas sean productos de El Salvador.
- Hay URLs sociales/no comerciales en otras tiendas y ejemplos fuera de camas
  en Cemaco, Elektra y Walmart. Calidad del contenido y país son controles distintos;
  no borrar ni corregir precios o productos como efecto secundario del backfill.

## Siguiente comprobación

La primera versión agrupaba por dominios y mostraba tres ejemplos por grupo.
Eso no garantiza que todas las rutas internas pertenezcan al mismo país.
Se amplía el mismo auditor readonly con conteos por tienda, ruta fuente y primer
segmento de URL de producto, recorriendo cada fila. Incluye detalle de las filas
del portal Sleep Gallery sin ruta de producto /gt/. URLs sin query/fragmento;
rutas fuente limitadas a 240 caracteres como en el informe original.
Los prefijos son evidencia, no asignación automática ni validación de moneda.

Reejecutar scripts/history-origin-dev.mjs después de publicar la ampliación y
descargar el nuevo JSON. No repetir baseline ni aplicar migraciones. Diseñar la
resolución de filas ambiguas antes de exigir NOT NULL y FK de país. Conservar IDs
y exigir la misma consistencia al momento de la migración, pues puede haber
ejecuciones nuevas desde el informe.
