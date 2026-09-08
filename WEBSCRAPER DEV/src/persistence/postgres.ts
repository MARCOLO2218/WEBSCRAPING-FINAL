import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { toNullableProductText as toDbNullable, type CsvProduct } from '../domain/product.js';

export type DbConfig = {
  enabled: boolean;
  schema: string;
  missing: string[];
};

export function getDbConfig(): DbConfig {
  const schema = process.env.PGSCHEMA || 'catalogo';
  const requiredEnvVars = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'];
  const missing = requiredEnvVars.filter((name) => !process.env[name]);

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error('PGSCHEMA solo puede usar letras, numeros y guion bajo, y no puede iniciar con numero.');
  }

  return {
    enabled: missing.length === 0,
    schema,
    missing,
  };
}

function createDbPool(): Pool {
  const sslEnabled = (process.env.PGSSL || '').toLowerCase() === 'true';

  return new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  });
}

function getGuatemalaWeekStart(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  const guatemalaDate = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = guatemalaDate.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  guatemalaDate.setUTCDate(guatemalaDate.getUTCDate() - daysSinceMonday);

  return guatemalaDate.toISOString().slice(0, 10);
}

async function ensurePostgresTables(client: PoolClient, schema: string): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.scraping_runs (
      id BIGSERIAL PRIMARY KEY,
      run_uuid UUID,
      semana_run INTEGER,
      semana_inicio DATE,
      started_at TIMESTAMP DEFAULT NOW(),
      source_process TEXT,
      total_products INTEGER
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.productos_catalogo (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT REFERENCES ${schema}.scraping_runs(id),
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
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${schema}.catalog_display_snapshots (
      store_key TEXT PRIMARY KEY,
      run_id BIGINT NOT NULL,
      product_count INTEGER NOT NULL,
      locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lock_until TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`ALTER TABLE ${schema}.scraping_runs ADD COLUMN IF NOT EXISTS run_uuid UUID`);
  await client.query(`ALTER TABLE ${schema}.scraping_runs ADD COLUMN IF NOT EXISTS semana_run INTEGER`);
  await client.query(`ALTER TABLE ${schema}.scraping_runs ADD COLUMN IF NOT EXISTS semana_inicio DATE`);
  await client.query(`ALTER TABLE ${schema}.productos_catalogo ADD COLUMN IF NOT EXISTS registro_uuid UUID`);
  await client.query(`ALTER TABLE ${schema}.productos_catalogo ADD COLUMN IF NOT EXISTS run_uuid UUID`);
  await client.query(`ALTER TABLE ${schema}.productos_catalogo ADD COLUMN IF NOT EXISTS semana_run INTEGER`);
  await client.query(`ALTER TABLE ${schema}.productos_catalogo ADD COLUMN IF NOT EXISTS semana_inicio DATE`);
  await client.query(`ALTER TABLE ${schema}.productos_catalogo ADD COLUMN IF NOT EXISTS precio_regular_min NUMERIC(12,2)`);
  await client.query(`ALTER TABLE ${schema}.productos_catalogo ADD COLUMN IF NOT EXISTS precio_regular_max NUMERIC(12,2)`);
  await client.query(`ALTER TABLE ${schema}.productos_catalogo ADD COLUMN IF NOT EXISTS precio_oferta_min NUMERIC(12,2)`);
  await client.query(`ALTER TABLE ${schema}.productos_catalogo ADD COLUMN IF NOT EXISTS precio_oferta_max NUMERIC(12,2)`);
  await client.query(`DROP INDEX IF EXISTS ${schema}.ux_productos_catalogo_url_dia`);
  await client.query(`DROP INDEX IF EXISTS ${schema}.ux_scraping_runs_semana_run`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_scraping_runs_run_uuid ON ${schema}.scraping_runs (run_uuid)`);
  await client.query(`CREATE INDEX IF NOT EXISTS ix_scraping_runs_semana_inicio ON ${schema}.scraping_runs (semana_inicio)`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_productos_catalogo_registro_uuid ON ${schema}.productos_catalogo (registro_uuid)`);
  await client.query(`CREATE INDEX IF NOT EXISTS ix_productos_catalogo_fecha_id ON ${schema}.productos_catalogo (fecha_scraping DESC, id DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS ix_productos_catalogo_producto ON ${schema}.productos_catalogo (producto)`);
}

export async function saveProductsToPostgres(rows: CsvProduct[]): Promise<void> {
  const config = getDbConfig();

  if (!config.enabled) {
    console.log(`PostgreSQL no configurado. Faltan variables: ${config.missing.join(', ')}`);
    console.log('Se omite guardado en base de datos.');
    return;
  }

  const pool = createDbPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await ensurePostgresTables(client, config.schema);

    const runUuid = randomUUID();
    const weekStart = getGuatemalaWeekStart();
    const weekResult = await client.query<{ semana_run: string }>(
      `SELECT COALESCE(
         (SELECT semana_run FROM ${config.schema}.scraping_runs WHERE semana_inicio = $1 ORDER BY id ASC LIMIT 1),
         (SELECT COALESCE(MAX(semana_run), 0) + 1 FROM ${config.schema}.scraping_runs)
       ) AS semana_run`,
      [weekStart],
    );
    const runWeek = Number(weekResult.rows[0]?.semana_run ?? 1);

    const runResult = await client.query<{ id: string }>(
      `INSERT INTO ${config.schema}.scraping_runs (run_uuid, semana_run, semana_inicio, source_process, total_products)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [runUuid, runWeek, weekStart, 'typescript-scraper-camas', rows.length],
    );
    const runId = runResult.rows[0]?.id;

    const insertSql = `
      INSERT INTO ${config.schema}.productos_catalogo (
        registro_uuid,
        run_uuid,
        semana_run,
        semana_inicio,
        run_id,
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
        fecha_scraping
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24
      )
    `;

    let insertedRows = 0;

    for (const row of rows) {
      const result = await client.query(insertSql, [
        randomUUID(),
        runUuid,
        runWeek,
        weekStart,
        runId,
        toDbNullable(row.source_site),
        toDbNullable(row.brand),
        toDbNullable(row.line),
        toDbNullable(row.category),
        toDbNullable(row.product_name),
        toDbNullable(row.availability),
        toDbNullable(row.regular_price),
        toDbNullable(row.sale_price),
        toDbNullable(row.discount),
        toDbNullable(row.installment),
        toDbNullable(row.product_url),
        toDbNullable(row.source_url),
        toDbNullable(row.headline),
        toDbNullable(row.description),
        toDbNullable(row.warranty),
        toDbNullable(row.benefits),
        toDbNullable(row.image_url),
        toDbNullable(row.image_alt),
        toDbNullable(row.scraped_at),
      ]);

      if (result.rowCount && result.rowCount > 0) {
        insertedRows += result.rowCount;
      }
    }

    const storeCounts = new Map<string, number>();
    for (const row of rows) {
      const storeKey = row.source_site.startsWith('La Colchoner')
        ? 'La Colchoneria Guatemala'
        : row.source_site;
      storeCounts.set(storeKey, (storeCounts.get(storeKey) || 0) + 1);
    }

    let publishedStores = 0;
    for (const [storeKey, productCount] of storeCounts) {
      const publication = await client.query(`
        INSERT INTO ${config.schema}.catalog_display_snapshots (
          store_key, run_id, product_count, locked_at, lock_until, updated_at
        )
        VALUES ($1, $2, $3, NOW(), NOW() + INTERVAL '3 hours', NOW())
        ON CONFLICT (store_key) DO UPDATE SET
          run_id = EXCLUDED.run_id,
          product_count = EXCLUDED.product_count,
          locked_at = NOW(),
          lock_until = NOW() + INTERVAL '3 hours',
          updated_at = NOW()
        WHERE ${config.schema}.catalog_display_snapshots.lock_until <= NOW()
           OR EXCLUDED.product_count > ${config.schema}.catalog_display_snapshots.product_count
      `, [storeKey, runId, productCount]);
      publishedStores += publication.rowCount || 0;
    }

    await client.query('COMMIT');
    console.log(`Run ID de esta consulta: Semana ${runWeek} (run_id ${runId})`);
    console.log(`Inicio de semana: ${weekStart}`);
    console.log(`UUID tecnico de esta consulta: ${runUuid}`);
    console.log(`PostgreSQL actualizado: ${insertedRows} productos insertados.`);
    if (publishedStores > 0) {
      console.log(
        `Catalogo visible actualizado: ${publishedStores} tienda(s) vencieron la llave `
        + 'o publicaron una cantidad mayor de productos.',
      );
    } else {
      console.log(
        `Llave de 3 horas activa: los ${insertedRows} productos fueron guardados, `
        + 'pero 0 tiendas cambiaron el catalogo visible.',
      );
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
