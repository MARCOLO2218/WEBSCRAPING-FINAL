# Contratos actuales de la API

## Alcance

Este documento registra el comportamiento observable del servidor Node en
`src/catalog-server.ts` antes de migrarlo gradualmente a FastAPI. Describe el
contrato actual; no convierte todas sus particularidades en decisiones de diseno
permanentes.

## Convenciones comunes

- URL base local: `http://localhost:3030`, salvo que `CATALOG_PORT` defina otro puerto.
- Las respuestas JSON usan `Content-Type: application/json; charset=utf-8`.
- Los endpoints de lectura responden `200` cuando la operacion termina correctamente.
- Una excepcion no controlada responde `500` con:

```json
{
  "error": "No se pudo cargar el catalogo. Revisa conexion PostgreSQL y archivo .env."
}
```

- Actualmente solo `/api/run-scraper` valida el metodo HTTP. Los demas endpoints se
  resuelven por ruta y aceptan de hecho cualquier metodo. Esta particularidad debe
  revisarse expresamente al definir OpenAPI, no cambiarse de forma accidental.
- No existe autenticacion ni versionado de API en esta etapa.
- Las fechas generadas por la cola se expresan como cadenas ISO 8601 en UTC.

## Modelo de producto

`CatalogProduct` contiene las columnas persistidas de `productos_catalogo` y tres
campos calculados. Los campos que no tienen dato se entregan como `null`; los cuatro
rangos numericos pueden estar ausentes en filas antiguas de base de datos.

| Campo | Tipo JSON |
|---|---|
| `id` | string |
| `run_id` | string o null |
| `semana_run` | number o null |
| `semana_inicio` | string o null |
| `sitio_fuente` | string o null |
| `marca` | string o null |
| `linea` | string o null |
| `categoria` | string o null |
| `producto` | string o null |
| `disponibilidad` | string o null |
| `precio_regular` | string o null |
| `precio_oferta` | string o null |
| `precio_regular_min` | number, null o ausente |
| `precio_regular_max` | number, null o ausente |
| `precio_oferta_min` | number, null o ausente |
| `precio_oferta_max` | number, null o ausente |
| `descuento` | string o null |
| `cuotas` | string o null |
| `url_producto` | string o null |
| `url_fuente` | string o null |
| `titulo` | string o null |
| `descripcion` | string o null |
| `garantia` | string o null |
| `beneficios` | string o null |
| `url_imagen` | string o null |
| `texto_imagen` | string o null |
| `fecha_scraping` | string o null |
| `creado_en` | string o null |
| `registro_uuid` | string o null |
| `run_uuid` | string o null |
| `precio_numero` | number o null |
| `diferencia_facenco` | number o null |
| `etiqueta_diferencia` | `Mas barato`, `Mas caro`, `Igual a FACENCO` o `Sin referencia` |

## Filtros compartidos

`/api/products`, `/api/summary` y `/api/export.csv` aceptan los mismos parametros
opcionales. Los filtros se combinan con AND y no tienen paginacion.

| Parametro | Comportamiento |
|---|---|
| `semana` | Igualdad exacta contra `semana_run` convertido a texto. |
| `tienda` | Igualdad exacta contra `sitio_fuente`. |
| `marca` | Igualdad exacta contra `marca`. |
| `categoria` | Igualdad exacta contra `categoria`. |
| `disponibilidad` | Igualdad exacta contra `disponibilidad`. |
| `q` | Coincidencia parcial, sin distinguir mayusculas, en producto, marca o tienda. |

La lectura aplica el snapshot publicado por tienda, protegido por tres horas, y
complementa o agrega filas FACENCO desde `data/precios_facenco.xlsx` cuando existe.

## GET /api/products

Devuelve `200` y un arreglo JSON de `CatalogProduct`, ordenado por `id` ascendente.
Sin coincidencias devuelve `[]`.

## GET /api/latest-run

Devuelve `200` y la ejecucion con mayor `id`, o `null` si no existe ninguna:

```json
{
  "run_id": "123",
  "semana_run": 36,
  "semana_inicio": "2026-08-31",
  "started_at": "2026-09-03T14:00:00.000Z",
  "total_products": 450
}
```

Los tipos concretos de valores PostgreSQL pueden depender de su parser; en
particular un `BIGINT` como `run_id` normalmente se serializa como string.

## GET /api/image

Requiere el parametro `url` con protocolo HTTP o HTTPS. Actua como proxy y devuelve
los bytes con el `Content-Type` del proveedor y `Cache-Control: public,
max-age=86400`.

| Resultado | Estado | Cuerpo |
|---|---:|---|
| Falta `url` | 400 | Texto `Falta URL de imagen` |
| URL invalida | 400 | Texto `URL de imagen invalida` |
| Protocolo distinto de HTTP(S) | 400 | Texto `Protocolo de imagen no permitido` |
| Proveedor responde sin exito | 502 | Texto `No se pudo cargar la imagen del proveedor` |
| Exito | 200 | Cuerpo binario de la imagen |

La solicitud al proveedor expira a los 15 segundos. Otros fallos terminan en el
error JSON generico `500`.

## POST /api/run-scraper

Acepta JSON opcional con una lista de nombres de tienda:

```json
{ "stores": ["FACENCO", "Siman Guatemala"] }
```

Los nombres validos se normalizan contra el catalogo central, sin distinguir
mayusculas, se eliminan duplicados y se conserva el orden solicitado. Entradas
desconocidas se descartan. Un cuerpo ausente, invalido, con `stores` que no sea un
arreglo, o sin tiendas validas equivale a ejecutar todas las tiendas. El lector
limita el cuerpo aproximadamente a 50 000 caracteres.

Devuelve `202` al aceptar el trabajo:

```json
{
  "ok": true,
  "accepted": true,
  "job": {
    "id": "1788444000000-abc123",
    "status": "queued",
    "createdAt": "2026-09-03T14:00:00.000Z",
    "stores": ["FACENCO", "Siman Guatemala"],
    "queuePosition": 1
  }
}
```

El proceso puede empezar antes de serializar la respuesta; por eso `status` puede
ser `queued` o `running` y `queuePosition` puede ser `0`.

## Modelo de trabajo del scraper

| Campo | Tipo y presencia |
|---|---|
| `id` | string, siempre |
| `status` | `queued`, `running`, `done` o `error`, siempre |
| `createdAt` | string ISO 8601, siempre |
| `startedAt` | string ISO 8601, desde que inicia |
| `finishedAt` | string ISO 8601, al terminar |
| `ok` | boolean, al terminar |
| `output` | string, durante o despues de ejecutar |
| `stores` | arreglo de string, siempre en trabajos creados por la API |
| `queuePosition` | number; empieza en 1 en cola y vale 0 fuera de ella |

Los trabajos viven en memoria. Se conservan como maximo 50 trabajos terminados y
se pierden al reiniciar el servidor.

## GET /api/scraper-job?id={id}

Con un identificador existente devuelve `200`:

```json
{ "ok": true, "job": { "id": "...", "status": "running", "queuePosition": 0 } }
```

Si falta el parametro o no existe el trabajo, devuelve `404`:

```json
{ "ok": false, "error": "No se encontro la solicitud del scraper." }
```

## GET /api/scraper-status

Devuelve `200` con el estado global de la cola:

```json
{
  "running": false,
  "queueSize": 0,
  "currentJobId": null,
  "currentJob": null,
  "queuedJobs": [],
  "jobsInOrder": [],
  "lastJob": null
}
```

`queueSize` incluye el trabajo en ejecucion. `jobsInOrder` contiene primero el
trabajo actual y luego los pendientes. `lastJob` es el ultimo trabajo terminado,
con exito o error.

## GET /api/summary

Acepta los filtros compartidos y devuelve `200`:

```json
{
  "total": 450,
  "precio_promedio": 2199.5,
  "mas_baratos": 12,
  "mas_caros": 28,
  "tiendas": 19
}
```

`precio_promedio` vale `null` cuando no hay precios numericos. Los conteos se
calculan sobre los productos ya filtrados y publicados.

## GET /api/export.csv

Acepta los filtros compartidos. Devuelve `200`, UTF-8 con BOM, `Content-Type:
text/csv; charset=utf-8` y descarga `catalogo_comercial_comparativo.csv`.

Las columnas, en orden, son: `id`, `run_id`, `semana_run`, `semana_inicio`,
`sitio_fuente`, `marca`, `categoria`, `producto`, `precio_regular`,
`precio_oferta`, `precio_regular_min`, `precio_regular_max`, `precio_oferta_min`,
`precio_oferta_max`, `diferencia_facenco`, `etiqueta_diferencia`,
`disponibilidad`, `fecha_scraping`, `registro_uuid`, `run_uuid`.

Todos los valores se escriben entre comillas dobles y las comillas internas se
duplican.

## Ruta de compatibilidad fuera de `/api`

`GET /output/comparacion_colchones.csv` descarga el archivo generado por el scraper
como `comparacion_colchones.csv` cuando existe. Si no existe, la solicitud cae al
servidor de archivos estaticos y responde `404 Not found`.

## Consumidores actuales

El frontend `public/app.js` consume `/api/products`, `/api/latest-run`,
`/api/image`, `/api/run-scraper`, `/api/scraper-job` y `/api/scraper-status`.
`/api/summary` y `/api/export.csv` forman parte del servidor aunque el frontend
actual calcula sus metricas y exportacion principalmente en el navegador.
