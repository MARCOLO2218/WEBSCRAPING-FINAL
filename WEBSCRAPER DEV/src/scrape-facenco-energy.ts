import { chromium, type Page } from 'playwright';
import ExcelJS from 'exceljs';
import { config as loadEnv } from 'dotenv';
import { Pool, type PoolClient } from 'pg';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const envFile = existsSync('.env') ? '.env' : undefined;
if (envFile) {
  loadEnv({ path: envFile });
}

// URLs de origen.
// Si solo cambia la URL de una tienda ya existente, modifica estas constantes.
// Si agregas una tienda nueva, tambien debes crear su funcion scrape... y llamarla en main().
const FACENCO_SOURCE_URL = 'https://camasfacenco.com/';
const OLYMPIA_SOURCE_URL = 'https://camasolympiaonline.com/gt/';
const LA_COLCHONERIA_SOURCE_URL = 'https://lacolchoneria.com.gt/';
const SLEEP_GALLERY_SOURCE_URL = 'https://sleepgalleryca.com/gt/';
const MATTRESS_SOURCE_URL = 'https://mattress.com.gt/';
const BEDS_DREAMS_SOURCE_URL = 'https://www.bedsndreams.com/';
const FURNITURE_CITY_SOURCE_URL = 'https://www.furniturecity.com.gt/mattress-colchones/';
const LA_CURACAO_SOURCE_URL = 'https://www.lacuracaonline.com/guatemala/c/muebles/camas-y-colchones';
const MAX_GT_SOURCE_URL = 'https://www.max.com.gt/search?q=camas';
const ELEKTRA_GT_SOURCE_URL = 'https://www.elektra.com.gt/cama%20king/camas?map=ft,departamento';
const WALMART_GT_SOURCE_URL = 'https://www.walmart.com.gt/cama?_q=cama&fuzzy=0&initialMap=accesscontrollist,ft&initialQuery=walmartgtwm4414/cama&map=brand,brand,brand,brand,brand,brand,brand,brand,brand,brand,ft&operator=and&page=1&query=/belezza/camas-florida/facenco/indufoam/kangaroo/lucca/olympia/sealy/sienna/simmons/cama&searchState';
const CEMACO_GT_SOURCE_URL = 'https://www.cemaco.com/busqueda?q=camas&indexName=cemaco';
const SIMAN_GT_SOURCE_URL = 'https://gt.siman.com/search?_q=camas&refinements=W3siYXR0cmlidXRlIjoicXVlcnkiLCJyZWZpbmVtZW50cyI6W3siYXR0cmlidXRlIjoicXVlcnkiLCJ2YWx1ZSI6ImNhbWFzIn1dfV0';
const SUENA_CENTER_SOURCE_URL = 'https://gt.camasuena.com/categorias/camas';
const SUENA_CENTER_ALGOLIA_APP_ID = 'LP9ZU0LM0S';
const SUENA_CENTER_ALGOLIA_INDEX = 'Prod_Suena_Online_GT_V1';
const SUENA_CENTER_ALGOLIA_SEARCH_KEY = '132d6bf8c576cc05ecfc9af0f6e46e2c';
const DORMILANDIA_SOURCE_URL = 'https://www.dormilandia.com.gt/buscador.asp';
const DORMISUENOS_SOURCE_URL = 'https://tiendasdormisuenos.com/categoria-producto/camas/?product-page=1';
const BODEGANGAS_SOURCE_URL = 'https://bodegangasgts.com/?product_cat=0&s=camas&et_search=true&post_type=product';
const AMERICANA_2000_SOURCE_URL = 'https://americana2000.com/categoria-producto/camas/?am2k_attr_product_brand=facenco%2Cultra%2Ccomfort-life%2Colympia%2Csealy';
const AMERICANA_2000_API_URL = 'https://americana2000.com/wp-json/wc/store/v1/products?category=328&per_page=100';
const SERTA_GT_SOURCE_URL = 'https://sertacentroamerica.com/guatemala/catalogo/';
// Cambia aqui la carpeta o el nombre de los archivos generados.
const OUTPUT_FILE = resolve('output/comparacion_colchones.csv');
const OUTPUT_XLSX_FILE = resolve('output/comparacion_colchones.xlsx');

// Control de calidad por tienda.
// Si una tienda normalmente trae mas productos, cambia aqui su minimo esperado.
// Si una tienda trae menos que este minimo, el scraper avisa pero no se detiene.
const STORE_QUALITY_RULES: Record<string, { minFinalProducts: number }> = {
  FACENCO: { minFinalProducts: 10 },
  'Camas Olympia Online GT': { minFinalProducts: 25 },
  'La Colchoneria Guatemala': { minFinalProducts: 20 },
  'Sleep Gallery Guatemala': { minFinalProducts: 35 },
  'Mattress Guatemala': { minFinalProducts: 25 },
  'Beds & Dreams': { minFinalProducts: 30 },
  'Furniture City Guatemala': { minFinalProducts: 5 },
  'La Curacao Guatemala': { minFinalProducts: 15 },
  'MAX Guatemala': { minFinalProducts: 5 },
  'Elektra Guatemala': { minFinalProducts: 5 },
  'Walmart Guatemala': { minFinalProducts: 10 },
  'Cemaco Guatemala': { minFinalProducts: 5 },
  'Siman Guatemala': { minFinalProducts: 10 },
  'Serta Guatemala': { minFinalProducts: 10 },
  'Americana 2000 Guatemala': { minFinalProducts: 30 },
};


// Reintentos inteligentes por tienda.
// Esto NO detiene el scraper: si una tienda viene baja, se prueba otra vez y se usa el mejor intento.
const STORE_RETRY_RULES: Record<string, { minFinalProducts: number }> = {
  'La Curacao Guatemala': { minFinalProducts: 20 },
  'Walmart Guatemala': { minFinalProducts: 520 },
};

function getStoreRetryMinimum(storeName: string): number {
  return STORE_RETRY_RULES[storeName]?.minFinalProducts ?? 1;
}
function buildStoreQualityWarning(storeName: string, finalCount: number, rawCount: number): string | null {
  const rule = STORE_QUALITY_RULES[storeName];
  if (!rule || finalCount >= rule.minFinalProducts) {
    return null;
  }

  const rawText = rawCount !== finalCount ? ` (antes del filtro: ${rawCount})` : '';
  return `${storeName} genero ${finalCount} productos finales${rawText}; minimo esperado ${rule.minFinalProducts}. Puede ser carga incompleta o cambio de estructura. Recomendacion: correr nuevamente y revisar logs si se repite.`;
}

type CatalogProduct = {
  productName: string;
  productUrl: string;
  sourceUrl: string;
  line: string;
  imageUrl: string;
  imageAlt: string;
};

type ProductDetails = {
  headline: string;
  description: string;
  warranty: string;
  benefits: string;
};

type CsvProduct = {
  source_site: string;
  brand: string;
  line: string;
  category: string;
  product_name: string;
  availability: string;
  regular_price: string;
  sale_price: string;
  discount: string;
  installment: string;
  product_url: string;
  source_url: string;
  headline: string;
  description: string;
  warranty: string;
  benefits: string;
  image_url: string;
  image_alt: string;
  scraped_at: string;
};

type DbConfig = {
  enabled: boolean;
  schema: string;
  missing: string[];
};

type ProductSelectorConfig = {
  sourceSite: string;
  brand: string;
  cardSelector: string;
  titleSelector: string;
  categorySelector?: string;
  lineSelector?: string;
  anchorSelector?: string;
  imageSelector?: string;
  regularPriceSelector?: string;
  salePriceSelector?: string;
  priceSelector?: string;
  discountSelector?: string;
  installmentSelector?: string;
};

type StoreScraper = {
  name: string;
  run: (page: Page) => Promise<CsvProduct[]>;
};

const columns: Array<keyof CsvProduct> = [
  'source_site',
  'brand',
  'line',
  'category',
  'product_name',
  'availability',
  'regular_price',
  'sale_price',
  'discount',
  'installment',
  'product_url',
  'source_url',
  'headline',
  'description',
  'warranty',
  'benefits',
  'image_url',
  'image_alt',
  'scraped_at',
];

const columnHeaders: Record<keyof CsvProduct, string> = {
  source_site: 'Sitio fuente',
  brand: 'Marca',
  line: 'Linea',
  category: 'Categoria',
  product_name: 'Producto',
  availability: 'Disponibilidad',
  regular_price: 'Precio regular',
  sale_price: 'Precio oferta',
  discount: 'Descuento',
  installment: 'Cuotas',
  product_url: 'URL producto',
  source_url: 'URL fuente',
  headline: 'Titulo',
  description: 'Descripcion',
  warranty: 'Garantia',
  benefits: 'Beneficios',
  image_url: 'URL imagen',
  image_alt: 'Texto imagen',
  scraped_at: 'Fecha scraping',
};

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function toDbNullable(value: string | null | undefined): string | null {
  const cleaned = cleanText(value);
  const emptyMarkers = new Set(['', '-', 'n/a', 'na', 'null', 'undefined']);
  return emptyMarkers.has(cleaned.toLowerCase()) ? null : cleaned;
}

type PriceRange = {
  min: number | null;
  max: number | null;
};

function parseMoneyToken(value: string): number | null {
  const cleaned = value
    .replace(/Q|GTQ/gi, '')
    .replace(/\s/g, '')
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '');

  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePriceRange(value: string | null | undefined): PriceRange {
  const text = cleanText(value);
  if (!text || ['-', 'n/a', 'na', 'null', 'undefined'].includes(text.toLowerCase())) {
    return { min: null, max: null };
  }

  const matches = text.match(/(?:Q|GTQ)?\s*\d[\d,]*(?:\.\d+)?/gi) || [];
  const numbers = matches
    .map(parseMoneyToken)
    .filter((price): price is number => price !== null)
    .sort((a, b) => a - b);

  if (numbers.length === 0) return { min: null, max: null };
  return { min: numbers[0], max: numbers[numbers.length - 1] };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function userFriendlyStoreError(storeName: string, technicalMessage: string): string {
  if (/ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_TIMED_OUT/i.test(technicalMessage)) {
    return `${storeName}: el sitio cerro la conexion o no respondio. Intentar mas tarde.`;
  }

  if (/Timeout|timed out|waiting until/i.test(technicalMessage)) {
    return `${storeName}: el sitio tardo demasiado en responder. Intentar mas tarde.`;
  }

  if (/interrupted by another navigation/i.test(technicalMessage)) {
    return `${storeName}: la navegacion fue interrumpida. Se recomienda reintentar.`;
  }

  return `${storeName}: no se genero informacion. Puede haber cambiado la pagina o estar bloqueando temporalmente.`;
}

function toAbsoluteUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function toCsv(rows: CsvProduct[]): string {
  const header = columns.map((column) => csvEscape(columnHeaders[column])).join(',');
  const body = rows
    .map((row) => columns.map((column) => csvEscape(row[column])).join(','))
    .join('\n');

  return `\uFEFF${header}\n${body}\n`;
}

function getDbConfig(): DbConfig {
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

async function saveProductsToPostgres(rows: CsvProduct[]): Promise<void> {
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

async function writeExcel(rows: CsvProduct[], outputFile: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Scraper de camas';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Productos', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = columns.map((column) => ({
    header: columnHeaders[column],
    key: column,
    width: Math.min(Math.max(columnHeaders[column].length + 4, 16), 45),
  }));

  for (const row of rows) {
    worksheet.addRow(row);
  }

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF107C41' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
      cell.alignment = {
        vertical: 'top',
        wrapText: rowNumber === 1 || ['description', 'benefits', 'headline'].includes(String(cell.col)),
      };
    });
  });

  worksheet.getColumn('product_name').width = 32;
  worksheet.getColumn('product_url').width = 48;
  worksheet.getColumn('source_url').width = 42;
  worksheet.getColumn('headline').width = 42;
  worksheet.getColumn('description').width = 60;
  worksheet.getColumn('benefits').width = 48;
  worksheet.getColumn('image_url').width = 48;
  worksheet.getColumn('scraped_at').width = 26;

  await workbook.xlsx.writeFile(outputFile);
}

async function goto(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function inferFacencoLine(text: string, url: string): string {
  const value = cleanText(text || url);
  const fromText = value.match(/\blinea\s+([a-z0-9\s-]+)/i)?.[1] ?? '';
  const fromUrl = url.match(/linea-([^/?#]+)/i)?.[1] ?? '';
  const rawLine = fromText || fromUrl;

  return rawLine
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function extractFacencoCatalogUrls(page: Page, sourceUrl: string): Promise<string[]> {
  return page.evaluate((sourceUrl) => {
    const absolute = (url: string) => {
      try {
        return new URL(url, sourceUrl).toString();
      } catch {
        return '';
      }
    };

    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .map((anchor) => absolute(anchor.getAttribute('href') ?? ''))
      .filter((url) => {
        if (!url.startsWith(sourceUrl)) {
          return false;
        }

        return /\/linea-|\/producto|\/colchon|\/cama/i.test(new URL(url).pathname);
      });
  }, sourceUrl);
}

async function extractFacencoCatalogProducts(page: Page, sourceUrl: string): Promise<CatalogProduct[]> {
  return page.evaluate((sourceUrl) => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const absolute = (url: string) => {
      try {
        return new URL(url, sourceUrl).toString();
      } catch {
        return url;
      }
    };
    const nameFromUrl = (url: string) => {
      try {
        const slug = new URL(url, sourceUrl).pathname.replace(/^\/|\/$/g, '').split('/').pop() ?? '';
        return slug
          .replace(/-\d+$/g, '')
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (letter) => letter.toUpperCase());
      } catch {
        return '';
      }
    };
    const productHeadings = Array.from(document.querySelectorAll('h2'))
      .map((heading) => clean(heading.textContent))
      .filter((text) => {
        const lowerText = text.toLowerCase();
        return text
          && lowerText !== 'enlaces'
          && lowerText !== 'facenco'
          && !lowerText.startsWith('direcci')
          && !lowerText.includes('trabaja con nosotros');
      });

    const linkScript = Array.from(document.scripts)
      .map((script) => script.textContent ?? '')
      .find((text) => text.includes('et_link_options_data'));

    const match = linkScript?.match(/et_link_options_data\s*=\s*(\[[\s\S]*?\]);/);
    const linkData = match ? JSON.parse(match[1]) as Array<{ class: string; url: string }> : [];

    const products = linkData
      .map((item, index) => {
        const container = document.querySelector(`.${CSS.escape(item.class)}`);
        const heading = clean(container?.querySelector('h1,h2,h3')?.textContent);
        const image = container?.querySelector('img');
        const imageSrc = image?.getAttribute('src') || image?.getAttribute('data-src') || '';
        const imageAlt = clean(image?.getAttribute('alt'));
        const productUrl = absolute(item.url);
        const visibleHeading = productHeadings.length > linkData.length
          ? productHeadings.at(index + productHeadings.length - linkData.length) ?? ''
          : '';
        const fallbackName = productHeadings.length <= linkData.length ? nameFromUrl(productUrl) : heading;

        return {
          productName: visibleHeading || fallbackName || heading || imageAlt || nameFromUrl(productUrl),
          productUrl,
          sourceUrl,
          line: '',
          imageUrl: imageSrc ? absolute(imageSrc) : '',
          imageAlt,
        };
      })
      .filter((product) => product.productName && product.productUrl);

    if (products.length > 0) {
      return products;
    }

    return Array.from(document.querySelectorAll('h2'))
      .map((heading) => {
        const text = clean(heading.textContent);
        const container = heading.closest('.et_pb_column, .et_pb_module, section, article, div');
        const anchor = container?.querySelector<HTMLAnchorElement>('a[href]');
        const image = container?.querySelector('img');
        const imageSrc = image?.getAttribute('src') || image?.getAttribute('data-src') || '';

        return {
          productName: text,
          productUrl: anchor?.href ? absolute(anchor.href) : '',
          sourceUrl,
          line: '',
          imageUrl: imageSrc ? absolute(imageSrc) : '',
          imageAlt: clean(image?.getAttribute('alt')),
        };
      })
      .filter((product) => product.productName && product.productUrl);
  }, sourceUrl);
}

async function extractProductDetails(page: Page): Promise<ProductDetails> {
  return page.evaluate(() => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const ignored = /^(enlaces|facenco|otros beneficios|regresar|direcci[oÃ³]n|trabaja con nosotros)$/i;
    const main = document.querySelector('main, article, #main-content') ?? document.body;
    const headings = Array.from(main.querySelectorAll('h1,h2,h3'))
      .map((node) => clean(node.textContent))
      .filter((text) => text && !ignored.test(text));

    const paragraphs = Array.from(main.querySelectorAll('p'))
      .map((node) => clean(node.textContent))
      .filter((text) => text.length > 45 && !/tel\s*\(/i.test(text));

    const imageAlts = Array.from(main.querySelectorAll('img'))
      .map((image) => clean(image.getAttribute('alt')))
      .filter(Boolean);

    const bodyText = clean(main.textContent);
    const warrantyFromText = bodyText.match(/\b\d+\s*aÃ±os?\s+de\s+garant[iÃ­]a\b/i)?.[0] ?? '';
    const warrantyFromImage = imageAlts.find((alt) => /garant[iÃ­]a/i.test(alt)) ?? '';

    const benefitPairs = Array.from(main.querySelectorAll('h2,h3'))
      .map((heading) => {
        const title = clean(heading.textContent);
        if (!title || ignored.test(title) || /energy/i.test(title)) {
          return '';
        }

        let sibling = heading.parentElement?.nextElementSibling ?? heading.nextElementSibling;
        let description = '';

        for (let i = 0; sibling && i < 4; i += 1) {
          const text = clean(sibling.textContent);
          if (sibling.matches('p') && text.length > 20) {
            description = text;
            break;
          }
          sibling = sibling.nextElementSibling;
        }

        return description ? `${title}: ${description}` : title;
      })
      .filter(Boolean);

    const headline = headings.slice(0, 2).join(' - ');
    const description = paragraphs[0] ?? '';
    const benefits = Array.from(new Set(benefitPairs)).join(' | ');

    return {
      headline,
      description,
      warranty: warrantyFromText || warrantyFromImage,
      benefits,
    };
  });
}

async function extractOlympiaProducts(page: Page): Promise<CsvProduct[]> {
  return page.evaluate((sourceUrl) => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const absolute = (url: string) => {
      try {
        return new URL(url, sourceUrl).toString();
      } catch {
        return url;
      }
    };

    return Array.from(document.querySelectorAll<HTMLElement>('.ol-products-grid article.ol-card'))
      .map((card) => {
        const title = clean(card.querySelector('.ol-card-title')?.textContent);
        const category = clean(card.querySelector('.ol-card-cat')?.textContent);
        const discount = clean(card.querySelector('.ol-badge')?.textContent);
        const regularPrice = clean(card.querySelector('.ol-price-old')?.textContent);
        const salePrice = clean(card.querySelector('.ol-price-new')?.textContent)
          || clean(card.querySelector('.ol-card-price')?.textContent);
        const installment = clean(card.querySelector('.ol-cuotas-box')?.textContent);
        const anchor = card.querySelector<HTMLAnchorElement>('a.ol-card-btn, a.ol-card-img-wrap, a[href]');
        const image = card.querySelector<HTMLImageElement>('img');
        const imageUrl = image?.currentSrc || image?.src || image?.getAttribute('src') || '';
        const imageAlt = clean(image?.getAttribute('alt'));

        return {
          source_site: 'Camas Olympia Online GT',
          brand: 'Olympia',
          line: '',
          category,
          product_name: title || imageAlt,
          availability: 'Listado en tienda online',
          regular_price: regularPrice,
          sale_price: salePrice,
          discount,
          installment,
          product_url: anchor?.href ? absolute(anchor.href) : '',
          source_url: sourceUrl,
          headline: '',
          description: '',
          warranty: '',
          benefits: '',
          image_url: imageUrl ? absolute(imageUrl) : '',
          image_alt: imageAlt,
          scraped_at: '',
        };
      })
      .filter((product) => product.product_name && product.product_url);
  }, OLYMPIA_SOURCE_URL);
}

async function scrapeFacenco(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  await goto(page, FACENCO_SOURCE_URL);
  const discoveredCatalogUrls = await extractFacencoCatalogUrls(page, FACENCO_SOURCE_URL);
  const catalogUrls = uniqueValues(
    discoveredCatalogUrls.length > 0 ? discoveredCatalogUrls : [FACENCO_SOURCE_URL],
  );
  const catalogProductsByKey = new Map<string, CatalogProduct>();

  for (const catalogUrl of catalogUrls) {
    await goto(page, catalogUrl);
    const pageTitle = await page.title();
    const line = inferFacencoLine(pageTitle, catalogUrl);
    const products = await extractFacencoCatalogProducts(page, catalogUrl);

    for (const product of products) {
      const productKey = `${catalogUrl}|${product.productName}|${product.productUrl}`;
      catalogProductsByKey.set(productKey, {
        ...product,
        sourceUrl: catalogUrl,
        line: product.line || line,
      });
    }
  }

  const catalogProducts = Array.from(catalogProductsByKey.values());
  const rows: CsvProduct[] = [];

  for (const product of catalogProducts) {
    await goto(page, product.productUrl);
    const details = await extractProductDetails(page);

    rows.push({
      source_site: 'FACENCO',
      brand: 'FACENCO',
      line: product.line,
      category: 'Colchones',
      product_name: cleanText(product.productName),
      availability: 'Listado en catálogo',
      regular_price: '',
      sale_price: '',
      discount: '',
      installment: '',
      product_url: toAbsoluteUrl(product.productUrl, product.sourceUrl),
      source_url: product.sourceUrl,
      headline: details.headline,
      description: details.description,
      warranty: details.warranty,
      benefits: details.benefits,
      image_url: product.imageUrl,
      image_alt: product.imageAlt,
      scraped_at: scrapedAt,
    });
  }

  return rows;
}

async function scrapeOlympia(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  await goto(page, OLYMPIA_SOURCE_URL);
  const rows = await extractOlympiaProducts(page);

  return rows.map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
}

async function extractLaColchoneriaProducts(page: Page): Promise<CsvProduct[]> {
  return page.evaluate((sourceUrl) => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const absolute = (url: string) => {
      try {
        return new URL(url, sourceUrl).toString();
      } catch {
        return url;
      }
    };
    const productCategory = (name: string, sectionTitle: string) => {
      if (sectionTitle) {
        return sectionTitle;
      }
      if (/colch[oó]n|colchon/i.test(name)) {
        return 'Colchones';
      }
      if (/^cama\b/i.test(name)) {
        return 'Camas';
      }
      if (/almohada/i.test(name)) {
        return 'Almohadas';
      }
      if (/protector|s[aá]bana|sabana|duvet|edred[oó]n|cubrecama/i.test(name)) {
        return 'Ropa de cama';
      }
      if (/sill[oó]n|sofa|sof[aá]|camastron|camastr[oó]n/i.test(name)) {
        return 'Muebles';
      }
      return '';
    };
    const sectionHeading = (card: Element) => {
      const section = card.closest('section, .shopify-section, [id^="shopify-section"]');
      const heading = section?.querySelector('h1,h2,h3,.section-title,.title');
      return clean(heading?.textContent)
        .replace(/^#+\s*/, '')
        .replace(/\s+\d+\s*$/, '');
    };
    const imageUrl = (image: HTMLImageElement | null) => {
      if (!image) {
        return '';
      }
      const template = image.getAttribute('data-src');
      if (template) {
        return template.replace('{width}', '720');
      }
      return image.currentSrc || image.src || image.getAttribute('src') || '';
    };
    const moneyAmounts = (value: string) => value.match(/Q\s?[\d,]+(?:\.\d{2})?/g) ?? [];

    const rows = Array.from(document.querySelectorAll<HTMLElement>('.product-card.js-product-card'))
      .map((card) => {
        const nameAnchor = card.querySelector<HTMLAnchorElement>('.product-card__name[href]');
        const image = card.querySelector<HTMLImageElement>('img');
        const productName = clean(nameAnchor?.textContent || image?.getAttribute('alt'));
        const priceText = clean(card.querySelector('.product-card__price')?.textContent);
        const amounts = moneyAmounts(priceText);
        const salePrice = clean(card.querySelector('.product-card__price strong')?.textContent) || amounts[0] || '';
        const regularPrice = clean(card.querySelector('.product-card__regular-price')?.textContent) || amounts[1] || '';
        const discount = clean(card.querySelector('.product-tag-sale, .product-label')?.textContent);
        const installment = clean(card.querySelector('.badge-finance')?.textContent);
        const size = clean(card.querySelector('[id^="size_slot_"]')?.textContent);
        const sectionTitle = sectionHeading(card);
        const url = nameAnchor?.href || card.querySelector<HTMLAnchorElement>('a[href]')?.href || '';
        const img = imageUrl(image);

        return {
          source_site: 'La Colchonería Guatemala',
          brand: 'La Colchonería',
          line: size,
          category: productCategory(productName, sectionTitle),
          product_name: productName,
          availability: 'Listado en tienda online',
          regular_price: regularPrice,
          sale_price: salePrice,
          discount,
          installment,
          product_url: url ? absolute(url) : '',
          source_url: sourceUrl,
          headline: '',
          description: '',
          warranty: '',
          benefits: '',
          image_url: img ? absolute(img) : '',
          image_alt: clean(image?.getAttribute('alt')),
          scraped_at: '',
        };
      })
      .filter((product) => product.product_name && product.product_url);

    const unique = new Map<string, CsvProduct>();
    for (const row of rows) {
      if (!unique.has(row.product_url)) {
        unique.set(row.product_url, row);
      }
    }

    return Array.from(unique.values());
  }, LA_COLCHONERIA_SOURCE_URL);
}

async function scrapeLaColchoneria(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  await goto(page, LA_COLCHONERIA_SOURCE_URL);
  const rows = await extractLaColchoneriaProducts(page);

  return rows.map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
}

async function extractCardProducts(
  page: Page,
  sourceUrl: string,
  config: ProductSelectorConfig,
): Promise<CsvProduct[]> {
  return page.evaluate(({ sourceUrl, config }) => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const absolute = (url: string) => {
      try {
        return new URL(url, sourceUrl).toString();
      } catch {
        return url;
      }
    };
    const firstText = (root: Element, selector?: string) => {
      if (!selector) {
        return '';
      }
      return clean(root.querySelector(selector)?.textContent);
    };
    const productCategory = (name: string, fallback: string) => {
      if (fallback) {
        return fallback;
      }
      if (/colch[oÃ³]n|colchon|mattress/i.test(name)) {
        return 'Colchones';
      }
      if (/cama|base|box spring/i.test(name)) {
        return 'Camas';
      }
      if (/almohada|pillow/i.test(name)) {
        return 'Almohadas';
      }
      if (/protector|funda|s[aÃ¡]bana|frazada|edred[oÃ³]n|comforter/i.test(name)) {
        return 'Ropa de cama';
      }
      return '';
    };
    const imageUrl = (image: HTMLImageElement | null) => {
      if (!image) {
        return '';
      }
      const srcset = image.getAttribute('data-srcset') || image.getAttribute('srcset') || '';
      const srcsetFirst = srcset.split(',').map((item) => item.trim().split(/\s+/)[0]).find(Boolean) ?? '';
      const src = image.currentSrc || image.src || image.getAttribute('data-src') || image.getAttribute('src') || srcsetFirst;
      return src && !src.startsWith('data:') ? absolute(src) : '';
    };
    const buildRow = (root: Element, title: string, anchor: HTMLAnchorElement | null, image: HTMLImageElement | null): CsvProduct => {
      const rootText = clean(root.textContent);
      const category = productCategory(title, firstText(root, config.categorySelector));
      const regularPrice = firstText(root, config.regularPriceSelector);
      const salePrice = firstText(root, config.salePriceSelector)
        || firstText(root, config.priceSelector)
        || clean(rootText.match(/(?:Q|GTQ)\s*[\d,]+(?:\.\d+)?(?:\s*-\s*(?:Q|GTQ)?\s*[\d,]+(?:\.\d+)?)?/i)?.[0]);
      const discount = firstText(root, config.discountSelector);
      const installment = firstText(root, config.installmentSelector);
      const line = firstText(root, config.lineSelector);

      return {
        source_site: config.sourceSite,
        brand: config.brand,
        line,
        category,
        product_name: title,
        availability: 'Listado en tienda online',
        regular_price: regularPrice,
        sale_price: salePrice,
        discount,
        installment,
        product_url: anchor?.href ? absolute(anchor.href) : '',
        source_url: sourceUrl,
        headline: '',
        description: '',
        warranty: '',
        benefits: '',
        image_url: imageUrl(image),
        image_alt: clean(image?.getAttribute('alt')),
        scraped_at: '',
      };
    };

    const cardRows = Array.from(document.querySelectorAll<HTMLElement>(config.cardSelector))
      .map((card) => {
        const title = firstText(card, config.titleSelector)
          || clean(card.getAttribute('aria-label'))
          || clean(card.querySelector<HTMLAnchorElement>('a[title]')?.getAttribute('title'))
          || clean(card.querySelector<HTMLImageElement>('img[alt]')?.getAttribute('alt'));
        const anchor = card.querySelector<HTMLAnchorElement>(config.anchorSelector ?? 'a[href]');
        const image = card.querySelector<HTMLImageElement>(config.imageSelector ?? 'img');
        return buildRow(card, title, anchor, image);
      })
      .filter((product) => product.product_name && product.product_url);

    const linkRows = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .map((anchor) => {
        const container = anchor.closest('article, li, [class*="product"], [class*="Product"], [data-testid*="product"], [data-testid*="Product"], div') ?? anchor;
        const image = container.querySelector<HTMLImageElement>('img') ?? anchor.querySelector<HTMLImageElement>('img');
        const title = clean(anchor.getAttribute('title'))
          || clean(anchor.textContent)
          || clean(image?.getAttribute('alt'))
          || clean(container.querySelector('h1,h2,h3,h4,[class*="name"],[class*="Name"],[class*="title"],[class*="Title"]')?.textContent);
        return buildRow(container, title, anchor, image);
      })
      .filter((product) => product.product_name && product.product_url);

    const unique = new Map<string, CsvProduct>();
    for (const row of [...cardRows, ...linkRows]) {
      const key = row.product_url || `${row.source_site}|${row.product_name}`;
      if (!unique.has(key)) {
        unique.set(key, row);
      }
    }

    return Array.from(unique.values());
  }, { sourceUrl, config });
}

async function scrapeSleepGallery(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  await goto(page, SLEEP_GALLERY_SOURCE_URL);
  const rows = await extractCardProducts(page, SLEEP_GALLERY_SOURCE_URL, {
    sourceSite: 'Sleep Gallery Guatemala',
    brand: 'Sleep Gallery',
    cardSelector: 'article.sg-card',
    titleSelector: '.sg-card-title',
    categorySelector: '.sg-card-cat',
    lineSelector: '.sg-badge-comfort',
    anchorSelector: 'a.sg-card-btn, a.sg-card-img-wrap, a[href]',
    imageSelector: 'img.vtex-product-summary-2-x-image, img',
    regularPriceSelector: '.sg-price-old',
    salePriceSelector: '.sg-price-new',
    priceSelector: '.sg-card-price',
    discountSelector: '.sg-badge',
  });

  return rows.map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
}

const SERTA_GT_CATALOG_SECTIONS = [
  { line: 'Catálogo', url: SERTA_GT_SOURCE_URL },
  { line: 'Isupport', url: 'https://sertacentroamerica.com/guatemala/categoria-producto/isupport/' },
  { line: 'Perfect Sleeper', url: 'https://sertacentroamerica.com/guatemala/categoria-producto/perfect-sleeper/' },
  { line: 'Perfect Comfort', url: 'https://sertacentroamerica.com/guatemala/categoria-producto/perfect-comfort/' },
  { line: 'Smart Comfort', url: 'https://sertacentroamerica.com/guatemala/categoria-producto/smart-comfort/' },
  { line: 'Perfect Start - Cuna', url: 'https://sertacentroamerica.com/guatemala/producto/perfect-start-colchon-de-cuna/' },
  { line: 'Toppers para Colchón', url: 'https://sertacentroamerica.com/guatemala/toppers-para-colchon/' },
];

async function scrapeSertaGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  const rowsByKey = new Map<string, CsvProduct>();
  const allowedProductPattern = /(colch[oó]n|colchon|cama|base|canap[eé]|camastr[oó]n|cuna|topper)/i;

  for (const section of SERTA_GT_CATALOG_SECTIONS) {
    await goto(page, section.url);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);

    const rows = await extractCardProducts(page, section.url, {
      sourceSite: 'Serta Guatemala',
      brand: 'Serta',
      cardSelector: 'li.product, .products .product, .type-product',
      titleSelector: '.woocommerce-loop-product__title, .product_title, h1.product_title, h2',
      anchorSelector: 'a.woocommerce-LoopProduct-link, a[href*="/guatemala/producto/"]',
      imageSelector: 'img.attachment-woocommerce_thumbnail, .woocommerce-product-gallery img, img',
      regularPriceSelector: '.price del, del .woocommerce-Price-amount, del',
      salePriceSelector: '.price ins, ins .woocommerce-Price-amount, ins',
      priceSelector: '.price, .woocommerce-Price-amount',
      discountSelector: '.onsale',
    });

    for (const row of rows) {
      if (!allowedProductPattern.test(row.product_name)) {
        continue;
      }

      const productUrl = row.product_url || section.url;
      const key = normalizeCatalogText(productUrl || row.product_name);
      const existing = rowsByKey.get(key);
      const candidate: CsvProduct = {
        ...row,
        line: section.line === 'Catálogo' ? row.line : section.line,
        category: /cuna/i.test(row.product_name)
          ? 'Colchones de cuna'
          : /topper/i.test(row.product_name)
            ? 'Toppers para colchón'
            : 'Colchones y camas',
        source_url: SERTA_GT_SOURCE_URL,
        scraped_at: scrapedAt,
      };

      if (!existing) {
        rowsByKey.set(key, candidate);
      } else if (existing.line === '' || existing.line === 'Catálogo') {
        rowsByKey.set(key, {
          ...existing,
          line: candidate.line || existing.line,
          category: candidate.category || existing.category,
          regular_price: candidate.regular_price || existing.regular_price,
          sale_price: candidate.sale_price || existing.sale_price,
          discount: candidate.discount || existing.discount,
          image_url: candidate.image_url || existing.image_url,
          image_alt: candidate.image_alt || existing.image_alt,
        });
      }
    }
  }

  const rows = Array.from(rowsByKey.values());
  console.log(`Serta Guatemala: ${rows.length} productos unicos encontrados en las lineas de camas.`);
  return filterGuatemalaQuetzalRows(rows, 'Serta Guatemala');
}

async function scrapeMattress(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  await goto(page, MATTRESS_SOURCE_URL);
  const rows = await extractCardProducts(page, MATTRESS_SOURCE_URL, {
    sourceSite: 'Mattress Guatemala',
    brand: 'Mattress',
    cardSelector: 'li.product',
    titleSelector: '.woocommerce-loop-product__title',
    categorySelector: '.product-category, .posted_in',
    anchorSelector: 'a.woocommerce-LoopProduct-link, a[href]',
    imageSelector: 'img.vtex-product-summary-2-x-image, img',
    regularPriceSelector: 'del .woocommerce-Price-amount, del',
    salePriceSelector: 'ins .woocommerce-Price-amount, ins',
    priceSelector: '.price',
    discountSelector: '.onsale, .nm-shop-loop-product-title-action',
  });

  return rows.map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
}

async function scrapeBedsDreams(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  void page;
  const collectionSources = [
    { handle: 'simmons', brand: 'Simmons' },
    { handle: 'indufoam', brand: 'Indufoam' },
    { handle: 'bases-electricas', brand: 'Bases Eléctricas' },
  ];
  const comfortSources = [
    { handle: 'confort-suave', line: 'Confort Suave' },
    { handle: 'confort-semi-firme', line: 'Confort Semi Firme' },
    { handle: 'confort-firme', line: 'Confort Firme' },
    { handle: 'confort-ortopedico', line: 'Confort Ortopédico' },
    { handle: 'confort-suave-indufoam', line: 'Confort Suave' },
    { handle: 'confort-semi-firme-indufoam', line: 'Confort Semi Firme' },
    { handle: 'confort-firme-indufoam', line: 'Confort Firme' },
    { handle: 'confort-ortopedico-indufoam', line: 'Confort Ortopédico' },
    { handle: 'confort-extra-firme', line: 'Confort Extra Firme' },
  ];

  const fetchShopifyCollection = async (handle: string): Promise<Array<Record<string, any>>> => {
    const url = new URL(`/collections/${handle}/products.json`, BEDS_DREAMS_SOURCE_URL);
    url.searchParams.set('limit', '250');
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; FACENCO-Catalog/1.0)',
      },
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      throw new Error(`Beds & Dreams coleccion ${handle} respondio HTTP ${response.status}.`);
    }
    const payload = await response.json() as { products?: Array<Record<string, any>> };
    return Array.isArray(payload.products) ? payload.products : [];
  };

  const comfortProducts = await Promise.all(
    comfortSources.map(async (source) => ({
      ...source,
      products: await fetchShopifyCollection(source.handle),
    })),
  );
  const comfortByProductId = new Map<string, Set<string>>();
  for (const source of comfortProducts) {
    for (const product of source.products) {
      const key = String(product.id ?? '');
      if (!key) continue;
      const lines = comfortByProductId.get(key) ?? new Set<string>();
      lines.add(source.line);
      comfortByProductId.set(key, lines);
    }
  }

  const inferComfort = (title: string, description: string, brand: string): string => {
    const text = normalizeCatalogText(`${title} ${description}`);
    if (brand === 'Bases Eléctricas') return 'Bases Eléctricas';
    if (/extra firm|extra firme/.test(text)) return 'Confort Extra Firme';
    if (/ortho|ortoped|back guard/.test(text)) return 'Confort Ortopédico';
    if (/medium|semi firm|semi firme/.test(text)) return 'Confort Semi Firme';
    if (/firm|firme/.test(text)) return 'Confort Firme';
    if (/plush|pillow top|soft|suave/.test(text)) return 'Confort Suave';
    return '';
  };
  const formatPriceRange = (values: number[]): string => {
    if (values.length === 0) return '';
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const format = (value: number) => `Q${value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    return minimum === maximum ? format(minimum) : `${format(minimum)} - ${format(maximum)}`;
  };

  const collectionProducts = await Promise.all(
    collectionSources.map(async (source) => ({
      ...source,
      products: await fetchShopifyCollection(source.handle),
    })),
  );
  const rowsByProductId = new Map<string, CsvProduct>();

  for (const source of collectionProducts) {
    for (const product of source.products) {
      const id = String(product.id ?? '');
      const title = cleanText(String(product.title ?? ''));
      if (!id || !title || !/(cama|colch[oó]n|colchon|base)/i.test(title)) continue;

      const variants = Array.isArray(product.variants) ? product.variants : [];
      const currentPrices = variants
        .map((variant: Record<string, unknown>) => Number(variant.price))
        .filter((value: number) => Number.isFinite(value) && value > 0);
      const comparePrices = variants
        .map((variant: Record<string, unknown>) => Number(variant.compare_at_price))
        .filter((value: number) => Number.isFinite(value) && value > 0);
      if (currentPrices.length === 0) continue;

      const hasDiscount = variants.some((variant: Record<string, unknown>) => {
        const current = Number(variant.price);
        const regular = Number(variant.compare_at_price);
        return Number.isFinite(current) && Number.isFinite(regular) && regular > current;
      });
      const explicitComfort = Array.from(comfortByProductId.get(id) ?? []);
      const description = cleanText(String(product.body_html ?? '').replace(/<[^>]+>/g, ' '));
      const line = explicitComfort.join(' / ') || inferComfort(title, description, source.brand);
      const image = Array.isArray(product.images) ? product.images[0] ?? {} : {};
      const productUrl = new URL(`/products/${String(product.handle ?? '')}`, BEDS_DREAMS_SOURCE_URL).toString();

      rowsByProductId.set(id, {
        source_site: 'Beds & Dreams',
        brand: source.brand,
        line,
        category: /base el[eé]ctrica/i.test(`${title} ${source.brand}`)
          ? 'Bases eléctricas'
          : /cama completa/i.test(title)
            ? 'Camas completas'
            : 'Colchones',
        product_name: title,
        availability: variants.some((variant: Record<string, unknown>) => variant.available !== false)
          ? 'Disponible'
          : 'Agotado',
        regular_price: formatPriceRange(comparePrices.length ? comparePrices : currentPrices),
        sale_price: hasDiscount ? formatPriceRange(currentPrices) : '',
        discount: hasDiscount ? 'Oferta' : '',
        installment: '',
        product_url: productUrl,
        source_url: BEDS_DREAMS_SOURCE_URL,
        headline: title,
        description,
        warranty: '',
        benefits: '',
        image_url: cleanText(String(image.src ?? '')),
        image_alt: title,
        scraped_at: scrapedAt,
      });
    }
  }

  const rows = Array.from(rowsByProductId.values());
  console.log(
    `Beds & Dreams API: Simmons=${collectionProducts[0].products.length}, Indufoam=${collectionProducts[1].products.length}, Bases Electricas=${collectionProducts[2].products.length}, total unico=${rows.length}.`,
  );
  return rows;
}

async function extractFurnitureCityCatalogUrls(page: Page): Promise<string[]> {
  return page.evaluate((sourceUrl) => {
    const absolute = (url: string) => {
      try {
        return new URL(url, sourceUrl).toString();
      } catch {
        return '';
      }
    };

    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .map((anchor) => absolute(anchor.getAttribute('href') ?? ''))
      .filter((url) => /\/product-category\/.*colchones/i.test(url) || /\/producto\//i.test(url));
  }, FURNITURE_CITY_SOURCE_URL);
}

async function scrapeFurnitureCity(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  await goto(page, FURNITURE_CITY_SOURCE_URL);
  const catalogUrls = uniqueValues([
    FURNITURE_CITY_SOURCE_URL,
    ...await extractFurnitureCityCatalogUrls(page),
  ]);
  const rowsByUrl = new Map<string, CsvProduct>();

  for (const catalogUrl of catalogUrls) {
    if (/\/producto\//i.test(catalogUrl)) {
      rowsByUrl.set(catalogUrl, {
        source_site: 'Furniture City Guatemala',
        brand: 'Furniture City',
        line: '',
        category: 'Colchones',
        product_name: cleanText(catalogUrl.split('/').filter(Boolean).pop()?.replace(/-/g, ' ')),
        availability: 'Listado en tienda online',
        regular_price: '',
        sale_price: '',
        discount: '',
        installment: '',
        product_url: catalogUrl,
        source_url: FURNITURE_CITY_SOURCE_URL,
        headline: '',
        description: '',
        warranty: '',
        benefits: '',
        image_url: '',
        image_alt: '',
        scraped_at: scrapedAt,
      });
      continue;
    }

    await goto(page, catalogUrl);
    const rows = await extractCardProducts(page, catalogUrl, {
      sourceSite: 'Furniture City Guatemala',
      brand: 'Furniture City',
      cardSelector: '.product-small.col.has-hover, li.product',
      titleSelector: '.woocommerce-loop-product__title, .product-title',
      categorySelector: '.product-cat',
      anchorSelector: '.woocommerce-LoopProduct-link, a[href]',
      imageSelector: 'img.vtex-product-summary-2-x-image, img',
      regularPriceSelector: 'del .woocommerce-Price-amount, del',
      salePriceSelector: 'ins .woocommerce-Price-amount, ins',
      priceSelector: '.price',
      discountSelector: '.onsale',
    });

    for (const row of rows) {
      rowsByUrl.set(row.product_url, {
        ...row,
        scraped_at: scrapedAt,
      });
    }
  }

  return Array.from(rowsByUrl.values());
}

// Filtro comercial FACENCO.
// Aqui puedes ajustar que productos interesan para el catalogo comparativo.
const BED_PRODUCT_INCLUDE_WORDS = [
  'colchon', 'colchÃ³n', 'mattress', 'cama', 'bed', 'base', 'box spring', 'boxspring',
  'almohada', 'protector', 'funda', 'sabana', 'sÃ¡bana', 'cobertor',
  'edredon', 'edredÃ³n', 'duvet', 'frazada', 'comforter', 'cabecera', 'respaldo',
  'sofa cama', 'sofÃ¡ cama', 'sillon cama', 'sillÃ³n cama', 'futon', 'futÃ³n',
  'litera', 'dormitorio', 'recamara', 'recÃ¡mara', 'celaje', 'celajes',
];

const BED_PRODUCT_STRONG_INCLUDE_WORDS = [
  'colchon', 'colchÃ³n', 'mattress', 'cama', 'base', 'box spring', 'boxspring',
  'almohada', 'protector', 'sabana', 'sÃ¡bana', 'cobertor', 'edredon', 'edredÃ³n',
  'duvet', 'frazada', 'cabecera', 'respaldo', 'sofa cama', 'sofÃ¡ cama',
  'sillon cama', 'sillÃ³n cama', 'futon', 'futÃ³n', 'litera',
];

const BED_PRODUCT_EXCLUDE_WORDS = [
  'laptop', 'notebook', 'computadora', 'pc gamer', 'monitor', 'teclado', 'mouse',
  'celular', 'telefono', 'telÃ©fono', 'smartphone', 'tablet', 'ipad', 'iphone',
  'samsung', 'galaxy', 'xiaomi', 'huawei', 'motorola', 'honor', 'realme', 'infinix',
  'televisor', 'tv ', 'smart tv', 'pantalla', 'proyector', 'camara', 'cÃ¡mara',
  'refrigeradora', 'refrigerador', 'lavadora', 'secadora', 'estufa', 'cocina',
  'microondas', 'licuadora', 'freidora', 'cafetera', 'batidora', 'audio', 'bocina',
  'parlante', 'audifono', 'audÃ­fono', 'consola', 'playstation', 'xbox', 'nintendo',
  'impresora', 'router', 'ups', 'bicicleta', 'moto', 'llanta', 'juguete',
  'maybelline', 'maquillaje', 'labial', 'rimel', 'rÃ­mel', 'mascara', 'mÃ¡scara',
  'face studio', 'sun kisser', 'rubor', 'base liquida', 'base lÃ­quida', 'cosmetico',
  'cosmÃ©tico', 'perfume', 'crema facial', 'shampoo', 'acondicionador',
  'paw patrol', 'figura de accion', 'figura de acciÃ³n', 'helicoptero', 'helicÃ³ptero',
  'rescue', 'search', 'muÃ±eca', 'muneca', 'carro juguete', 'lego', 'barbie',
];

function normalizeCatalogText(value: string): string {
  return cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}


function isObviousCatalogNoise(row: CsvProduct): boolean {
  const text = normalizeCatalogText([
    row.product_name,
    row.headline,
    row.product_url,
  ].filter(Boolean).join(' '));

  return (
    text.includes('saltar al contenido') ||
    text.includes('skip to content') ||
    /#main($|[/?#&])/.test(row.product_url || '')
  );
}
function isLikelyCatalogNoise(row: CsvProduct): boolean {
  const title = normalizeCatalogText(row.product_name);
  const source = normalizeCatalogText(`${row.source_site} ${row.brand} ${row.source_url}`);

  const trustedBedStores = [
    'facenco',
    'olympia',
    'colchoneria',
    'sleep gallery',
    'mattress',
    'beds & dreams',
    'furniture city',
    'la curacao',
    'max guatemala',
    'elektra guatemala',
    'walmart guatemala',
    'cemaco guatemala',
    'siman guatemala',
    'dormisueÃ±os guatemala',
    'dormisueÃ±os',
  ];

  const isTrustedBedStore = trustedBedStores.some((store) => source.includes(store));
  if (isTrustedBedStore) {
    return false;
  }

  const hasStrongWord = BED_PRODUCT_STRONG_INCLUDE_WORDS.some((word) =>
    title.includes(normalizeCatalogText(word)),
  );

  if (hasStrongWord) {
    return false;
  }

  return true;
}

function hasRelevantBedProduct(row: CsvProduct): boolean {
  const productText = normalizeCatalogText([
    row.product_name,
    row.category,
    row.line,
    row.headline,
    row.description,
    row.image_alt,
  ].filter(Boolean).join(' '));

  const urlText = normalizeCatalogText([
    row.product_url,
    row.source_url,
  ].filter(Boolean).join(' '));

  const sourceText = normalizeCatalogText([
    row.source_site,
    row.brand,
  ].filter(Boolean).join(' '));

  const fullText = `${productText} ${urlText} ${sourceText}`.trim();
  if (!fullText) {
    return false;
  }

  if (isObviousCatalogNoise(row)) {
    return false;
  }

  const hardExcludeText = productText || fullText;
  if (BED_PRODUCT_EXCLUDE_WORDS.some((word) => hardExcludeText.includes(normalizeCatalogText(word)))) {
    return false;
  }

  const hasProductKeyword = BED_PRODUCT_INCLUDE_WORDS.some((word) => productText.includes(normalizeCatalogText(word)));
  const hasUrlKeyword = BED_PRODUCT_STRONG_INCLUDE_WORDS.some((word) => urlText.includes(normalizeCatalogText(word)));
  const trustedStore = [
    'facenco',
    'olympia',
    'colchoneria',
    'sleep gallery',
    'mattress',
    'beds & dreams',
    'furniture city',
    'la curacao',
    'max guatemala',
    'elektra guatemala',
    'walmart guatemala',
    'cemaco guatemala',
    'siman guatemala',
    'dormisueÃ±os guatemala',
    'dormisueÃ±os',
  ].some((store) => sourceText.includes(store));

  if (hasProductKeyword) {
    return true;
  }

  if (trustedStore && hasUrlKeyword) {
    return true;
  }

  return false;
}

function csvFilterText(row: CsvProduct, ...keys: string[]): string {
  const record = row as unknown as Record<string, unknown>;
  return keys
    .map((key) => record[key])
    .filter((value): value is string | number => {
      if (typeof value === 'number') return Number.isFinite(value);
      return typeof value === 'string' && value.trim().length > 0;
    })
    .map((value) => String(value))
    .join(' ');
}


function makeFinalCatalogFilterKey(row: CsvProduct): string {
  return normalizeCatalogText([
    csvFilterText(row, 'source_site', 'sitio_fuente', 'sourceSite', 'storeName', 'tienda'),
    csvFilterText(row, 'product_name', 'producto', 'productName', 'titulo', 'title', 'headline'),
    csvFilterText(row, 'product_url', 'url_producto', 'productUrl', 'url'),
    csvFilterText(row, 'regular_price', 'precio_regular', 'regularPrice', 'precioRegular'),
    csvFilterText(row, 'sale_price', 'precio_oferta', 'salePrice', 'precioOferta'),
  ].filter(Boolean).join('|'));
}
function getPriceValidationText(row: CsvProduct): string {
  return csvFilterText(
    row,
    'regular_price',
    'sale_price',
    'precio_regular',
    'precio_oferta',
    'precioRegular',
    'precioOferta',
    'regularPrice',
    'salePrice',
    'product_name',
    'producto',
    'productName',
    'titulo',
    'title',
    'headline',
    'descripcion',
    'description',
    'beneficios',
    'benefits',
    'rawText'
  );
}



function hasQuetzalPrice(row: CsvProduct): boolean {
  const text = getPriceValidationText(row);
  return /(?:^|[^A-Za-z])Q\s?\d|GTQ|Quetzal/i.test(text);
}




function filterGuatemalaQuetzalRows(rows: CsvProduct[], sourceSite = 'Tienda'): CsvProduct[] {
  const withQuetzal = rows.filter((row) => hasQuetzalPrice(row));
  const withBedProduct = rows.filter((row) => hasRelevantBedProduct(row));
  const kept = rows.filter((row) => hasQuetzalPrice(row) && hasRelevantBedProduct(row));

  console.log(
    `Diagnostico ${sourceSite}: encontrados=${rows.length}, con_precio_Q=${withQuetzal.length}, relacionados_cama=${withBedProduct.length}, guardados=${kept.length}`,
  );

  if (rows.length > 0 && kept.length === 0) {
    const sample = rows
      .slice(0, 5)
      .map((row) => cleanText(`${row.product_name} | precio: ${row.sale_price || row.regular_price || 'sin precio'} | url: ${row.product_url}`))
      .join(' || ');
    console.log(`Muestra descartada ${sourceSite}: ${sample}`);
  }

  return kept;
}

async function autoScrollCatalogPage(page: Page): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(900);
  }
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
}
async function scrapeGenericGuatemalaStore(
  page: Page,
  scrapedAt: string,
  sourceUrl: string,
  sourceSite: string,
  brand: string,
): Promise<CsvProduct[]> {
  await goto(page, sourceUrl);
  await autoScrollCatalogPage(page);
  const rows = await extractCardProducts(page, sourceUrl, {
    sourceSite,
    brand,
    cardSelector: [
      'li.product-item',
      '.product-item-info',
      '.product-card',
      '.product',
      '.vtex-product-summary-2-x-container',
      '.vtex-search-result-3-x-galleryItem',
      '[class*="galleryItem"]',
      '.vtex-search-result-3-x-galleryItem',
      '[class*="galleryItem"]',
      '[class*="vtex-product-summary"]',
      '[class*="product-summary"]',
      '[data-testid*="product"]',
      '[class*="ProductSummary"]',
      '[class*="ProductSummary"]',
      'article',
    ].join(', '),
    titleSelector: [
      '.product-item-link',
      '.product-name',
      '.product-title',
      '.product-card__name',
      '.vtex-product-summary-2-x-productBrand',
      '[class*="productBrand"]',
      '[class*="productName"]',
      '[class*="nameContainer"]',
      '[class*="nameContainer"]',
      '[data-testid="product-title"]',
      'h2',
      'h3',
      'a[title]',
    ].join(', '),
    categorySelector: '.category, .product-category, .breadcrumb, [class*="category"]',
    anchorSelector: 'a.vtex-product-summary-2-x-clearLink, a[href]',
    imageSelector: 'img.vtex-product-summary-2-x-image, img',
    regularPriceSelector: '.old-price, .was-price, del, .price-old, [class*="oldPrice"], [class*="listPrice"], [class*="ListPrice"], [class*="list-price"]',
    salePriceSelector: '.special-price, .sale-price, ins, .price-final_price, [class*="sellingPrice"], [class*="SellingPrice"], [class*="salePrice"], [class*="currencyContainer"]',
    priceSelector: '.price, .price-box, .product-price, [class*="sellingPrice"], [class*="SellingPrice"], [class*="currencyContainer"], [class*="price"], [class*="Price"], [data-testid*="price"]',
    discountSelector: '.discount, .badge, .label, .tag, [class*="discount"], [class*="promo"]',
    installmentSelector: '.installment, .cuotas, [class*="installment"], [class*="cuota"]',
  });

  return filterGuatemalaQuetzalRows(rows, sourceSite).map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
}

// MAX Guatemala: extractor especializado para tarjetas con boton Agregar.
const MAX_GT_SEARCH_URLS = [
  'https://www.max.com.gt/search?q=camas',
  'https://www.max.com.gt/search?q=colchon',
  'https://www.max.com.gt/search?q=colchones',
  'https://www.max.com.gt/search?q=base%20cama',
  'https://www.max.com.gt/search?q=almohada',
];

function maxUrlWithPage(baseUrl: string, pageNumber: number): string {
  if (pageNumber <= 1) return baseUrl;
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${pageNumber}`;
}

async function prepareMaxPage(page: Page, sourceUrl: string): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('country', 'GT');
      localStorage.setItem('countryCode', 'GT');
      localStorage.setItem('currency', 'GTQ');
      localStorage.setItem('location', JSON.stringify({ country: 'GT', department: 'Guatemala', municipality: 'Guatemala' }));
    } catch {
      // La pagina puede bloquear localStorage en algunos contextos.
    }
  }).catch(() => undefined);

  await page.context().addCookies([
    { name: 'country', value: 'GT', domain: '.max.com.gt', path: '/' },
    { name: 'currency', value: 'GTQ', domain: '.max.com.gt', path: '/' },
  ]).catch(() => undefined);

  await goto(page, sourceUrl);
  await page.waitForTimeout(3500);
}

async function autoScrollMaxCatalogPage(page: Page): Promise<void> {
  let previousSignal = 0;
  let stableChecks = 0;

  for (let i = 0; i < 26 && stableChecks < 5; i += 1) {
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(900);

    const currentSignal = await page.evaluate(() => {
      const text = document.body?.innerText ?? '';
      const addCount = (text.match(/Agregar/gi) ?? []).length;
      const priceCount = (text.match(/Q\s*\d/gi) ?? []).length;
      return addCount + priceCount;
    }).catch(() => 0);

    if (currentSignal <= previousSignal) {
      stableChecks += 1;
    } else {
      stableChecks = 0;
      previousSignal = currentSignal;
    }
  }

  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => undefined);
}

async function extractMaxProductsFromPage(page: Page, sourceUrl: string, scrapedAt: string): Promise<CsvProduct[]> {
  const rows = await page.evaluate(({ sourceUrl, scrapedAt }) => {
    type MaxDomProduct = {
      name: string;
      brand: string;
      regularPrice: string;
      salePrice: string;
      discount: string;
      productUrl: string;
      imageUrl: string;
      imageAlt: string;
    };

    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const absolute = (url: string) => {
      try {
        return new URL(url, sourceUrl).toString();
      } catch {
        return url;
      }
    };
    const moneyNumber = (value: string) => {
      const parsed = Number(value.replace(/Q|GTQ/gi, '').replace(/\s/g, '').replace(/,/g, '').replace(/[^\d.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    };
    const formatQ = (value: number) => `Q ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const knownBrands = [
      'Comfort Life', 'Olympia', 'Facenco', 'Therapedic', 'Serta', 'Belezza', 'Capriva',
      'La Bodegona del Mueble', 'Muebles Fiesta', 'Facomsa', 'Tuco', 'Hilker',
      'Simmons', 'Indufoam', 'Camas restonic', 'Restonic', 'Kangaroo', 'Lucca',
      'Sealy', 'Sienna', 'Siesta', 'Nap&Co', 'Hyde Lane', 'Providencia',
      'Furniture City', 'My Baby Mattress', 'Dreamy', 'Genial Baby', 'Libsa',
      'Panzerglass', 'Utopia Bedding', 'Ebo', 'Bbluv', 'White Home',
    ];
    const bedWords = /(cama|camas|colch[oÃ³]n|colchon|colchones|mattress|base|box|almohada|pillow|cabecera|respaldo|s[aÃ¡]bana|sabana|protector|edred[oÃ³]n|comforter|duvet|restonic|olympia|simmons|indufoam|facenco|sealy|serta|kangaroo|therapedic|comfort life)/i;
    const ignoreLine = /(agregar|vendedor:|v[Ã¡a]lido|patrocinado|rebaja|oferta|categorias|categorÃ­as|rastrea|mi cuenta|carrito|resultados para|ordenar:|marca$|marketplace|tiendas|cat[Ã¡a]logo|tu ubicaci[oÃ³]n|puntos max|viajes max|bodas max)/i;
    const normalizeMaxPriceText = (value: string) => {
      return value
        .replace(/Q\s*\n\s*([0-9][0-9,.]*)\.\s*\n\s*([0-9]{2})/g, 'Q$1.$2')
        .replace(/Q\s*([0-9][0-9,.]*)\.\s+([0-9]{2})(?!\d)/g, 'Q$1.$2')
        .replace(/Q\s*\n\s*([0-9][0-9,.]*(?:\.[0-9]{2})?)/g, 'Q$1');
    };

    const buildProductFromText = (textValue: string, card?: HTMLElement): MaxDomProduct | null => {
      const text = normalizeMaxPriceText(textValue);
      const compactText = clean(text);
      if (!/Q\s*\d|GTQ/i.test(compactText) || !bedWords.test(compactText)) return null;

      const rawLines = text
        .split(/\n/)
        .map(clean)
        .filter(Boolean);
      const lines = rawLines.length > 1
        ? rawLines
        : compactText.split(/ {2,}/).map(clean).filter(Boolean);

      const moneyMatches = compactText.match(/Q\s*[0-9][0-9,.]*(?:\.[0-9]{2})?/gi) ?? [];
      const moneyValues = moneyMatches
        .map((price) => ({ text: clean(price), value: moneyNumber(price) }))
        .filter((price): price is { text: string; value: number } => price.value !== null && price.value > 0);

      if (moneyValues.length === 0) return null;

      const sortedPrices = [...moneyValues].sort((a, b) => a.value - b.value);
      const salePrice = sortedPrices.length > 1 ? formatQ(sortedPrices[0].value) : '';
      const regularPrice = formatQ(sortedPrices[sortedPrices.length - 1].value);
      const discount = clean(compactText.match(/-\s*\d+%/)?.[0]);
      const brand = knownBrands.find((brandName) =>
        lines.some((line) => line.toLowerCase() === brandName.toLowerCase() || line.toLowerCase().includes(brandName.toLowerCase())),
      ) ?? 'MAX';

      const productLine = lines.find((line) =>
        bedWords.test(line)
        && !ignoreLine.test(line)
        && !/Q\s*\d|GTQ|\d+%/.test(line)
        && line.toLowerCase() !== brand.toLowerCase()
        && line.length >= 8,
      );

      const image = card?.querySelector<HTMLImageElement>('img') ?? null;
      const anchor = card
        ? Array.from(card.querySelectorAll<HTMLAnchorElement>('a[href]'))
          .find((item) => {
            const href = item.getAttribute('href') ?? '';
            return href && !href.startsWith('#') && !/login|cuenta|carrito|checkout/i.test(href);
          })
        : null;
      const srcset = image?.getAttribute('srcset') || image?.getAttribute('data-srcset') || '';
      const srcsetFirst = srcset.split(',').map((item) => item.trim().split(/\s+/)[0]).find(Boolean) ?? '';
      const imageSrc = image?.currentSrc || image?.src || image?.getAttribute('data-src') || image?.getAttribute('src') || srcsetFirst || '';
      const imageAlt = clean(image?.getAttribute('alt'));
      const name = productLine || imageAlt;

      if (!name || !bedWords.test(`${name} ${imageAlt}`)) return null;

      return {
        name,
        brand,
        regularPrice,
        salePrice,
        discount,
        productUrl: anchor?.href ? absolute(anchor.href) : `${sourceUrl}#${encodeURIComponent(name)}`,
        imageUrl: imageSrc && !imageSrc.startsWith('data:') ? absolute(imageSrc) : '',
        imageAlt,
      };
    };

    const pickCard = (button: Element): HTMLElement | null => {
      let current: Element | null = button;
      let best: HTMLElement | null = null;
      for (let depth = 0; current && depth < 8; depth += 1) {
        const element = current as HTMLElement;
        const text = clean(element.innerText || element.textContent);
        const addCount = (text.match(/Agregar/gi) ?? []).length;

        if (addCount > 1) {
          break;
        }

        if (/Q\s*\d|GTQ/i.test(text) && bedWords.test(text)) {
          best = element;
        }
        current = current.parentElement;
      }
      return best;
    };

    const results: MaxDomProduct[] = [];
    const buttons = Array.from(document.querySelectorAll('button, a'))
      .filter((element) => isVisible(element) && /agregar/i.test(clean(element.textContent)));

    for (const button of buttons) {
      const card = pickCard(button);
      if (!card) continue;
      const product = buildProductFromText(card.innerText || card.textContent || '', card);
      if (product) results.push(product);
    }

    if (results.length === 0) {
      const bodyText = document.body?.innerText ?? '';
      const parts = normalizeMaxPriceText(bodyText).split(/\bAgregar\b/i);
      for (const part of parts) {
        const product = buildProductFromText(part);
        if (product) results.push(product);
      }
    }

    return results.map((row): CsvProduct => ({
      source_site: 'MAX Guatemala',
      brand: row.brand || 'MAX',
      line: row.brand || 'MAX',
      category: /almohada|pillow/i.test(row.name) ? 'Almohadas' : /base|cama/i.test(row.name) ? 'Camas y bases' : 'Colchones',
      product_name: row.name,
      availability: 'Listado en tienda online',
      regular_price: row.regularPrice,
      sale_price: row.salePrice,
      discount: row.discount,
      installment: '',
      product_url: row.productUrl,
      source_url: sourceUrl,
      headline: row.name,
      description: '',
      warranty: '',
      benefits: '',
      image_url: row.imageUrl,
      image_alt: row.imageAlt || row.name,
      scraped_at: scrapedAt,
    }));
  }, { sourceUrl, scrapedAt });

  const unique = new Map<string, CsvProduct>();
  for (const row of rows) {
    const key = row.product_url || `${row.product_name}|${row.regular_price}|${row.sale_price}`;
    if (!unique.has(key)) {
      unique.set(key, row);
    }
  }

  return Array.from(unique.values());
}

async function scrapeMaxGtDetailed(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  const rowsByKey = new Map<string, CsvProduct>();
    // MAX usa scroll infinito; el parametro page repite resultados y vuelve lenta la corrida.
  const maxPagesPerSearch = 1;

  for (const searchUrl of MAX_GT_SEARCH_URLS) {
    let emptyPages = 0;

    for (let pageNumber = 1; pageNumber <= maxPagesPerSearch && emptyPages < 2; pageNumber += 1) {
      const sourceUrl = maxUrlWithPage(searchUrl, pageNumber);
      console.log(`MAX Guatemala: leyendo ${sourceUrl}...`);

      await prepareMaxPage(page, sourceUrl);
      await autoScrollMaxCatalogPage(page);

      const pageRows = await extractMaxProductsFromPage(page, sourceUrl, scrapedAt);
      const diagnostic = await page.evaluate(() => {
        const text = document.body?.innerText ?? '';
        return {
          textLength: text.length,
          agregar: (text.match(/Agregar/gi) ?? []).length,
          q: (text.match(/Q\s*\d/gi) ?? []).length,
        };
      }).catch(() => ({ textLength: 0, agregar: 0, q: 0 }));
      console.log(`MAX Guatemala: pagina ${pageNumber} de "${searchUrl}" genero ${pageRows.length} candidatos. Diagnostico texto=${diagnostic.textLength}, agregar=${diagnostic.agregar}, precios_Q=${diagnostic.q}.`);

      if (pageRows.length === 0) {
        emptyPages += 1;
        continue;
      }

      emptyPages = 0;
      for (const row of pageRows) {
        const key = row.product_url || `${row.product_name}|${row.regular_price}|${row.sale_price}`;
        if (!rowsByKey.has(key)) {
          rowsByKey.set(key, row);
        }
      }
    }
  }

  const rows = Array.from(rowsByKey.values());
  console.log(`MAX Guatemala: candidatos unicos antes de filtros=${rows.length}`);

  return filterGuatemalaQuetzalRows(rows, 'MAX Guatemala').map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
}
// FIN MAX Guatemala extractor especializado.


async function scrapeLaCuracao(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  return scrapeGenericGuatemalaStore(page, scrapedAt, LA_CURACAO_SOURCE_URL, 'La Curacao Guatemala', 'La Curacao');
}

async function scrapeMaxGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  return scrapeMaxGtDetailed(page, scrapedAt);
}

async function scrapeElektraGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  return scrapeGenericGuatemalaStore(page, scrapedAt, ELEKTRA_GT_SOURCE_URL, 'Elektra Guatemala', 'Elektra');
}

async function scrapeWalmartGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  const rowsByUrl = new Map<string, CsvProduct>();
  const pageSize = 50;
  const maxProductsPerSearch = 300;
  const searchTerms = ['cama', 'colchon', 'almohada', 'base cama', 'protector cama'];

  const formatQ = (value: unknown): string => {
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numberValue) || numberValue <= 0) return '';
    return 'Q ' + numberValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const categoryFromName = (name: string): string => {
    const lower = normalizeCatalogText(name);
    if (lower.includes('almohada')) return 'Almohadas';
    if (lower.includes('protector') || lower.includes('cobertor') || lower.includes('sabana') || lower.includes('funda')) return 'Complementos de cama';
    if (lower.includes('base') || lower.includes('cabecera') || lower.includes('cama')) return 'Camas y bases';
    if (lower.includes('colchon')) return 'Colchones';
    return 'Camas y colchones';
  };

  for (const term of searchTerms) {
    for (let from = 0; from < maxProductsPerSearch; from += pageSize) {
      const to = from + pageSize - 1;
      const apiUrl = 'https://www.walmart.com.gt/api/catalog_system/pub/products/search/' + encodeURIComponent(term) + '?_from=' + from + '&_to=' + to;
      console.log('Walmart Guatemala API: leyendo "' + term + '" productos ' + from + '-' + to + '...');

      const response = await page.goto(apiUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
      if (!response || !response.ok()) {
        console.log('Walmart Guatemala API: respuesta no disponible para "' + term + '" rango ' + from + '-' + to);
        break;
      }

      const raw = await page.locator('body').innerText({ timeout: 15000 }).catch(() => '');
      let products: any[] = [];
      try {
        const parsed = JSON.parse(raw);
        products = Array.isArray(parsed) ? parsed : [];
      } catch {
        products = [];
      }

      if (products.length === 0) {
        console.log('Walmart Guatemala API: sin productos para "' + term + '" rango ' + from + '-' + to);
        break;
      }

      for (const product of products) {
        const item = Array.isArray(product.items) ? product.items[0] : undefined;
        const sellers = Array.isArray(item?.sellers) ? item.sellers : [];
        const seller = sellers.find((entry: any) => entry?.commertialOffer?.Price) || sellers[0];
        const offer = seller?.commertialOffer || {};
        const price = Number(offer.Price || 0);
        const listPrice = Number(offer.ListPrice || 0);
        const productName = cleanText(product.productName || product.productTitle || product.productReference || item?.nameComplete || item?.name);
        if (!productName) continue;

        const productUrl = product.link || (product.linkText ? 'https://www.walmart.com.gt/' + product.linkText + '/p' : WALMART_GT_SOURCE_URL);
        const image = Array.isArray(item?.images) && item.images[0] ? item.images[0] : {};
        const salePrice = formatQ(price);
        const regularPrice = listPrice && listPrice !== price ? formatQ(listPrice) : salePrice;
        const availability = Number(offer.AvailableQuantity || 0) > 0 ? 'Disponible' : 'Listado en tienda online';

        rowsByUrl.set(productUrl, {
          source_site: 'Walmart Guatemala',
          brand: cleanText(product.brand || 'Walmart'),
          line: term,
          category: categoryFromName(productName),
          product_name: productName,
          availability,
          regular_price: regularPrice,
          sale_price: salePrice,
          discount: '',
          installment: '',
          product_url: productUrl,
          source_url: WALMART_GT_SOURCE_URL,
          headline: productName,
          description: cleanText(product.description || product.metaTagDescription),
          warranty: '',
          benefits: '',
          image_url: cleanText(image.imageUrl),
          image_alt: cleanText(image.imageText || productName),
          scraped_at: scrapedAt,
        });
      }

      if (products.length < pageSize) break;
    }
  }

  const rows = Array.from(rowsByUrl.values());
  console.log('Walmart Guatemala API: encontrados antes de filtro=' + rows.length);
  return filterGuatemalaQuetzalRows(rows, 'Walmart Guatemala');
}


async function scrapeCemacoGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  return scrapeGenericGuatemalaStore(page, scrapedAt, CEMACO_GT_SOURCE_URL, 'Cemaco Guatemala', 'Cemaco');
}

function simanUrlWithPage(baseUrl: string, pageNumber: number): string {
  if (pageNumber <= 1) return baseUrl;
  const url = new URL(baseUrl);
  url.searchParams.set('page', String(pageNumber));
  return url.toString();
}

async function scrapeSimanGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  const rowsByKey = new Map<string, CsvProduct>();
  const maxPages = 8;
  const pageTimeoutMs = 90_000;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const pageUrl = simanUrlWithPage(SIMAN_GT_SOURCE_URL, pageNumber);
    console.log('Siman Guatemala: leyendo pagina ' + pageNumber + ' de ' + maxPages + '...');

    let pageTimeoutHandle: NodeJS.Timeout | undefined;
    let pageRows: CsvProduct[];
    try {
      const pageTimeout = new Promise<never>((_, reject) => {
        pageTimeoutHandle = setTimeout(() => {
          reject(new Error(`Siman Guatemala: pagina ${pageNumber} excedio 90 segundos.`));
        }, pageTimeoutMs);
      });
      pageRows = await Promise.race([
        scrapeGenericGuatemalaStore(
          page,
          scrapedAt,
          pageUrl,
          'Siman Guatemala',
          'Siman',
        ),
        pageTimeout,
      ]);
    } catch (error) {
      if (rowsByKey.size === 0) throw error;
      console.log(
        `ADVERTENCIA: Siman Guatemala conservara ${rowsByKey.size} productos parciales `
        + `porque la pagina ${pageNumber} no termino: ${errorMessage(error)}`,
      );
      break;
    } finally {
      if (pageTimeoutHandle) clearTimeout(pageTimeoutHandle);
    }

    console.log('Siman Guatemala: pagina ' + pageNumber + ' genero ' + pageRows.length + ' productos utiles.');

    for (const row of pageRows) {
      const key = (row.product_url || (row.product_name + '|' + row.sale_price + '|' + row.regular_price)).toLowerCase();
      if (key && !rowsByKey.has(key)) {
        rowsByKey.set(key, row);
      }
    }

    if (pageNumber > 1 && pageRows.length === 0) {
      console.log('Siman Guatemala: pagina ' + pageNumber + ' no devolvio productos utiles. Se detiene paginacion.');
      break;
    }
  }

  const rows = Array.from(rowsByKey.values());
  console.log('Siman Guatemala: total unico despues de paginar=' + rows.length);
  return rows;
}

async function scrapeVisualProductGrid(
  page: Page,
  scrapedAt: string,
  sourceUrl: string,
  sourceSite: string,
  brandFallback: string
): Promise<CsvProduct[]> {
  await goto(page, sourceUrl);
  await autoScrollCatalogPage(page);
  await page.waitForTimeout(1500);

  const extracted = await page.evaluate((args) => {
    const clean = (value: string | null | undefined): string =>
      (value ?? '').replace(/\s+/g, ' ').trim();

    const absoluteUrl = (href: string | null | undefined): string => {
      if (!href || href === '#') return args.sourceUrl;
      try {
        return new URL(href, window.location.href).toString();
      } catch {
        return args.sourceUrl;
      }
    };

    const visible = (element: Element): boolean => {
      const html = element as HTMLElement;
      const rect = html.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20;
    };

    const bedWords = /(cama|camas|colch[o\u00f3]n|colchon|box|base|cabecera|almohada|pillow|sleep|dream|restonic|simmons|serta|sealy|olympia|facenco|indufoam|comfort life|therapedic|siesta)/i;
    const ignoreWords = /(telefono|tel[e\u00e9]fono|whatsapp|carrito|login|cuenta|favoritos|menu|categorias|filtrar por|ordenar por|cloudflare|5xx-error)/i;
    const priceRegex = /Q\s*[0-9][0-9,]*(?:\.[0-9]{2})?/gi;

    const parsePrice = (value: string): number | null => {
      const match = value.match(/Q\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i);
      if (!match) return null;
      const parsed = Number(match[1].replace(/,/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    };

    const formatPrice = (value: number | null): string => {
      if (value === null) return '';
      return `Q${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const candidates = new Set<HTMLElement>();
    const cardSelectors = [
      'li.product',
      'article',
      '.product',
      '.product-card',
      '.product-item',
      '.woocommerce-LoopProduct-link',
      '[class*="product"]',
      '[class*="Product"]',
      '[class*="card"]',
      '[class*="Card"]'
    ];

    const addCandidate = (element: Element | null) => {
      if (!element) return;
      const html = element as HTMLElement;
      if (!visible(html)) return;
      const text = clean(html.innerText || html.textContent);
      if (!priceRegex.test(text)) {
        priceRegex.lastIndex = 0;
        return;
      }
      priceRegex.lastIndex = 0;
      if (!bedWords.test(text)) return;
      if (text.length > 3200) return;
      candidates.add(html);
    };

    for (const selector of cardSelectors) {
      document.querySelectorAll(selector).forEach(addCandidate);
    }

    const actions = Array.from(document.querySelectorAll('button, a, [role="button"]')).filter((element) => {
      const text = clean(element.textContent);
      return /(comprar|agregar|a[n\u00f1]adir|ver producto|cotizar)/i.test(text);
    });

    for (const action of actions) {
      let current: Element | null = action;
      let best: HTMLElement | null = null;

      for (let depth = 0; current && depth < 9; depth += 1) {
        const html = current as HTMLElement;
        const text = clean(html.innerText || html.textContent);
        const actionCount = (text.match(/(comprar|agregar|a[n\u00f1]adir|ver producto|cotizar)/gi) ?? []).length;

        if (depth > 0 && (actionCount > 1 || text.length > 2800)) {
          break;
        }

        if (priceRegex.test(text) && bedWords.test(text)) {
          best = html;
        }
        priceRegex.lastIndex = 0;
        current = current.parentElement;
      }

      addCandidate(best);
    }

    const titleSelectors = [
      '.woocommerce-loop-product__title',
      '.product-title',
      '.product-name',
      '[class*="title"]',
      '[class*="Title"]',
      '[class*="name"]',
      '[class*="Name"]',
      'h2',
      'h3',
      'h4',
      'a[title]'
    ];

    const pickTitle = (card: HTMLElement): string => {
      for (const selector of titleSelectors) {
        const found = card.querySelector(selector);
        const title = clean(found?.getAttribute('title') || found?.textContent);
        if (title && bedWords.test(title) && !ignoreWords.test(title) && title.length <= 180) {
          return title;
        }
      }

      const lines = clean(card.innerText || card.textContent)
        .split(/(?=Q\s*[0-9])|Comprar|Agregar|A\u00f1adir|Oferta|Desde:|Vendedor:/i)
        .map(clean)
        .filter(Boolean);

      const bestLine = lines
        .flatMap((line) => line.split(/\s{2,}/).map(clean))
        .filter((line) => bedWords.test(line) && !priceRegex.test(line) && !ignoreWords.test(line))
        .sort((a, b) => Math.abs(a.length - 55) - Math.abs(b.length - 55))[0];

      priceRegex.lastIndex = 0;
      return clean(bestLine);
    };

    const pickImage = (card: HTMLElement): { imageUrl: string; imageAlt: string } => {
      const img = card.querySelector('img') as HTMLImageElement | null;
      return {
        imageUrl: img?.src || img?.getAttribute('data-src') || img?.getAttribute('data-lazy-src') || '',
        imageAlt: clean(img?.alt)
      };
    };

    const pickUrl = (card: HTMLElement): string => {
      const anchors = Array.from(card.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const productAnchor = anchors.find((anchor) => {
        const href = anchor.getAttribute('href') ?? '';
        const text = clean(anchor.textContent || anchor.getAttribute('title'));
        return href && href !== '#' && !/cart|carrito|login|cuenta|favoritos/i.test(href) && (bedWords.test(text) || /producto|product|cama|colchon/i.test(href));
      }) ?? anchors.find((anchor) => (anchor.getAttribute('href') ?? '') !== '#');
      return absoluteUrl(productAnchor?.getAttribute('href'));
    };

    const rows: any[] = [];
    const seen = new Set<string>();

    for (const card of Array.from(candidates)) {
      const text = clean(card.innerText || card.textContent);
      if (ignoreWords.test(text) && !bedWords.test(text)) continue;

      const title = pickTitle(card);
      const priceMatches = Array.from(text.matchAll(priceRegex)).map((match) => match[0]);
      priceRegex.lastIndex = 0;
      const prices = priceMatches
        .map(parsePrice)
        .filter((price): price is number => price !== null && price > 0)
        .filter((price) => price >= 100 && price <= 100000);

      if (!title || prices.length === 0) continue;

      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const url = pickUrl(card);
      const key = `${title.toLowerCase()}|${url}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const image = pickImage(card);
      const category = /almohada|pillow/i.test(title)
        ? 'Almohadas'
        : /base|box|cabecera|cama/i.test(title)
          ? 'Camas y bases'
          : 'Colchones';

      rows.push({
        source_site: args.sourceSite,
        brand: args.brandFallback,
        line: '',
        category,
        product_name: title,
        availability: 'Listado en tienda online',
        regular_price: formatPrice(maxPrice),
        sale_price: minPrice < maxPrice ? formatPrice(minPrice) : '',
        discount: '',
        installment: '',
        product_url: url,
        source_url: args.sourceUrl,
        headline: title,
        description: '',
        warranty: '',
        benefits: '',
        image_url: image.imageUrl,
        image_alt: image.imageAlt || title,
        scraped_at: args.scrapedAt
      });
    }

    return rows;
  }, { sourceUrl, sourceSite, brandFallback, scrapedAt });

  console.log(`${sourceSite}: extractor visual encontro ${extracted.length} productos antes de filtros.`);

  return filterGuatemalaQuetzalRows(extracted as CsvProduct[], sourceSite).map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
}


async function scrapePagedVisualProductGrid(
  page: Page,
  scrapedAt: string,
  sourceUrl: string,
  sourceSite: string,
  brandFallback: string,
  maxPages = 3
): Promise<CsvProduct[]> {
  const rowsByKey = new Map<string, CsvProduct>();
  let currentUrl = sourceUrl;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    await goto(page, currentUrl);
    await autoScrollCatalogPage(page);
    await page.waitForTimeout(1800);

    const extracted = await page.evaluate((args) => {
      const clean = (value: string | null | undefined): string =>
        (value ?? '').replace(/\s+/g, ' ').trim();

      const absoluteUrl = (href: string | null | undefined): string => {
        if (!href || href === '#') return args.currentUrl;
        try {
          return new URL(href, window.location.href).toString();
        } catch {
          return args.currentUrl;
        }
      };

      const visible = (element: Element): boolean => {
        const html = element as HTMLElement;
        const rect = html.getBoundingClientRect();
        const style = window.getComputedStyle(html);
        return rect.width > 20 && rect.height > 20 && style.display !== 'none' && style.visibility !== 'hidden';
      };

      const bedWords = /(cama|camas|colch[o\u00f3]n|colchon|box|base|cabecera|almohada|pillow|sleep|dream|restonic|simmons|serta|sealy|olympia|facenco|indufoam|comfort life|therapedic|siesta|sue[n\u00f1]a|comfortlife)/i;
      const ignoreWords = /(telefono|tel[e\u00e9]fono|whatsapp|carrito|login|cuenta|favoritos|menu|categorias|filtrar por|ordenar por|cloudflare|5xx-error|rastrea|pedido|footer|newsletter|copyright)/i;
      const priceRegex = /Q\s*[0-9][0-9,]*(?:\.[0-9]{2})?/gi;

      const hasPrice = (text: string): boolean => {
        priceRegex.lastIndex = 0;
        const ok = priceRegex.test(text);
        priceRegex.lastIndex = 0;
        return ok;
      };

      const parsePrice = (value: string): number | null => {
        const match = value.match(/Q\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i);
        if (!match) return null;
        const parsed = Number(match[1].replace(/,/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
      };

      const formatPrice = (value: number | null): string => {
        if (value === null) return '';
        return `Q${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      };

      const imageHintsBed = (card: HTMLElement): boolean =>
        Array.from(card.querySelectorAll('img')).some((img) => {
          const image = img as HTMLImageElement;
          return bedWords.test(clean(image.alt || image.title || image.src));
        });

      const candidates = new Set<HTMLElement>();
      const cardSelectors = [
        'li.product',
        'ul.products > li',
        'article',
        '.product',
        '.product-card',
        '.product-item',
        '.woocommerce-LoopProduct-link',
        '[class*="producto"]',
        '[class*="Producto"]',
        '[class*="product"]',
        '[class*="Product"]',
        '[class*="card"]',
        '[class*="Card"]',
        '[class*="item"]',
        '[class*="Item"]',
        '[class*="grid"] > *',
        '[class*="products"] > *',
        '[class*="Products"] > *',
        '[class*="collection"] > *',
        'a[href*="/producto/"]',
        'a[href*="/product/"]'
      ];

      const addCandidate = (element: Element | null) => {
        if (!element) return;
        const html = element as HTMLElement;
        if (!visible(html)) return;
        const text = clean(html.innerText || html.textContent);
        if (!hasPrice(text)) return;
        if (!bedWords.test(text) && !imageHintsBed(html)) return;
        if (ignoreWords.test(text) && text.length > 1600) return;
        if (text.length > 3600) return;
        candidates.add(html);
      };

      for (const selector of cardSelectors) {
        document.querySelectorAll(selector).forEach(addCandidate);
      }

      const priceNodes = Array.from(document.querySelectorAll('body *')).filter((element) => {
        if (!visible(element)) return false;
        const text = clean((element as HTMLElement).innerText || element.textContent);
        return text.length > 0 && text.length <= 900 && hasPrice(text);
      });

      for (const node of priceNodes) {
        let current: Element | null = node;
        let best: HTMLElement | null = null;

        for (let depth = 0; current && depth < 10; depth += 1) {
          const html = current as HTMLElement;
          const text = clean(html.innerText || html.textContent);
          const priceCount = (text.match(priceRegex) ?? []).length;
          priceRegex.lastIndex = 0;
          const actionCount = (text.match(/(comprar|agregar|a[n\u00f1]adir|ver producto|cotizar)/gi) ?? []).length;
          const imageCount = html.querySelectorAll('img').length;

          if (depth > 0 && (actionCount > 1 || priceCount > 5 || imageCount > 3 || text.length > 3200)) {
            break;
          }

          if (hasPrice(text) && (bedWords.test(text) || imageHintsBed(html))) {
            best = html;
          }

          current = current.parentElement;
        }

        addCandidate(best);
      }

      const titleSelectors = [
        '.woocommerce-loop-product__title',
        '.product-title',
        '.product-name',
        '[class*="title"]',
        '[class*="Title"]',
        '[class*="name"]',
        '[class*="Name"]',
        'h1',
        'h2',
        'h3',
        'h4',
        'a[title]'
      ];

      const pickTitle = (card: HTMLElement): string => {
        for (const selector of titleSelectors) {
          const found = card.querySelector(selector);
          const title = clean(found?.getAttribute('title') || found?.textContent);
          if (title && bedWords.test(title) && !ignoreWords.test(title) && title.length <= 190) {
            return title;
          }
        }

        const imageTitle = Array.from(card.querySelectorAll('img'))
          .map((img) => clean((img as HTMLImageElement).alt || (img as HTMLImageElement).title))
          .find((title) => title && bedWords.test(title) && !ignoreWords.test(title) && title.length <= 190);
        if (imageTitle) return imageTitle;

        const rawLines = (card.innerText || card.textContent || '')
          .split(/\n+|Comprar|Agregar|A\u00f1adir|Oferta|Desde:|Vendedor:|Valido hasta/i)
          .map(clean)
          .filter(Boolean);

        const bestLine = rawLines
          .filter((line) => bedWords.test(line) && !hasPrice(line) && !ignoreWords.test(line) && line.length >= 4 && line.length <= 190)
          .sort((a, b) => Math.abs(a.length - 55) - Math.abs(b.length - 55))[0];

        return clean(bestLine);
      };

      const pickImage = (card: HTMLElement): { imageUrl: string; imageAlt: string } => {
        const images = Array.from(card.querySelectorAll('img')) as HTMLImageElement[];
        const img = images.find((image) => bedWords.test(clean(image.alt || image.title || image.src))) ?? images[0];
        return {
          imageUrl: img?.src || img?.getAttribute('data-src') || img?.getAttribute('data-lazy-src') || img?.getAttribute('data-original') || '',
          imageAlt: clean(img?.alt || img?.title)
        };
      };

      const pickUrl = (card: HTMLElement): string => {
        const anchors = Array.from(card.querySelectorAll('a[href]')) as HTMLAnchorElement[];
        const productAnchor = anchors.find((anchor) => {
          const href = anchor.getAttribute('href') ?? '';
          const text = clean(anchor.textContent || anchor.getAttribute('title'));
          return href && href !== '#' && !/cart|carrito|login|cuenta|favoritos|whatsapp/i.test(href) && (bedWords.test(text) || /producto|product|cama|colchon/i.test(href));
        }) ?? anchors.find((anchor) => (anchor.getAttribute('href') ?? '') !== '#');
        return absoluteUrl(productAnchor?.getAttribute('href'));
      };

      const rows: any[] = [];
      const seen = new Set<string>();

      for (const card of Array.from(candidates)) {
        const text = clean(card.innerText || card.textContent);
        if (ignoreWords.test(text) && !bedWords.test(text)) continue;

        const title = pickTitle(card);
        const priceMatches = Array.from(text.matchAll(priceRegex)).map((match) => match[0]);
        priceRegex.lastIndex = 0;
        const prices = priceMatches
          .map(parsePrice)
          .filter((price): price is number => price !== null && price > 0)
          .filter((price) => price >= 100 && price <= 100000);

        if (!title || prices.length === 0) continue;

        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const url = pickUrl(card);
        const key = `${title.toLowerCase()}|${url}|${minPrice}|${maxPrice}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const image = pickImage(card);
        const category = /almohada|pillow/i.test(title)
          ? 'Almohadas'
          : /base|box|cabecera|cama/i.test(title)
            ? 'Camas y bases'
            : 'Colchones';

        rows.push({
          source_site: args.sourceSite,
          brand: args.brandFallback,
          line: '',
          category,
          product_name: title,
          availability: /agotado|sin existencia|no disponible/i.test(text) ? 'Agotado' : 'Listado en tienda online',
          regular_price: formatPrice(maxPrice),
          sale_price: minPrice < maxPrice ? formatPrice(minPrice) : '',
          discount: '',
          installment: '',
          product_url: url,
          source_url: args.sourceUrl,
          headline: title,
          description: '',
          warranty: '',
          benefits: '',
          image_url: image.imageUrl,
          image_alt: image.imageAlt || title,
          scraped_at: args.scrapedAt
        });
      }

      const nextLinks = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const nextAnchor = nextLinks.find((anchor) => {
        const text = clean(anchor.textContent || anchor.getAttribute('aria-label') || anchor.className);
        const rel = clean(anchor.getAttribute('rel'));
        return /next|siguiente|proxima|pr[o\u00f3]xima/i.test(`${text} ${rel}`);
      });

      return {
        rows,
        nextUrl: absoluteUrl(nextAnchor?.getAttribute('href'))
      };
    }, { currentUrl, sourceUrl, sourceSite, brandFallback, scrapedAt });

    console.log(`${sourceSite}: pagina visual ${pageNumber} encontro ${extracted.rows.length} productos antes de filtros.`);

    for (const row of filterGuatemalaQuetzalRows(extracted.rows as CsvProduct[], sourceSite)) {
      const key = row.product_url || `${row.product_name}|${row.regular_price}|${row.sale_price}`;
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          ...row,
          source_url: sourceUrl,
          scraped_at: scrapedAt,
        });
      }
    }

    const nextUrl = extracted.nextUrl;
    if (!nextUrl || nextUrl === currentUrl || nextUrl === sourceUrl) {
      break;
    }

    currentUrl = nextUrl;
  }

  return Array.from(rowsByKey.values());
}
async function scrapeSuenaCenterGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  void page;
  const apiUrl = `https://${SUENA_CENTER_ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${SUENA_CENTER_ALGOLIA_INDEX}/query`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Algolia-Application-Id': SUENA_CENTER_ALGOLIA_APP_ID,
      'X-Algolia-API-Key': SUENA_CENTER_ALGOLIA_SEARCH_KEY,
    },
    body: JSON.stringify({ query: '', hitsPerPage: 1000 }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    throw new Error(`Suena Center API respondio HTTP ${response.status}.`);
  }

  const payload = await response.json() as { hits?: Array<Record<string, any>> };
  const hits = Array.isArray(payload.hits) ? payload.hits : [];
  const formatPriceRange = (values: number[]): string => {
    if (values.length === 0) return '';
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const format = (value: number) => `Q${value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    return minimum === maximum ? format(minimum) : `${format(minimum)} - ${format(maximum)}`;
  };
  const normalizeBrand = (value: unknown): string => {
    const brand = normalizeCatalogText(String(value ?? ''));
    if (brand === 'suena' || brand === 'sueÃ±a') return 'Sueña';
    if (brand === 'indufoam') return 'Indufoam';
    if (brand === 'simmons') return 'Simmons';
    return cleanText(String(value ?? '')) || 'Sueña Center';
  };
  const normalizeComfort = (value: unknown): string => {
    const comfort = normalizeCatalogText(String(value ?? '')).replace(/\s+/g, ' ');
    if (comfort === 'suave' || comfort === 'semi suave') return 'Confort Suave';
    if (comfort === 'semi firme') return 'Confort Semi-Firme';
    if (comfort === 'extra firme') return 'Confort Extra-Firme';
    if (comfort === 'firme') return 'Confort Firme';
    return cleanText(String(value ?? ''));
  };

  const rows: CsvProduct[] = hits
    .filter((product) =>
      normalizeCatalogText(String(product.group_level_one_name ?? '')) === 'camas'
      && Number(product.is_visible_in_store ?? 0) === 1
      && ['suena', 'sueÃ±a', 'indufoam', 'simmons'].includes(normalizeCatalogText(String(product.brand_name ?? ''))),
    )
    .map((product) => {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const regularPrices = variants
        .map((variant: Record<string, unknown>) => Number(variant.retail_price))
        .filter((value: number) => Number.isFinite(value) && value > 0);
      const offerPrices = variants
        .map((variant: Record<string, unknown>) => Number(variant.offer_price || variant.final_price))
        .filter((value: number) => Number.isFinite(value) && value > 0);
      const hasOffer = variants.some((variant: Record<string, unknown>) =>
        Number(variant.offer_price) > 0 && Number(variant.offer_price) < Number(variant.retail_price),
      );
      const title = cleanText(String(product.name ?? product.label ?? ''));
      const slug = cleanText(String(product.slug ?? ''));
      const description = cleanText(String(product.description ?? '').replace(/<[^>]+>/g, ' '));
      const discount = Number(product.discount ?? 0);

      return {
        source_site: 'Suena Center Guatemala',
        brand: normalizeBrand(product.brand_name),
        line: normalizeComfort(product.comfort),
        category: 'Camas',
        product_name: title,
        availability: Number(product.available_balance ?? 0) > 0 ? 'Disponible' : 'Agotado',
        regular_price: formatPriceRange(regularPrices.length ? regularPrices : [Number(product.retail_price)]),
        sale_price: hasOffer
          ? formatPriceRange(offerPrices.length ? offerPrices : [Number(product.final_price)])
          : '',
        discount: discount > 0 ? `${Math.round(discount)}%` : '',
        installment: '',
        product_url: new URL(`/products/${slug}`, SUENA_CENTER_SOURCE_URL).toString(),
        source_url: SUENA_CENTER_SOURCE_URL,
        headline: title,
        description,
        warranty: cleanText(String(product.guarantee ?? '')),
        benefits: '',
        image_url: cleanText(String(product.image_url ?? '')),
        image_alt: title,
        scraped_at: scrapedAt,
      } satisfies CsvProduct;
    });

  console.log(`Suena Center Guatemala API: ${rows.length} camas visibles con marca y confort.`);
  return rows;
}

async function scrapeDormilandiaGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  return scrapeGenericGuatemalaStore(page, scrapedAt, DORMILANDIA_SOURCE_URL, 'Dormilandia Guatemala', 'Dormilandia');
}

function dormisuenosUrlWithPage(pageNumber: number): string {
  const url = new URL(DORMISUENOS_SOURCE_URL);
  url.searchParams.set('product-page', String(pageNumber));
  return url.toString();
}

async function scrapeDormisuenosGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  const rowsByUrl = new Map<string, CsvProduct>();
  const maxPages = 4;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const pageUrl = dormisuenosUrlWithPage(pageNumber);
    const pageRows = await scrapeVisualProductGrid(page, scrapedAt, pageUrl, 'Dormisuenos Guatemala', 'Dormisuenos');

    if (pageRows.length === 0 && pageNumber > 1) {
      break;
    }

    for (const row of pageRows) {
      const key = row.product_url || row.product_name;
      if (!rowsByUrl.has(key)) {
        rowsByUrl.set(key, {
          ...row,
          source_url: DORMISUENOS_SOURCE_URL,
        });
      }
    }
  }

  const visualRows = Array.from(rowsByUrl.values());
  if (visualRows.length > 0) return visualRows;

  console.log('Dormisuenos Guatemala: la pagina visual vino vacia; probando API de WooCommerce...');
  try {
    const apiUrl = new URL('/wp-json/wc/store/v1/products', DORMISUENOS_SOURCE_URL);
    apiUrl.searchParams.set('per_page', '100');
    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; FACENCO-Catalog/1.0)',
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`API respondio HTTP ${response.status}`);
    }

    const products = await response.json() as Array<Record<string, any>>;
    const apiRows = products
      .filter((product) => Array.isArray(product.categories)
        && product.categories.some((category: Record<string, any>) => {
          const value = normalizeCatalogText(`${category.slug ?? ''} ${category.name ?? ''}`);
          return /(^|\s)camas?(\s|$)/.test(value);
        }))
      .map((product) => {
        const prices = product.prices ?? {};
        const minorUnit = Number(prices.currency_minor_unit ?? 2);
        const divisor = 10 ** (Number.isFinite(minorUnit) ? minorUnit : 2);
        const regularValue = Number(prices.regular_price ?? prices.price ?? 0) / divisor;
        const saleValue = Number(prices.sale_price ?? 0) / divisor;
        const formatApiPrice = (value: number): string => value > 0
          ? `Q${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : '';
        const name = cleanText(String(product.name ?? ''));
        const image = Array.isArray(product.images) ? product.images[0] ?? {} : {};
        const description = cleanText(String(product.short_description ?? product.description ?? '').replace(/<[^>]+>/g, ' '));

        return {
          source_site: 'Dormisuenos Guatemala',
          brand: cleanText(String(product.brands?.[0]?.name ?? 'Dormisuenos')),
          line: '',
          category: 'Camas',
          product_name: name,
          availability: product.is_in_stock === false ? 'Agotado' : 'Disponible',
          regular_price: formatApiPrice(regularValue),
          sale_price: saleValue > 0 && saleValue < regularValue ? formatApiPrice(saleValue) : '',
          discount: '',
          installment: '',
          product_url: cleanText(String(product.permalink ?? DORMISUENOS_SOURCE_URL)),
          source_url: DORMISUENOS_SOURCE_URL,
          headline: name,
          description,
          warranty: '',
          benefits: '',
          image_url: cleanText(String(image.src ?? '')),
          image_alt: cleanText(String(image.alt ?? name)),
          scraped_at: scrapedAt,
        } satisfies CsvProduct;
      })
      .filter((row) => row.product_name && (row.regular_price || row.sale_price));

    console.log(`Dormisuenos Guatemala API: ${apiRows.length} camas recuperadas.`);
    return apiRows;
  } catch (error) {
    console.log(`ADVERTENCIA: Dormisuenos Guatemala API no disponible: ${errorMessage(error)}`);
    return [];
  }
}

async function scrapeBodegangasGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  const urls = [
    BODEGANGAS_SOURCE_URL,
    'https://bodegangasgts.com/?product_cat=camas&s=camas&et_search=true&post_type=product',
    'https://bodegangasgts.com/product-category/camas/'
  ];
  const rowsByKey = new Map<string, CsvProduct>();

  for (const url of urls) {
    const rows = await scrapePagedVisualProductGrid(page, scrapedAt, url, 'Bodegangas Guatemala', 'Bodegangas', 5);
    for (const row of rows) {
      const key = row.product_url || `${row.product_name}|${row.regular_price}|${row.sale_price}`;
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          ...row,
          source_url: BODEGANGAS_SOURCE_URL,
        });
      }
    }

    if (rowsByKey.size >= 20) {
      break;
    }
  }

  return Array.from(rowsByKey.values());
}

async function scrapeAmericana2000Gt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  void page;
  const response = await fetch(AMERICANA_2000_API_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; FACENCO-Catalog/1.0)',
    },
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    throw new Error(`Americana 2000 API respondio HTTP ${response.status}.`);
  }

  const products = await response.json() as Array<Record<string, any>>;
  const allowedBrands = new Set(['facenco', 'ultra', 'comfort life', 'olympia', 'sealy']);
  const cleanHtml = (value: unknown): string =>
    cleanText(String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' '));
  const formatApiPrice = (value: unknown, minorUnit: number): string => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return '';
    return `Q${(amount / (10 ** minorUnit)).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const rows: CsvProduct[] = [];
  for (const product of products) {
    const brands = (Array.isArray(product.brands) ? product.brands : [])
      .map((brand: Record<string, unknown>) => cleanText(String(brand.name ?? '')))
      .filter((brand: string) => allowedBrands.has(normalizeCatalogText(brand)));
    if (brands.length === 0) continue;

    const prices = product.prices ?? {};
    if (String(prices.currency_code ?? '').toUpperCase() !== 'GTQ') continue;
    const minorUnit = Number(prices.currency_minor_unit ?? 2);
    const regularPrice = formatApiPrice(prices.regular_price, minorUnit);
    const currentPrice = formatApiPrice(prices.price, minorUnit);
    const salePrice = String(prices.sale_price ?? '') && prices.sale_price !== prices.regular_price
      ? formatApiPrice(prices.sale_price, minorUnit)
      : '';
    const categories = (Array.isArray(product.categories) ? product.categories : [])
      .map((category: Record<string, unknown>) => cleanText(String(category.name ?? '')))
      .filter(Boolean);
    const line = categories.find((category: string) => normalizeCatalogText(category) !== 'camas') ?? '';
    const image = Array.isArray(product.images) ? product.images[0] ?? {} : {};

    rows.push({
      source_site: 'Americana 2000 Guatemala',
      brand: brands.join(' / '),
      line,
      category: 'Camas',
      product_name: cleanText(String(product.name ?? '')),
      availability: product.is_in_stock === false ? 'Agotado' : 'Disponible',
      regular_price: regularPrice || currentPrice,
      sale_price: salePrice || (currentPrice !== regularPrice ? currentPrice : ''),
      discount: product.on_sale ? 'Oferta' : '',
      installment: '',
      product_url: cleanText(String(product.permalink ?? '')),
      source_url: AMERICANA_2000_SOURCE_URL,
      headline: cleanText(String(product.name ?? '')),
      description: cleanHtml(product.short_description || product.description),
      warranty: '',
      benefits: '',
      image_url: cleanText(String(image.src ?? '')),
      image_alt: cleanText(String(image.alt ?? product.name ?? '')),
      scraped_at: scrapedAt,
    });
  }

  console.log(`Americana 2000 Guatemala API: ${products.length} camas recibidas, ${rows.length} con las marcas seleccionadas.`);
  return rows;
}
function hasDollarPrice(row: CsvProduct): boolean {
  const text = normalizeCatalogText(getPriceValidationText(row));
  return /(?:^|[\s(])US\$|(?:^|[\s(])\$ ?\d|d[oÃ³]lar|usd/i.test(text);
}




function isFacencoRow(row: CsvProduct): boolean {
  return normalizeCatalogText(row.source_site) === 'facenco' || normalizeCatalogText(row.brand) === 'facenco';
}
const FINAL_QUETZAL_PRICE_PATTERN = /(?:Q|GTQ)\s*\d/i;
const FINAL_DOLLAR_PRICE_PATTERN = /\b(usd|us\$|d[oÃ³]lar(?:es)?|dollars?)\b|\$\s*\d/i;
function shouldKeepCatalogRow(row: CsvProduct): boolean {
  return getCatalogFilterReason(row) === '';
}




function filterFinalCatalogRows(rows: CsvProduct[]): CsvProduct[] {
  const result: CsvProduct[] = [];
  const rejectedByStore = new Map<string, { count: number; samples: string[] }>();
  const seen = new Set<string>();

  for (const row of rows) {
    const reason = getCatalogFilterReason(row);
    if (reason) {
      const store = csvFilterText(
        row,
        'source_site',
        'sitio_fuente',
        'sourceSite',
        'sourceName',
        'storeName',
        'tienda',
        'store',
        'site',
      ) || 'Sin tienda';
      const info = rejectedByStore.get(store) ?? { count: 0, samples: [] };
      info.count += 1;
      if (info.samples.length < 3) {
        const product = csvFilterText(
          row,
          'product_name',
          'producto',
          'productName',
          'titulo',
          'title',
          'headline',
          'name',
        ) || 'Sin producto';
        const price = csvFilterText(
          row,
          'sale_price',
          'regular_price',
          'precio_oferta',
          'precio_regular',
          'precioOferta',
          'precioRegular',
          'salePrice',
          'regularPrice',
          'offerPrice',
          'price',
          'priceText',
        ) || 'sin precio';
        info.samples.push(`${product} | precio: ${price} | motivo: ${reason}`);
      }
      rejectedByStore.set(store, info);
      continue;
    }

    const key = makeFinalDedupKey(row);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(row);
  }

  if (rejectedByStore.size > 0) {
    console.log('Productos descartados por filtro final:');
    for (const [store, info] of rejectedByStore.entries()) {
      console.log(`- ${store}: ${info.count} descartados`);
      for (const sample of info.samples) console.log(`  ejemplo: ${sample}`);
    }
  }

  return result;
}





function getSelectedStoreNames(): string[] {
  const arg = process.argv.find((item) => item.startsWith('--stores='));
  if (!arg) return [];
  return arg
    .replace('--stores=', '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
// INICIO FIX FILTRO FINAL POR TIENDA
const FINAL_BED_PRODUCT_PATTERN = /(cama|camas|colchon|colch[oÃ³]n|colchones|mattress|box\s*spring|base|bases|cabecera|cabeceras|almohada|almohadas|protector|protectores|funda|fundas|s[aÃ¡]bana|sabanas|s[aÃ¡]banas|edred[oÃ³]n|edredones|cobertor|cobertores|duvet|set\s+de\s+cama|dormitorio|litera|literas|camarote|sofa\s*cama|sof[aÃ¡]\s*cama|rec[aÃ¡]mara|sleep|dream|restonic|simmons|serta|sealy|olympia|indufoam|facenco|comfort\s*life|therapedic|belezza|lucca|sienna|kangaroo|beautyrest|beautysleep|back\s*care|backcare)/i;
const FINAL_NON_BED_PRODUCT_PATTERN = /(celular|telefono|tel[eÃ©]fono|smartphone|iphone|samsung\s+galaxy|laptop|notebook|computadora|tablet|televisor|tv\s|aud[iÃ­]fono|bocina|mouse|teclado|impresora|monitor|c[aÃ¡]mara|camera|refrigeradora|lavadora|estufa|microondas|licuadora|cafetera|maquillaje|rubor|labial|maybelline|juguete|paw\s*patrol|figura\s+de\s+acci[oÃ³]n|bicicleta|moto|llanta|zapato|tenis|ropa|vestido|camisa|pantal[oÃ³]n)/i;
const BED_PRODUCT_PATTERN = FINAL_BED_PRODUCT_PATTERN;
const NON_BED_PRODUCT_PATTERN = FINAL_NON_BED_PRODUCT_PATTERN;

function readCsvProductText(row: CsvProduct, keys: string[]): string {
  const record = row as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function getCatalogFilterReason(row: CsvProduct): string {
  const site = readCsvProductText(row, ['source_site', 'sourceSite', 'sourceName', 'sitio_fuente', 'tienda', 'store', 'site']);
  const product = readCsvProductText(row, ['product_name', 'productName', 'producto', 'title', 'titulo', 'name']);
  const brand = readCsvProductText(row, ['brand', 'marca']);
  const line = readCsvProductText(row, ['line', 'linea']);
  const category = readCsvProductText(row, ['category', 'categoria']);
  const description = readCsvProductText(row, ['description', 'descripcion', 'details', 'detalle']);
  const headline = readCsvProductText(row, ['headline', 'title', 'titulo']);
  const benefits = readCsvProductText(row, ['benefits', 'beneficios']);
  const productUrl = readCsvProductText(row, ['product_url', 'productUrl', 'url_producto', 'url']);
  const imageAlt = readCsvProductText(row, ['image_alt', 'imageAlt']);
  const priceText = csvFilterText(
    row,
    'regular_price',
    'sale_price',
    'price',
    'priceText',
    'precio',
    'precio_regular',
    'precio_oferta',
    'regularPrice',
    'salePrice',
    'offerPrice',
  );
  const identityText = [product, brand, line, category, headline, productUrl, imageAlt].join(' ');
  const searchableText = [identityText, description, benefits].join(' ');
  const specializedBedStore = /(facenco|olympia|colchoneria|colchoner[iÃ­]a|sleep\s*gallery|mattress|beds?\s*&?\s*dreams?|suena\s*center|sue[nÃ±]a\s*center|dormilandia|dormisue[nÃ±]os|serta\s*guatemala)/i.test(site);

  if (!site) return 'sin tienda';
  if (!product && !description) return 'sin producto';
  if (FINAL_NON_BED_PRODUCT_PATTERN.test(identityText)) return 'producto no relacionado a cama';
  if (!specializedBedStore && !FINAL_BED_PRODUCT_PATTERN.test(searchableText)) return 'no parece producto de cama';

  // No se exige precio para guardar: FACENCO y algunas tiendas pueden traer catalogo sin precio.
  // Solo se rechaza si claramente viene en dolares y no aparece Quetzal.
  if ((/\bUSD\b|US\$|\$/i.test(priceText)) && !/(Q\s*\d|GTQ)/i.test(priceText)) {
    return 'precio en dolares';
  }

  return '';
}

function makeFinalDedupKey(row: CsvProduct): string {
  const site = readCsvProductText(row, ['source_site', 'sourceSite', 'sourceName', 'sitio_fuente', 'tienda', 'store', 'site']);
  const product = readCsvProductText(row, ['product_name', 'productName', 'producto', 'title', 'titulo', 'name']);
  const productUrl = readCsvProductText(row, ['product_url', 'productUrl', 'url_producto', 'url']);
  const regularPrice = readCsvProductText(row, ['regular_price', 'precio_regular', 'regularPrice', 'precioRegular']);
  const salePrice = readCsvProductText(row, ['sale_price', 'precio_oferta', 'salePrice', 'offerPrice', 'precioOferta']);
  return [site, product, productUrl, regularPrice, salePrice]
    .map((value) => value.toLowerCase().replace(/\s+/g, ' ').trim())
    .join('|');
}
// FIN FIX FILTRO FINAL POR TIENDA
async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const storeTimeoutMs = Math.max(
    30_000,
    Number(process.env.SCRAPER_STORE_TIMEOUT_MS || 4 * 60_000),
  );
  const getAttemptTimeoutMs = (storeName: string): number => (
    storeName === 'Siman Guatemala' ? Math.max(storeTimeoutMs, 10 * 60_000) : storeTimeoutMs
  );

  try {
    const scrapedAt = new Date().toISOString();
    // MAIN: aqui se unen todos los scrapers.
    // Para agregar una tienda nueva:
    // 1. Crea una constante con su URL arriba del archivo.
    // 2. Crea una funcion scrapeNombreTienda(page, scrapedAt).
    // 3. Agrega aqui una linea como: ...await scrapeNombreTienda(page, scrapedAt),
    const storeScrapers: StoreScraper[] = [
      { name: 'FACENCO', run: (storePage) => scrapeFacenco(storePage, scrapedAt) },
      { name: 'Camas Olympia Online GT', run: (storePage) => scrapeOlympia(storePage, scrapedAt) },
      { name: 'La Colchoneria Guatemala', run: (storePage) => scrapeLaColchoneria(storePage, scrapedAt) },
      { name: 'Sleep Gallery Guatemala', run: (storePage) => scrapeSleepGallery(storePage, scrapedAt) },
      { name: 'Serta Guatemala', run: (storePage) => scrapeSertaGt(storePage, scrapedAt) },
      { name: 'Americana 2000 Guatemala', run: (storePage) => scrapeAmericana2000Gt(storePage, scrapedAt) },
      { name: 'Mattress Guatemala', run: (storePage) => scrapeMattress(storePage, scrapedAt) },
      { name: 'Beds & Dreams', run: (storePage) => scrapeBedsDreams(storePage, scrapedAt) },
      { name: 'Furniture City Guatemala', run: (storePage) => scrapeFurnitureCity(storePage, scrapedAt) },
      { name: 'La Curacao Guatemala', run: (storePage) => scrapeLaCuracao(storePage, scrapedAt) },
      { name: 'MAX Guatemala', run: (storePage) => scrapeMaxGt(storePage, scrapedAt) },
      { name: 'Elektra Guatemala', run: (storePage) => scrapeElektraGt(storePage, scrapedAt) },
      { name: 'Walmart Guatemala', run: (storePage) => scrapeWalmartGt(storePage, scrapedAt) },
      { name: 'Cemaco Guatemala', run: (storePage) => scrapeCemacoGt(storePage, scrapedAt) },
      { name: 'Siman Guatemala', run: (storePage) => scrapeSimanGt(storePage, scrapedAt) },
      { name: 'Suena Center Guatemala', run: (storePage) => scrapeSuenaCenterGt(storePage, scrapedAt) },
      { name: 'Dormilandia Guatemala', run: (storePage) => scrapeDormilandiaGt(storePage, scrapedAt) },
      { name: 'Dormisuenos Guatemala', run: (storePage) => scrapeDormisuenosGt(storePage, scrapedAt) },
      { name: 'Bodegangas Guatemala', run: (storePage) => scrapeBodegangasGt(storePage, scrapedAt) },
    ];

    const selectedStoreNames = getSelectedStoreNames();
    const selectedStoreKeys = selectedStoreNames.map((name) => name.toLowerCase());
    const storesToRun = selectedStoreKeys.length
      ? storeScrapers.filter((store) => selectedStoreKeys.includes(store.name.toLowerCase()))
      : storeScrapers;

    if (selectedStoreKeys.length && storesToRun.length === 0) {
      throw new Error(`No se encontro ninguna tienda seleccionada. Tiendas disponibles: ${storeScrapers.map((store) => store.name).join(', ')}`);
    }

    if (selectedStoreKeys.length) {
      console.log(`Ejecutando scraper solo para: ${storesToRun.map((store) => store.name).join(', ')}`);
    } else {
      console.log('Ejecutando scraper completo para todas las tiendas.');
    }

    const rows: CsvProduct[] = [];
    const failures: string[] = [];

    async function runStoreAttempt(store: StoreScraper, attempt: number): Promise<CsvProduct[]> {
      const storePage = await browser.newPage({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      });

      try {
        console.log(`Iniciando ${store.name} intento ${attempt}...`);
        const attemptTimeoutMs = getAttemptTimeoutMs(store.name);
        let timeoutHandle: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(
              `${store.name} excedio el limite de ${Math.round(attemptTimeoutMs / 60_000)} minutos por intento.`,
            ));
          }, attemptTimeoutMs);
        });
        const storeRows = await Promise.race([
          store.run(storePage),
          timeoutPromise,
        ]).finally(() => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        });
        const finalRows = filterFinalCatalogRows(storeRows).filter((row) => row.source_site === store.name);
        console.log(`OK ${store.name} intento ${attempt}: ${storeRows.length} productos leidos, ${finalRows.length} productos utiles.`);
        return storeRows;
      } finally {
        await Promise.race([
          storePage.close().catch(() => undefined),
          new Promise<void>((resolveClose) => setTimeout(resolveClose, 5_000)),
        ]);
      }
    }

    for (const store of storesToRun) {
      let bestRows: CsvProduct[] = [];
      let bestFinalCount = -1;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const attemptRows = await runStoreAttempt(store, attempt);
          const attemptFinalCount = filterFinalCatalogRows(attemptRows).filter((row) => row.source_site === store.name).length;

          if (attemptFinalCount > bestFinalCount) {
            bestRows = attemptRows;
            bestFinalCount = attemptFinalCount;
          }

          const retryMinimum = getStoreRetryMinimum(store.name);
          if (attemptFinalCount >= retryMinimum) {
            break;
          }

          if (attempt < 2) {
            console.log(
              `ADVERTENCIA: ${store.name} obtuvo ${attemptFinalCount} productos utiles; `
              + `minimo para aceptar ${retryMinimum}. Reintentando para conservar el mejor resultado.`,
            );
          }
        } catch (error) {
          const technical = errorMessage(error);
          const message = userFriendlyStoreError(store.name, technical);

          if (attempt < 2) {
            console.error(`ADVERTENCIA: ${message}`);
            console.error(`DETALLE_TECNICO ${store.name} intento ${attempt}: ${technical}`);
            console.log(`Reintentando solo ${store.name} por fallo en el intento ${attempt}.`);
          } else {
            failures.push(message);
            console.error(`ADVERTENCIA: ${message}`);
            console.error(`DETALLE_TECNICO ${store.name} intento ${attempt}: ${technical}`);
          }
        }
      }

      if (bestRows.length > 0) {
        rows.push(...bestRows);
        console.log(`USANDO ${store.name}: ${bestRows.length} productos leidos, ${Math.max(bestFinalCount, 0)} productos utiles.`);
      }
    }

    const filteredRows = filterFinalCatalogRows(rows);
    const qualityWarnings: string[] = [];
    console.log('Diagnostico final por tienda despues de filtros:');
    for (const store of storesToRun) {
      const beforeCount = rows.filter((row) => normalizeCatalogText(row.source_site) === normalizeCatalogText(store.name)).length;
      const afterCount = filteredRows.filter((row) => normalizeCatalogText(row.source_site) === normalizeCatalogText(store.name)).length;
      console.log('FINAL ' + store.name + ': antes=' + beforeCount + ', despues=' + afterCount);
      const qualityWarning = buildStoreQualityWarning(store.name, afterCount, beforeCount);
      if (qualityWarning) {
        qualityWarnings.push(qualityWarning);
        console.log('ADVERTENCIA: ' + qualityWarning);
      }
    }

    if (filteredRows.length === 0) {
      throw new Error(`No se pudo generar informacion util. Se eliminaron productos fuera de cama o con precios en dolares. ${failures.join(' | ')}`);
    }

    await mkdir(dirname(OUTPUT_FILE), { recursive: true });
    await writeFile(OUTPUT_FILE, toCsv(filteredRows), 'utf8');
    await writeExcel(filteredRows, OUTPUT_XLSX_FILE);
    await saveProductsToPostgres(filteredRows);

    console.log(`Productos extraidos antes de filtro: ${rows.length}`);
    console.log(`Productos guardados despues de filtro: ${filteredRows.length}`);
    const allWarnings = [...failures, ...qualityWarnings];
    if (allWarnings.length > 0) {
      console.log(`Tiendas con advertencia: ${allWarnings.length}`);
      for (const warning of allWarnings) {
        console.log(`ADVERTENCIA: ${warning}`);
      }
    }
    console.log(`CSV generado: ${OUTPUT_FILE}`);
    console.log(`Excel generado: ${OUTPUT_XLSX_FILE}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});












































