WITH product_runs AS (
        SELECT
          CASE
            WHEN p.sitio_fuente LIKE 'La Colchoner%' THEN 'La Colchoneria Guatemala'
            ELSE p.sitio_fuente
          END AS store_key,
          p.run_id,
          COUNT(*)::INTEGER AS product_count,
          MAX(COALESCE(sr.started_at, p.fecha_scraping, p.creado_en)) AS run_time
        FROM {schema}.productos_catalogo p
        LEFT JOIN {schema}.scraping_runs sr ON sr.id = p.run_id
        WHERE p.sitio_fuente IS NOT NULL
          AND p.run_id IS NOT NULL
        GROUP BY 1, p.run_id
      ),
      latest_store_times AS (
        SELECT store_key, MAX(run_time) AS latest_time
        FROM product_runs
        GROUP BY store_key
      ),
      ranked AS (
        SELECT
          pr.*,
          ROW_NUMBER() OVER (
            PARTITION BY pr.store_key
            ORDER BY pr.product_count DESC, pr.run_time DESC, pr.run_id DESC
          ) AS preference
        FROM product_runs pr
        INNER JOIN latest_store_times latest
          ON latest.store_key = pr.store_key
        WHERE pr.run_time >= latest.latest_time - INTERVAL '3 hours'
      )
      INSERT INTO {schema}.catalog_display_snapshots (
        store_key, run_id, product_count, locked_at, lock_until, updated_at
      )
      SELECT store_key, run_id, product_count, NOW(), NOW() + INTERVAL '3 hours', NOW()
      FROM ranked
      WHERE preference = 1
      ON CONFLICT (store_key) DO NOTHING
