import { createHash, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { STORE_CATALOG } from '../config/store-catalog.js';
import { classifyRegionalProduct } from '../domain/regional-classification.js';
import type { CsvProduct } from '../domain/product.js';
import { NC_EXECUTION_STORES, normalizeNcProducts, type NcExecutionProduct, type NcStoreKey } from '../scrapers/nc/execution.js';
import type { ExecutionAttribution, ExecutionCountry } from '../server/execution-attribution.js';

const SCHEMAS = { GT: 'guatemala', NC: 'nicaragua' } as const;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const KEYS = ['CATALOG_EXECUTION_ID', 'CATALOG_EXECUTION_USER_ID', 'CATALOG_EXECUTION_COUNTRY'] as const;

function requireRegionalEnvironment() {
  if (process.env.CATALOG_REGIONAL_WRITES !== '1'
    || !['webscraper_dev', 'catalogocomercial_ensayo_101'].includes(process.env.PGDATABASE || '')
    || process.env.PGUSER !== 'webscraper_user'
    || !process.env.PGHOST || !process.env.PGPASSWORD) {
    throw new Error('Escritura regional requiere configuración DEV separada y rol webscraper_user.');
  }
}

export function regionalExecutionContext(country: ExecutionCountry): ExecutionAttribution | undefined {
  const hasContext = KEYS.some(key => process.env[key] !== undefined);
  if (!hasContext && process.env.CATALOG_REGIONAL_WRITES !== '1') return undefined;
  requireRegionalEnvironment();
  const [executionId, userId, configuredCountry] = KEYS.map(key => process.env[key]);
  if (!executionId || !UUID.test(executionId) || !userId || !/^[A-Za-z0-9_-]{1,36}$/.test(userId)
    || configuredCountry !== country) throw new Error('El worker carece de atribución regional válida.');
  return Object.freeze({ executionId, userId, country });
}

type Store = { key: string; name: string; requested: string };
type Prepared = { store: Store; rows: CsvProduct[]; ranges: Array<{ regular: Array<number | null>; sale: Array<number | null> }> };
export type RegionalWorkerOutcome = { attemptedStores: string[]; failedStores?: string[]; warningCount?: number };

function storeDefinition(country: ExecutionCountry, requested: string): Store {
  if (country === 'NC') {
    const definition = NC_EXECUTION_STORES[requested as NcStoreKey];
    if (!definition) throw new Error('Tienda NC no registrada.');
    return { key: definition.id, name: definition.name, requested };
  }
  const name = requested.startsWith('La Colchoner') ? 'La Colchoneria Guatemala' : requested;
  const definition = STORE_CATALOG.find(store => store.countryCode === 'GT' && store.enabled && store.name === name);
  if (!definition) throw new Error('Tienda GT no registrada.');
  return { key: definition.name, name: definition.name, requested: definition.name };
}

function allRequests(country: ExecutionCountry): string[] {
  return country === 'NC' ? Object.keys(NC_EXECUTION_STORES)
    : STORE_CATALOG.filter(store => store.countryCode === 'GT' && store.enabled).map(store => store.name);
}

function gtqRange(text: string): Array<number | null> {
  const raw = text.trim();
  if (!raw || ['-', 'n/a', 'na'].includes(raw.toLowerCase())) return [null, null];
  const amount = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?';
  const match = raw.match(new RegExp(`^(?:GTQ|Q)\\s*(${amount})(?:\\s*[-–]\\s*(?:GTQ|Q)?\\s*(${amount}))?$`, 'i'));
  if (!match) throw new Error('Precio GTQ no normalizado.');
  const values = [match[1], match[2] || match[1]].map(value => Number(value.replace(/,/g, '')));
  if (values.some(value => !Number.isFinite(value) || value <= 0 || value >= 1e10)) throw new Error('Importe GTQ inválido.');
  return [Math.min(...values), Math.max(...values)];
}

function observedAt(text: string) {
  if (!/(?:[zZ]|[+-]\d\d:\d\d)$/.test(text) || !Number.isFinite(Date.parse(text))) throw new Error('Fecha de scraping sin zona verificable.');
}

function prepare(country: ExecutionCountry, store: Store, input: CsvProduct[]): Prepared {
  const seen = new Set<string>();
  const rows = country === 'NC' ? normalizeNcProducts(store.requested as NcStoreKey, input) : input;
  const ranges: Prepared['ranges'] = [];
  for (const row of rows) {
    if (!row.product_name.trim() || storeDefinition(country, country === 'NC' ? store.requested : row.source_site).key !== store.key) {
      throw new Error('Producto ajeno a tienda.');
    }
    observedAt(row.scraped_at);
    const identity = new URL(row.product_url).href;
    if (seen.has(identity)) throw new Error('URL duplicada en tienda.');
    seen.add(identity);
    if (country === 'GT') {
      const classification = classifyRegionalProduct({ sitio_fuente: row.source_site, url_fuente: row.source_url,
        url_producto: row.product_url, precio_regular: row.regular_price, precio_oferta: row.sale_price });
      // FACENCO no publica precios: país explícito del worker y origen oficial verificado.
      const officialFacenco = store.key === 'FACENCO' && [row.source_url, row.product_url].every(value => {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname.replace(/^www\./, '') === 'camasfacenco.com'
          && !url.username && !url.password && !url.port;
      });
      if (!(classification.status === 'asignado' && classification.country === 'GT') && !officialFacenco) {
        throw new Error('Producto sin procedencia GT verificable.');
      }
      ranges.push({ regular: gtqRange(row.regular_price), sale: gtqRange(row.sale_price) });
    } else {
      const product = row as NcExecutionProduct;
      ranges.push({ regular: [product.regular_price_value, product.regular_price_value],
        sale: [product.sale_price_value, product.sale_price_value] });
    }
  }
  if (!rows.length) throw new Error('Una tienda vacía no reemplaza su publicación.');
  return { store, rows, ranges };
}

async function authorize(client: PoolClient, context: ExecutionAttribution) {
  const identity = await client.query('SELECT current_database() AS database');
  if (!['webscraper_dev', 'catalogocomercial_ensayo_101'].includes(identity.rows[0]?.database)) throw new Error('Destino no autorizado.');
  const user = await client.query(`SELECT u.account_level FROM administracion.usuarios u
    JOIN administracion.paises p ON p.codigo=$2
    WHERE u.id=$1 AND u.enabled AND p.habilitado FOR SHARE OF u,p`, [context.userId, context.country]);
  if (user.rowCount !== 1) throw new Error('Usuario o país deshabilitado.');
  if (!['admin', 'superadmin'].includes(user.rows[0].account_level)) {
    const grant = await client.query(`SELECT role FROM administracion.usuario_paises
      WHERE user_id=$1 AND country_code=$2 AND role='operador' FOR SHARE`, [context.userId, context.country]);
    if (grant.rowCount !== 1) throw new Error('Permiso de operador revocado.');
  }
}

export async function saveRegionalProducts(context: ExecutionAttribution, input: CsvProduct[], outcome: RegionalWorkerOutcome) {
  requireRegionalEnvironment();
  if (!Number.isInteger(outcome.warningCount ?? 0) || (outcome.warningCount ?? 0) < 0) {
    throw new Error('Conteo de advertencias inválido.');
  }
  if (!UUID.test(context.executionId) || !/^[A-Za-z0-9_-]{1,36}$/.test(context.userId)
    || !Object.hasOwn(SCHEMAS, context.country)) throw new Error('Contexto regional inválido.');
  const schema = SCHEMAS[context.country];
  const pool = new Pool({ host: process.env.PGHOST, port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: true } : false,
    connectionTimeoutMillis: 10000, application_name: 'catalog_regional_worker' });
  const client = await pool.connect().catch(async error => { await pool.end(); throw error; });
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='10s'");
    await authorize(client, context);
    const run = await client.query(`SELECT source_payload FROM ${schema}.ejecuciones
      WHERE id=$1::uuid AND usuario_id=$2 AND origen='manual' AND estado='ejecutando'
      FOR UPDATE`, [context.executionId, context.userId]);
    if (run.rowCount !== 1 || run.rows[0].source_payload?.result_committed) throw new Error('Ejecución no disponible o ya persistida.');
    const storedRequests = run.rows[0].source_payload?.stores;
    if (!Array.isArray(storedRequests)) throw new Error('La solicitud no conserva su selección original.');
    const expected = (storedRequests.length ? storedRequests : allRequests(context.country))
      .map((name: string) => storeDefinition(context.country, name));
    const expectedKeys = new Set(expected.map(store => store.key));
    if (expectedKeys.size !== expected.length) throw new Error('Selección ambigua.');
    const attempted = outcome.attemptedStores.map(name => storeDefinition(context.country, name).key);
    if (attempted.length !== expected.length || new Set(attempted).size !== expected.length
      || attempted.some(key => !expectedKeys.has(key))) throw new Error('El worker intentó tiendas distintas a la solicitud.');
    const failed = new Set((outcome.failedStores || []).map(name => storeDefinition(context.country, name).key));
    if ([...failed].some(key => !expectedKeys.has(key))) throw new Error('Fallo fuera de la selección autorizada.');
    const grouped = new Map<string, CsvProduct[]>();
    for (const row of input) {
      const key = context.country === 'GT' ? storeDefinition('GT', row.source_site).key
        : Object.values(NC_EXECUTION_STORES).find(store => store.name === row.source_site)?.id;
      if (!key || !expectedKeys.has(key)) throw new Error('Producto fuera de la selección autorizada.');
      grouped.set(key, [...(grouped.get(key) || []), row]);
    }
    const prepared: Prepared[] = [];
    const results: Array<{ store: string; status: string; count: number; published?: boolean }> = [];
    for (const store of expected) {
      try {
        if (failed.has(store.key)) throw new Error('Tienda fallida.');
        prepared.push(prepare(context.country, store, grouped.get(store.key) || []));
      } catch { results.push({ store: store.key, status: 'failed_or_invalid', count: 0, published: false }); }
    }
    for (const { store, rows, ranges } of prepared.sort((a, b) => a.store.key.localeCompare(b.store.key))) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`catalogo:${context.country}:${store.key}`]);
      await client.query(`INSERT INTO ${schema}.tiendas(store_key,nombre,pais_codigo)
        VALUES($1,$2,$3) ON CONFLICT(store_key) DO NOTHING`, [store.key, store.name, context.country]);
      const data = rows.map((row, index) => ({ ...row, registro_uuid: randomUUID(),
        regular_min: ranges[index].regular[0], regular_max: ranges[index].regular[1],
        sale_min: ranges[index].sale[0], sale_max: ranges[index].sale[1] }));
      const textFields = { sitio_fuente: 'source_site', marca: 'brand', linea: 'line', categoria: 'category',
        producto: 'product_name', disponibilidad: 'availability', precio_regular: 'regular_price',
        precio_oferta: 'sale_price', descuento: 'discount', cuotas: 'installment', url_producto: 'product_url',
        url_fuente: 'source_url', titulo: 'headline', descripcion: 'description', garantia: 'warranty',
        beneficios: 'benefits', url_imagen: 'image_url', texto_imagen: 'image_alt' };
      const columns = Object.keys(textFields).join(',');
      const values = Object.values(textFields).map(field => `r->>'${field}'`).join(',');
      await client.query(`INSERT INTO ${schema}.productos(registro_uuid,run_uuid,ejecucion_uuid,
        store_key,pais_codigo,moneda,fecha_scraping,fecha_scraping_utc,semana_inicio,
        precio_regular_min,precio_regular_max,precio_oferta_min,precio_oferta_max,${columns})
        SELECT (r->>'registro_uuid')::uuid,$1::uuid,$1::uuid,$2,$3,$4,
        (r->>'scraped_at')::timestamptz AT TIME ZONE 'UTC',(r->>'scraped_at')::timestamptz,
        date_trunc('week',now() AT TIME ZONE 'America/Guatemala')::date,
        (r->>'regular_min')::numeric,(r->>'regular_max')::numeric,
        (r->>'sale_min')::numeric,(r->>'sale_max')::numeric,${values}
        FROM jsonb_array_elements($5::jsonb) r`, [context.executionId, store.key, context.country,
        context.country === 'GT' ? 'GTQ' : 'NIO', JSON.stringify(data)]);
      const observed = new Date(rows.reduce((latest, row) => Math.max(latest, Date.parse(row.scraped_at)), 0)).toISOString();
      const publication = await client.query(`INSERT INTO ${schema}.publicaciones (
        store_key,ejecucion_uuid,product_count,source_count,observada_en,locked_at,lock_until,source_payload
      ) VALUES ($1,$2::uuid,$3,$3,$4::timestamptz,now(),
        ${context.country === 'GT' ? "now()+interval '3 hours'" : 'NULL'},$5::jsonb)
      ON CONFLICT(store_key) DO UPDATE SET ejecucion_uuid=EXCLUDED.ejecucion_uuid,
        product_count=EXCLUDED.product_count,source_count=EXCLUDED.source_count,
        observada_en=EXCLUDED.observada_en,locked_at=EXCLUDED.locked_at,
        lock_until=EXCLUDED.lock_until,source_payload=EXCLUDED.source_payload
      ${context.country === 'GT' ? `WHERE ${schema}.publicaciones.lock_until IS NULL
        OR ${schema}.publicaciones.lock_until<=now()
        OR EXCLUDED.product_count>${schema}.publicaciones.product_count` : ''}
      RETURNING store_key`, [store.key, context.executionId, rows.length, observed,
        JSON.stringify({ execution_id: context.executionId, input_sha256: createHash('sha256')
          .update(JSON.stringify(rows)).digest('hex'), origin: 'authenticated_worker' })]);
      results.push({ store: store.key, status: 'saved', count: rows.length, published: publication.rowCount === 1 });
    }
    const saved = prepared.reduce((count, store) => count + store.rows.length, 0);
    const partial = results.some(store => store.status !== 'saved') || Number(outcome.warningCount || 0) > 0;
    const state = !saved ? 'fallida' : partial ? 'parcial' : 'completada';
    const digest = createHash('sha256').update(JSON.stringify(results)).digest('hex');
    await client.query(`UPDATE ${schema}.ejecuciones SET total_productos=$3,
      source_payload=source_payload || $4::jsonb WHERE id=$1::uuid AND usuario_id=$2`,
    [context.executionId, context.userId, saved, JSON.stringify({ result_committed: true,
      result_state: state, store_results: results, result_sha256: digest,
      warning_count: Number(outcome.warningCount || 0) })]);
    await client.query('COMMIT');
    return { executionId: context.executionId, products: saved, stores: results, state, partial: state !== 'completada' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); await pool.end(); }
}
