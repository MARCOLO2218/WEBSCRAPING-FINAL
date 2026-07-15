CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS catalogo;

CREATE TABLE IF NOT EXISTS catalogo.scraping_runs (
    id BIGSERIAL PRIMARY KEY,
    run_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    semana_run INTEGER,
    semana_inicio DATE,
    started_at TIMESTAMP DEFAULT NOW(),
    source_process TEXT,
    total_products INTEGER
);

CREATE TABLE IF NOT EXISTS catalogo.productos_catalogo (
    id BIGSERIAL PRIMARY KEY,
    registro_uuid UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    run_id BIGINT REFERENCES catalogo.scraping_runs(id),
    run_uuid UUID,
    semana_run INTEGER,
    semana_inicio DATE,
    sitio_fuente TEXT,
    marca TEXT,
    linea TEXT,
    categoria TEXT,
    producto TEXT,
    disponibilidad TEXT,
    precio_regular TEXT,
    precio_oferta TEXT,
    descuento TEXT,
    cuotas TEXT,
    url_producto TEXT,
    url_fuente TEXT,
    titulo TEXT,
    descripcion TEXT,
    garantia TEXT,
    beneficios TEXT,
    url_imagen TEXT,
    texto_imagen TEXT,
    fecha_scraping TIMESTAMP,
    creado_en TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_productos_catalogo_fecha_id
ON catalogo.productos_catalogo (fecha_scraping DESC, id DESC);

CREATE INDEX IF NOT EXISTS ix_productos_catalogo_producto
ON catalogo.productos_catalogo (producto);

CREATE INDEX IF NOT EXISTS ix_scraping_runs_semana_inicio
ON catalogo.scraping_runs (semana_inicio);

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
