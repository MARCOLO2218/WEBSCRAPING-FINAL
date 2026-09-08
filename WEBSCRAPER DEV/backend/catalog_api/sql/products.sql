WITH preferred_store_runs AS (
        SELECT store_key, run_id
        FROM {schema}.catalog_display_snapshots
      )
      SELECT p.*
      FROM {schema}.productos_catalogo p
      INNER JOIN preferred_store_runs preferred
        ON preferred.store_key = CASE
          WHEN p.sitio_fuente LIKE 'La Colchoner%' THEN 'La Colchoneria Guatemala'
          ELSE p.sitio_fuente
        END
       AND preferred.run_id = p.run_id
      {where}
      ORDER BY p.id ASC
