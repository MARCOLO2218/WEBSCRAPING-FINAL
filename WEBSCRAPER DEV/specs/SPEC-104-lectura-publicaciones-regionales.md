# SPEC-104: lectura de publicaciones regionales

Estado: Preparado; ensayo PostgreSQL y activación pendientes.

## Contrato previo a implementación

El servidor podrá recibir un lector regional explícito. Sin inyección conserva
el comportamiento anterior. No se activa desde variables de ambiente implícitas.

- /api/products, /api/summary y /api/export.csv siguen siendo GT, con filtros
  semana, tienda, marca, categoría, disponibilidad y q, y modelo CatalogProduct.
- /api/latest-run conserva run_id, semana_run, semana_inicio, started_at y
  total_products. Agrega ejecucion_uuid para identificar ejecuciones sin ID
  numérico legacy; run_id será null en ellas. No inventa una semana histórica.
- /nicaragua-catalogo.json conserva version=1, country=NC, currency=NIO,
  scrapedAt, stores y products con el formato consumido por la página actual.
- Las filas proceden únicamente de productos unidos por tienda y ejecución
  a publicaciones del país. No selecciona automáticamente la ejecución más
  reciente ni inicializa o actualiza publicaciones durante una consulta.
- Las rutas conservan su guardia GT/NC y Cache-Control no-store.
- En modo regional, la descarga /output/comparacion_colchones.csv se genera
  desde la misma lectura GT en lugar de servir el archivo legacy.
- No hay fallback a catalogo ni al JSON de disco si falla el lector regional.
- Sólo datos comerciales: nunca devolver source_payload, contraseñas, sesiones
  ni datos de autenticación de usuarios.
- NC usa fechas UTC conservadas; no inventa fecha para históricos GT sin zona.
- El estado ok de stores describe la publicación conservada, no el resultado
  de un intento posterior fallido. El seguimiento de trabajos sigue en su cola.
  product_id NC se reconstruye con URL canónica porque la tabla migrada no
  conserva el identificador comercial del JSON original.
- Los precios FACENCO del Excel local se mantienen como complemento GT.
  No se utilizan como referencia NC.

## Aislamiento y pendientes

El lector requiere base DEV migrada y las dos fases 101. Lee dentro de una
transacción REPEATABLE READ READ ONLY; no ejecuta DDL ni DML.
La entrada del servidor y los servicios actuales no se modifican en esta fase.
Faltan cola recuperable, configuración separada, ensayo de contrato con sesión
y cambio de conexión posterior.

## Validación de preparación

Compilación TypeScript local correcta. No se ejecutaron tests ni consultas a
PostgreSQL desde el entorno local. El usuario confirmó permisos de escritura
en catalogocomercial_ensayo_101; se requiere aún validar el lector con esa base.
