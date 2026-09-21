import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { Pool } from 'pg';
import {
  normalizeProductText as normalizeText,
  type CatalogProduct,
  type DbProduct,
} from '../domain/product.js';

const FACENCO_PRICE_FILE = resolve('data/precios_facenco.xlsx');

export function getDbPool(): Pool {
  return new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: String(process.env.PGSSL || '').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
  });
}

export function parsePrice(value: string | null): number | null {
  if (!value) return null;
  const matches = value.match(/(?:Q|GTQ)?\s*\d[\d,]*(?:\.\d+)?/gi) || [];
  const numbers = matches
    .map((match) => Number(match.replace(/Q|GTQ/gi, '').replace(/\s/g, '').replace(/,/g, '').replace(/[^\d.-]/g, '')))
    .filter((price) => Number.isFinite(price))
    .sort((a, b) => a - b);
  return numbers.length ? numbers[0] : null;
}

function firstNumber(...values: Array<number | string | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = parsePrice(value);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function cleanCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function formatFacencoMoney(value: unknown): string | null {
  const text = cleanCell(value);
  if (!text) return null;
  const numeric = Number(String(text).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(numeric)) return text;
  return new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric);
}

function getCellText(row: ExcelJS.Row, headerMap: Map<string, number>, headerName: string): string | null {
  const index = headerMap.get(headerName);
  if (!index) return null;
  const value = row.getCell(index).value;
  if (value && typeof value === 'object' && 'text' in value) return cleanCell((value as { text: string }).text);
  if (value && typeof value === 'object' && 'result' in value) return cleanCell((value as { result: unknown }).result);
  return cleanCell(value);
}

export async function loadFacencoPriceRows(templateRows: DbProduct[], priceFile = FACENCO_PRICE_FILE): Promise<DbProduct[]> {
  if (!existsSync(priceFile)) return [];

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(priceFile);
  const sheet = workbook.getWorksheet('Precios FACENCO') || workbook.worksheets[0];
  if (!sheet) return [];

  const headerRowNumber = 4;
  const headerMap = new Map<string, number>();
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.eachCell((cell, colNumber) => {
    const header = cleanCell(cell.value)?.toLowerCase();
    if (header) headerMap.set(header, colNumber);
  });

  const latest = templateRows.reduce<DbProduct | undefined>((current, row) => {
    if (!current) return row;
    return Number(row.run_id || 0) > Number(current.run_id || 0) ? row : current;
  }, undefined);
  const rows: DbProduct[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    const active = (getCellText(row, headerMap, 'activo') || 'SI').toUpperCase();
    if (active === 'NO') return;

    // La pantalla y PostgreSQL actuales siguen limitados a Guatemala.
    const country = headerMap.has('pais') ? (getCellText(row, headerMap, 'pais') || '').toUpperCase() : 'GT';
    const currency = (getCellText(row, headerMap, 'moneda') || (headerMap.has('pais') ? '' : 'GTQ')).toUpperCase();
    if (country !== 'GT' || currency !== 'GTQ') return;

    const product = getCellText(row, headerMap, 'producto');
    if (!product) return;

    const code = getCellText(row, headerMap, 'codigo_producto');
    const regular = formatFacencoMoney(getCellText(row, headerMap, 'precio_regular'));
    const offer = formatFacencoMoney(getCellText(row, headerMap, 'precio_oferta'));

    rows.push({
      id: `FAC-${code || rowNumber}`,
      run_id: latest?.run_id || null,
      semana_run: latest?.semana_run || null,
      semana_inicio: latest?.semana_inicio || null,
      sitio_fuente: 'FACENCO',
      marca: getCellText(row, headerMap, 'marca') || 'FACENCO',
      linea: getCellText(row, headerMap, 'linea'),
      categoria: getCellText(row, headerMap, 'categoria') || 'Colchones',
      producto: product,
      disponibilidad: getCellText(row, headerMap, 'disponibilidad') || 'Listado en archivo FACENCO',
      precio_regular: regular,
      precio_oferta: offer,
      precio_regular_min: firstNumber(regular),
      precio_regular_max: firstNumber(regular),
      precio_oferta_min: firstNumber(offer),
      precio_oferta_max: firstNumber(offer),
      descuento: null,
      cuotas: null,
      url_producto: null,
      url_fuente: 'data/precios_facenco.xlsx',
      titulo: code ? `${code} - ${product}` : product,
      descripcion: getCellText(row, headerMap, 'observaciones'),
      garantia: null,
      beneficios: null,
      url_imagen: null,
      texto_imagen: null,
      fecha_scraping: getCellText(row, headerMap, 'fecha_vigencia') || latest?.fecha_scraping || null,
      creado_en: latest?.creado_en || null,
      registro_uuid: code || `FACENCO-EXCEL-${rowNumber}`,
      run_uuid: latest?.run_uuid || null,
    });
  });

  return rows;
}

export function mergeFacencoExcelRows(dbRows: DbProduct[], excelRows: DbProduct[]): DbProduct[] {
  if (!excelRows.length) return dbRows;

  const byProduct = new Map<string, DbProduct>();
  for (const excelRow of excelRows) {
    byProduct.set(normalizeText(excelRow.producto || excelRow.titulo), excelRow);
  }

  const usedKeys = new Set<string>();
  const merged = dbRows.map((row) => {
    if (normalizeText(row.sitio_fuente) !== 'facenco') return row;
    const key = normalizeText(row.producto || row.titulo);
    const excelRow = byProduct.get(key);
    if (!excelRow) return row;
    usedKeys.add(key);
    return {
      ...row,
      marca: excelRow.marca || row.marca,
      linea: excelRow.linea || row.linea,
      categoria: excelRow.categoria || row.categoria,
      disponibilidad: excelRow.disponibilidad || row.disponibilidad,
      precio_regular: excelRow.precio_regular || row.precio_regular,
      precio_oferta: excelRow.precio_oferta || row.precio_oferta,
      precio_regular_min: excelRow.precio_regular_min ?? row.precio_regular_min,
      precio_regular_max: excelRow.precio_regular_max ?? row.precio_regular_max,
      precio_oferta_min: excelRow.precio_oferta_min ?? row.precio_oferta_min,
      precio_oferta_max: excelRow.precio_oferta_max ?? row.precio_oferta_max,
      descripcion: excelRow.descripcion || row.descripcion,
      titulo: excelRow.titulo || row.titulo,
      registro_uuid: excelRow.registro_uuid || row.registro_uuid,
    };
  });

  for (const excelRow of excelRows) {
    const key = normalizeText(excelRow.producto || excelRow.titulo);
    if (!usedKeys.has(key)) merged.push(excelRow);
  }

  return merged;
}

export function withPriceComparison(rows: DbProduct[]): CatalogProduct[] {
  const facencoPrices = new Map<string, number>();

  for (const row of rows) {
    if (normalizeText(row.sitio_fuente) !== 'facenco') continue;
    const key = normalizeText(row.producto || row.titulo);
    const price = firstNumber(row.precio_oferta_min, row.precio_regular_min, row.precio_oferta, row.precio_regular);
    if (key && price !== null) {
      facencoPrices.set(key, price);
    }
  }

  return rows.map((row) => {
    const key = normalizeText(row.producto || row.titulo);
    const price = firstNumber(row.precio_oferta_min, row.precio_regular_min, row.precio_oferta, row.precio_regular);
    const facencoPrice = key ? facencoPrices.get(key) : undefined;
    const difference = price !== null && facencoPrice !== undefined ? price - facencoPrice : null;

    let label = 'Sin referencia';
    if (difference !== null && difference < 0) label = 'Mas barato';
    if (difference !== null && difference > 0) label = 'Mas caro';
    if (difference === 0) label = 'Igual a FACENCO';

    return {
      ...row,
      precio_numero: price,
      diferencia_facenco: difference,
      etiqueta_diferencia: label,
    };
  });
}

export async function getProducts(searchParams: URLSearchParams): Promise<CatalogProduct[]> {
  const schema = process.env.PGSCHEMA || 'catalogo';
  const filters: string[] = [];
  const values: string[] = [];

  const filterMap: Array<[string, string]> = [
    ['semana', 'p.semana_run::text'],
    ['tienda', 'p.sitio_fuente'],
    ['marca', 'p.marca'],
    ['categoria', 'p.categoria'],
    ['disponibilidad', 'p.disponibilidad'],
  ];

  for (const [param, column] of filterMap) {
    const value = searchParams.get(param);
    if (value) {
      values.push(value);
      filters.push(`${column} = $${values.length}`);
    }
  }

  const query = searchParams.get('q');
  if (query) {
    values.push(`%${query}%`);
    filters.push(`(p.producto ILIKE $${values.length} OR p.marca ILIKE $${values.length} OR p.sitio_fuente ILIKE $${values.length})`);
  }

  const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const pool = getDbPool();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.catalog_display_snapshots (
        store_key TEXT PRIMARY KEY,
        run_id BIGINT NOT NULL,
        product_count INTEGER NOT NULL,
        locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        lock_until TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      WITH product_runs AS (
        SELECT
          CASE
            WHEN p.sitio_fuente LIKE 'La Colchoner%' THEN 'La Colchoneria Guatemala'
            ELSE p.sitio_fuente
          END AS store_key,
          p.run_id,
          COUNT(*)::INTEGER AS product_count,
          MAX(COALESCE(sr.started_at, p.fecha_scraping, p.creado_en)) AS run_time
        FROM ${schema}.productos_catalogo p
        LEFT JOIN ${schema}.scraping_runs sr ON sr.id = p.run_id
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
      INSERT INTO ${schema}.catalog_display_snapshots (
        store_key, run_id, product_count, locked_at, lock_until, updated_at
      )
      SELECT store_key, run_id, product_count, NOW(), NOW() + INTERVAL '3 hours', NOW()
      FROM ranked
      WHERE preference = 1
      ON CONFLICT (store_key) DO NOTHING
    `);

    const result = await pool.query<DbProduct>(`
      WITH preferred_store_runs AS (
        SELECT store_key, run_id
        FROM ${schema}.catalog_display_snapshots
      )
      SELECT p.*
      FROM ${schema}.productos_catalogo p
      INNER JOIN preferred_store_runs preferred
        ON preferred.store_key = CASE
          WHEN p.sitio_fuente LIKE 'La Colchoner%' THEN 'La Colchoneria Guatemala'
          ELSE p.sitio_fuente
        END
       AND preferred.run_id = p.run_id
      ${where}
      ORDER BY p.id ASC
    `, values);

    const facencoExcelRows = await loadFacencoPriceRows(result.rows);
    const mergedRows = mergeFacencoExcelRows(result.rows, facencoExcelRows);

    return withPriceComparison(mergedRows);
  } finally {
    await pool.end();
  }
}

export function toCsv(rows: CatalogProduct[]): string {
  const headers: Array<keyof CatalogProduct> = [
    'id',
    'run_id',
    'semana_run',
    'semana_inicio',
    'sitio_fuente',
    'marca',
    'categoria',
    'producto',
    'precio_regular',
    'precio_oferta',
    'precio_regular_min',
    'precio_regular_max',
    'precio_oferta_min',
    'precio_oferta_max',
    'diferencia_facenco',
    'etiqueta_diferencia',
    'disponibilidad',
    'fecha_scraping',
    'registro_uuid',
    'run_uuid',
  ];

  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return `\uFEFF${headers.map(escape).join(',')}\n${rows.map((row) => headers.map((key) => escape(row[key])).join(',')).join('\n')}\n`;
}
