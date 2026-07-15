TRUNCATE TABLE catalogo.productos_catalogo RESTART IDENTITY CASCADE;
TRUNCATE TABLE catalogo.scraping_runs RESTART IDENTITY CASCADE;

SELECT 'productos_catalogo' AS tabla, COUNT(*) AS filas
FROM catalogo.productos_catalogo
UNION ALL
SELECT 'scraping_runs' AS tabla, COUNT(*) AS filas
FROM catalogo.scraping_runs;
