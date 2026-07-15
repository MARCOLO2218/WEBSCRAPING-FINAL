CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE catalogo.productos_catalogo
ADD COLUMN IF NOT EXISTS registro_uuid UUID;

ALTER TABLE catalogo.scraping_runs
ADD COLUMN IF NOT EXISTS run_uuid UUID;

ALTER TABLE catalogo.scraping_runs
ADD COLUMN IF NOT EXISTS semana_run INTEGER;

ALTER TABLE catalogo.scraping_runs
ADD COLUMN IF NOT EXISTS semana_inicio DATE;

UPDATE catalogo.scraping_runs
SET run_uuid = gen_random_uuid()
WHERE run_uuid IS NULL;

WITH runs AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id ASC) AS semana
    FROM catalogo.scraping_runs
    WHERE semana_run IS NULL
)
UPDATE catalogo.scraping_runs sr
SET semana_run = runs.semana
FROM runs
WHERE sr.id = runs.id;

ALTER TABLE catalogo.scraping_runs
ALTER COLUMN run_uuid SET DEFAULT gen_random_uuid();

ALTER TABLE catalogo.scraping_runs
ALTER COLUMN run_uuid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_scraping_runs_run_uuid
ON catalogo.scraping_runs (run_uuid);

DROP INDEX IF EXISTS catalogo.ux_scraping_runs_semana_run;

CREATE INDEX IF NOT EXISTS ix_scraping_runs_semana_inicio
ON catalogo.scraping_runs (semana_inicio);

ALTER TABLE catalogo.productos_catalogo
ADD COLUMN IF NOT EXISTS run_uuid UUID;

ALTER TABLE catalogo.productos_catalogo
ADD COLUMN IF NOT EXISTS semana_run INTEGER;

ALTER TABLE catalogo.productos_catalogo
ADD COLUMN IF NOT EXISTS semana_inicio DATE;

UPDATE catalogo.productos_catalogo
SET registro_uuid = gen_random_uuid()
WHERE registro_uuid IS NULL;

ALTER TABLE catalogo.productos_catalogo
ALTER COLUMN registro_uuid SET DEFAULT gen_random_uuid();

ALTER TABLE catalogo.productos_catalogo
ALTER COLUMN registro_uuid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_productos_catalogo_registro_uuid
ON catalogo.productos_catalogo (registro_uuid);

UPDATE catalogo.productos_catalogo pc
SET
    run_uuid = sr.run_uuid,
    semana_run = sr.semana_run,
    semana_inicio = sr.semana_inicio
FROM catalogo.scraping_runs sr
WHERE pc.run_id = sr.id
  AND (pc.run_uuid IS NULL OR pc.semana_run IS NULL OR pc.semana_inicio IS NULL);

DROP INDEX IF EXISTS catalogo.ux_productos_catalogo_url_dia;

CREATE INDEX IF NOT EXISTS ix_productos_catalogo_fecha_id
ON catalogo.productos_catalogo (fecha_scraping DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_productos_catalogo_producto
ON catalogo.productos_catalogo (producto);

DROP VIEW IF EXISTS catalogo.v_catalogo_actual;

CREATE OR REPLACE VIEW catalogo.v_catalogo_actual AS
SELECT DISTINCT ON (url_producto)
    *
FROM catalogo.productos_catalogo
ORDER BY url_producto, fecha_scraping DESC, id DESC;

DROP VIEW IF EXISTS catalogo.v_productos_catalogo_ultimos_1000;

CREATE OR REPLACE VIEW catalogo.v_productos_catalogo_ultimos_1000 AS
SELECT
    id,
    run_id,
    semana_run,
    semana_inicio,
    sitio_fuente,
    marca,
    linea,
    categoria,
    producto,
    disponibilidad,
    precio_regular,
    precio_oferta,
    descuento,
    cuotas,
    url_producto,
    url_fuente,
    titulo,
    descripcion,
    garantia,
    beneficios,
    url_imagen,
    texto_imagen,
    fecha_scraping,
    creado_en,
    registro_uuid,
    run_uuid
FROM (
    SELECT *
    FROM catalogo.productos_catalogo
    ORDER BY id DESC
    LIMIT 1000
) ultimos
ORDER BY id ASC;

