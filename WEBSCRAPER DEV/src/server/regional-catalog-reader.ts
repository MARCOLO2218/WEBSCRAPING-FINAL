import type { Pool, PoolClient } from 'pg';
import type { CatalogProduct, DbProduct } from '../domain/product.js';
import { NC_EXECUTION_STORES, normalizeNcProducts, type NcStoreKey } from '../scrapers/nc/execution.js';
import { loadFacencoPriceRows, mergeFacencoExcelRows, withPriceComparison } from './catalog-service.js';

export type RegionalCatalogReader = {
  getProducts: (params: URLSearchParams) => Promise<CatalogProduct[]>;
  latestRun: () => Promise<unknown>;
  ncSnapshot: () => Promise<unknown>;
};

const FIELDS = ['id', 'run_id', 'semana_run', 'semana_inicio', 'sitio_fuente', 'marca', 'linea',
  'categoria', 'producto', 'disponibilidad', 'precio_regular', 'precio_oferta', 'precio_regular_min',
  'precio_regular_max', 'precio_oferta_min', 'precio_oferta_max', 'descuento', 'cuotas', 'url_producto',
  'url_fuente', 'titulo', 'descripcion', 'garantia', 'beneficios', 'url_imagen', 'texto_imagen',
  'fecha_scraping', 'creado_en', 'registro_uuid', 'run_uuid', 'pais_codigo', 'moneda'] as const;
const NUMBERS = ['precio_regular_min', 'precio_regular_max', 'precio_oferta_min', 'precio_oferta_max'] as const;
const text = (value: unknown) => value == null ? '' : String(value);
const utc = (value: unknown): string | null => value == null ? null
  : (value instanceof Date ? value : new Date(String(value))).toISOString();

function product(row: DbProduct): DbProduct {
  const result = { ...row, id: String(row.id), run_id: row.run_id == null ? null : String(row.run_id) };
  for (const key of NUMBERS) {
    const value = row[key];
    if (value == null) result[key] = null;
    else {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error('Importe regional inválido.');
      result[key] = number;
    }
  }
  return result;
}

export function createRegionalCatalogReader(pool: Pool): RegionalCatalogReader {
  const read = async <T>(operation: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='20s'");
      const identity = await client.query('SELECT current_database() AS database,current_user AS role');
      if (!['webscraper_dev', 'catalogocomercial_ensayo_101'].includes(identity.rows[0]?.database)
        || identity.rows[0]?.role !== 'webscraper_user') {
        throw new Error('Lectura regional requiere base DEV migrada.');
      }
      const phases = await client.query(`SELECT fase FROM administracion.migraciones_ensayo
        WHERE fase IN ('101_administracion','101_comercial')`);
      if (phases.rowCount !== 2) throw new Error('Fases regionales incompletas.');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  };

  return {
    async getProducts(params) {
      const values: string[] = [];
      const filters: string[] = [];
      for (const [key, column] of [['semana', 'p.semana_run::text'], ['tienda', 'p.sitio_fuente'],
        ['marca', 'p.marca'], ['categoria', 'p.categoria'], ['disponibilidad', 'p.disponibilidad']]) {
        const value = params.get(key);
        if (value) { values.push(value); filters.push(`${column}=$${values.length}`); }
      }
      const query = params.get('q');
      if (query) {
        values.push(`%${query}%`);
        filters.push(`(p.producto ILIKE $${values.length} OR p.marca ILIKE $${values.length}
          OR p.sitio_fuente ILIKE $${values.length})`);
      }
      const rows = await read(async client => (await client.query<DbProduct>(`
        SELECT ${FIELDS.map(field => `p.${field}`).join(',')}
        FROM guatemala.productos p JOIN guatemala.publicaciones s
          ON s.store_key=p.store_key AND s.ejecucion_uuid=p.ejecucion_uuid
        WHERE p.pais_codigo='GT' AND p.moneda='GTQ'
        ${filters.length ? `AND ${filters.join(' AND ')}` : ''} ORDER BY p.id`, values)).rows.map(product));
      return withPriceComparison(mergeFacencoExcelRows(rows, await loadFacencoPriceRows(rows)));
    },
    async latestRun() {
      return read(async client => (await client.query(`
        SELECT e.legacy_run_id AS run_id,e.id AS ejecucion_uuid,
          (SELECT max(p.semana_run) FROM guatemala.productos p WHERE p.ejecucion_uuid=e.id) AS semana_run,
          (SELECT max(p.semana_inicio) FROM guatemala.productos p WHERE p.ejecucion_uuid=e.id) AS semana_inicio,
          coalesce(e.inicio::text,e.inicio_original::text,e.observada_en::text) AS started_at,
          e.total_productos AS total_products
        FROM guatemala.ejecuciones e
        WHERE e.estado IN ('historica','importada','completada','parcial')
        ORDER BY coalesce(e.inicio AT TIME ZONE 'UTC',e.inicio_original,
          e.observada_en AT TIME ZONE 'UTC') DESC NULLS LAST,e.id LIMIT 1`)).rows[0] || null);
    },
    async ncSnapshot() {
      return read(async client => {
        const published = (await client.query(`SELECT s.store_key,s.observada_en
          FROM nicaragua.publicaciones s ORDER BY s.store_key`)).rows;
        const rows = (await client.query<DbProduct & { store_key: string; fecha_scraping_utc: unknown }>(`
          SELECT ${FIELDS.map(field => `p.${field}`).join(',')},p.store_key,p.fecha_scraping_utc
          FROM nicaragua.productos p JOIN nicaragua.publicaciones s
            ON s.store_key=p.store_key AND s.ejecucion_uuid=p.ejecucion_uuid
          WHERE p.pais_codigo='NC' AND p.moneda='NIO' ORDER BY p.store_key,p.id`)).rows;
        const products = rows.flatMap(row => {
          const store = Object.keys(NC_EXECUTION_STORES).find(key =>
            NC_EXECUTION_STORES[key as NcStoreKey].id === row.store_key) as NcStoreKey | undefined;
          if (!store || !row.fecha_scraping_utc) throw new Error('Publicación NC inválida.');
          return normalizeNcProducts(store, [{ source_site: text(row.sitio_fuente), brand: text(row.marca),
            line: text(row.linea), category: text(row.categoria), product_name: text(row.producto),
            availability: text(row.disponibilidad), regular_price: text(row.precio_regular),
            sale_price: text(row.precio_oferta), discount: text(row.descuento), installment: text(row.cuotas),
            product_url: text(row.url_producto), source_url: text(row.url_fuente), headline: text(row.titulo),
            description: text(row.descripcion), warranty: text(row.garantia), benefits: text(row.beneficios),
            image_url: text(row.url_imagen), image_alt: text(row.texto_imagen), scraped_at: utc(row.fecha_scraping_utc)!,
          }]);
        });
        const stores = published.map(row => {
          const key = Object.keys(NC_EXECUTION_STORES).find(key =>
            NC_EXECUTION_STORES[key as NcStoreKey].id === row.store_key) as NcStoreKey | undefined;
          if (!key) throw new Error('Tienda NC desconocida.');
          const items = products.filter(p => p.store_id === row.store_key);
          return { store: key, status: 'ok', count: items.length,
            priced: items.filter(p => p.sale_price_value !== null || p.regular_price_value !== null).length,
            scrapedAt: utc(row.observada_en) };
        });
        const dates = stores.map(store => store.scrapedAt).filter((value): value is string => value !== null).sort();
        return { version: 1, country: 'NC', currency: 'NIO', scrapedAt: dates.at(-1) ?? null, stores, products };
      });
    },
  };
}
