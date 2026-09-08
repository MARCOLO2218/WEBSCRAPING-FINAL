CREATE TABLE IF NOT EXISTS {schema}.catalog_display_snapshots (
        store_key TEXT PRIMARY KEY,
        run_id BIGINT NOT NULL,
        product_count INTEGER NOT NULL,
        locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        lock_until TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
