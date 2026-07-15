CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS catalogo;

ALTER TABLE catalogo.productos_catalogo
ADD COLUMN IF NOT EXISTS precio_regular_min NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS precio_regular_max NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS precio_oferta_min NUMERIC(12,2),
ADD COLUMN IF NOT EXISTS precio_oferta_max NUMERIC(12,2);

CREATE OR REPLACE FUNCTION catalogo.extraer_precios_gtq(texto TEXT)
RETURNS NUMERIC[]
LANGUAGE plpgsql
AS $$
DECLARE
    m TEXT[];
    precios NUMERIC[] := ARRAY[]::NUMERIC[];
    limpio TEXT;
BEGIN
    IF texto IS NULL OR btrim(texto) = '' OR lower(btrim(texto)) IN ('-', 'n/a', 'na', 'null', 'undefined') THEN
        RETURN precios;
    END IF;

    FOR m IN
        SELECT regexp_matches(texto, '(?:Q|GTQ)?\s*\d[\d,]*(?:\.\d+)?', 'gi')
    LOOP
        limpio := regexp_replace(regexp_replace(m[1], '(Q|GTQ|\s)', '', 'gi'), ',', '', 'g');
        limpio := regexp_replace(limpio, '[^0-9\.-]', '', 'g');
        IF limpio <> '' AND limpio <> '-' THEN
            precios := array_append(precios, limpio::NUMERIC);
        END IF;
    END LOOP;

    RETURN precios;
END;
$$;

UPDATE catalogo.productos_catalogo
SET
    precio_regular_min = CASE WHEN cardinality(catalogo.extraer_precios_gtq(precio_regular)) > 0 THEN (SELECT MIN(x) FROM unnest(catalogo.extraer_precios_gtq(precio_regular)) x) ELSE NULL END,
    precio_regular_max = CASE WHEN cardinality(catalogo.extraer_precios_gtq(precio_regular)) > 0 THEN (SELECT MAX(x) FROM unnest(catalogo.extraer_precios_gtq(precio_regular)) x) ELSE NULL END,
    precio_oferta_min = CASE WHEN cardinality(catalogo.extraer_precios_gtq(precio_oferta)) > 0 THEN (SELECT MIN(x) FROM unnest(catalogo.extraer_precios_gtq(precio_oferta)) x) ELSE NULL END,
    precio_oferta_max = CASE WHEN cardinality(catalogo.extraer_precios_gtq(precio_oferta)) > 0 THEN (SELECT MAX(x) FROM unnest(catalogo.extraer_precios_gtq(precio_oferta)) x) ELSE NULL END
WHERE precio_regular_min IS NULL
   OR precio_regular_max IS NULL
   OR precio_oferta_min IS NULL
   OR precio_oferta_max IS NULL;

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
    precio_regular_min,
    precio_regular_max,
    precio_oferta_min,
    precio_oferta_max,
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
