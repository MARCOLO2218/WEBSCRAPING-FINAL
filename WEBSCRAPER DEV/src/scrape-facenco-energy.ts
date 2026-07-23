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
const SLEEP_GALLERY_SOURCE_URL = 'https://paises.sleepgalleryca.com/';
const MATTRESS_SOURCE_URL = 'https://mattress.com.gt/';
const BEDS_DREAMS_SOURCE_URL = 'https://www.bedsndreams.com/';
const FURNITURE_CITY_SOURCE_URL = 'https://www.furniturecity.com.gt/mattress-colchones/';
const LA_CURACAO_SOURCE_URL = 'https://www.lacuracaonline.com/guatemala/c/muebles/camas-y-colchones';
const MAX_GT_SOURCE_URL = 'https://www.max.com.gt/camas-y-colchones/c';
const ELEKTRA_GT_SOURCE_URL = 'https://www.elektra.com.gt/muebles-y-colchones/colchones/catgm1010101';
const WALMART_GT_SOURCE_URL = 'https://www.walmart.com.gt/cama?_q=cama&fuzzy=0&initialMap=accesscontrollist,ft&initialQuery=walmartgtwm4414/cama&map=brand,brand,brand,brand,brand,brand,brand,brand,brand,brand,ft&operator=and&page=1&query=/belezza/camas-florida/facenco/indufoam/kangaroo/lucca/olympia/sealy/sienna/simmons/cama&searchState';
const CEMACO_GT_SOURCE_URL = 'https://www.cemaco.com/search?q=colchon';
const SIMAN_GT_SOURCE_URL = 'https://www.siman.com/guatemala/search?q=colchon';
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

    await client.query('COMMIT');
    console.log(`Run ID de esta consulta: Semana ${runWeek} (run_id ${runId})`);
    console.log(`Inicio de semana: ${weekStart}`);
    console.log(`UUID tecnico de esta consulta: ${runUuid}`);
    console.log(`PostgreSQL actualizado: ${insertedRows} productos insertados.`);
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
  await goto(page, BEDS_DREAMS_SOURCE_URL);
  const rows = await extractCardProducts(page, BEDS_DREAMS_SOURCE_URL, {
    sourceSite: 'Beds & Dreams',
    brand: 'Beds & Dreams',
    cardSelector: '.product-card.js-product-card',
    titleSelector: '.product-card__name',
    categorySelector: '.product-card__type, .product-card__vendor',
    anchorSelector: '.product-card__name[href], a[href]',
    imageSelector: 'img.vtex-product-summary-2-x-image, img',
    regularPriceSelector: '.product-card__regular-price, s',
    salePriceSelector: '.product-card__price',
    priceSelector: '.product-card__price',
    discountSelector: '.product-label, .product-tag-sale',
  });

  return rows.map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
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
  ].some((store) => sourceText.includes(store));

  if (hasProductKeyword) {
    return true;
  }

  if (trustedStore && hasUrlKeyword) {
    return true;
  }

  return false;
}

function hasQuetzalPrice(row: CsvProduct): boolean {
  const priceText = cleanText([
    row.regular_price,
    row.sale_price,
    row.discount,
    row.installment,
  ].filter(Boolean).join(' '));

  return /(^|\s|[^A-Za-z])Q\s?\d|GTQ|Quetzal/i.test(priceText);
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

async function scrapeLaCuracao(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  return scrapeGenericGuatemalaStore(page, scrapedAt, LA_CURACAO_SOURCE_URL, 'La Curacao Guatemala', 'La Curacao');
}

async function scrapeMaxGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  return scrapeGenericGuatemalaStore(page, scrapedAt, MAX_GT_SOURCE_URL, 'MAX Guatemala', 'MAX');
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

async function scrapeSimanGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  return scrapeGenericGuatemalaStore(page, scrapedAt, SIMAN_GT_SOURCE_URL, 'Siman Guatemala', 'Siman');
}
function hasDollarPrice(row: CsvProduct): boolean {
  const priceText = normalizeCatalogText([
    row.regular_price,
    row.sale_price,
    row.discount,
    row.installment,
  ].filter(Boolean).join(' '));

  return /(^|\s|[^A-Za-z])\$\s?\d|usd|dolar|dolares|dÃ³lar|dÃ³lares/.test(priceText);
}

function isFacencoRow(row: CsvProduct): boolean {
  return normalizeCatalogText(row.source_site) === 'facenco' || normalizeCatalogText(row.brand) === 'facenco';
}

function shouldKeepCatalogRow(row: CsvProduct): boolean {
  if (!hasRelevantBedProduct(row)) {
    return false;
  }

  if (isFacencoRow(row)) {
    return true;
  }

  if (hasDollarPrice(row)) {
    return false;
  }

  return hasQuetzalPrice(row);
}

function filterFinalCatalogRows(rows: CsvProduct[]): CsvProduct[] {
  const unique = new Map<string, CsvProduct>();

  for (const row of rows) {
    if (!shouldKeepCatalogRow(row)) {
      continue;
    }

    const key = row.product_url || `${row.source_site}|${row.product_name}|${row.regular_price}|${row.sale_price}`;
    if (!unique.has(key)) {
      unique.set(key, row);
    }
  }

  return Array.from(unique.values());
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });

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
      { name: 'Mattress Guatemala', run: (storePage) => scrapeMattress(storePage, scrapedAt) },
      { name: 'Beds & Dreams', run: (storePage) => scrapeBedsDreams(storePage, scrapedAt) },
      { name: 'Furniture City Guatemala', run: (storePage) => scrapeFurnitureCity(storePage, scrapedAt) },
      { name: 'La Curacao Guatemala', run: (storePage) => scrapeLaCuracao(storePage, scrapedAt) },
      { name: 'MAX Guatemala', run: (storePage) => scrapeMaxGt(storePage, scrapedAt) },
      { name: 'Elektra Guatemala', run: (storePage) => scrapeElektraGt(storePage, scrapedAt) },
      { name: 'Walmart Guatemala', run: (storePage) => scrapeWalmartGt(storePage, scrapedAt) },
      { name: 'Cemaco Guatemala', run: (storePage) => scrapeCemacoGt(storePage, scrapedAt) },
      { name: 'Siman Guatemala', run: (storePage) => scrapeSimanGt(storePage, scrapedAt) },
    ];

    const rows: CsvProduct[] = [];
    const failures: string[] = [];

    async function runStoreAttempt(store: StoreScraper, attempt: number): Promise<CsvProduct[]> {
      const storePage = await browser.newPage({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      });

      try {
        console.log(`Iniciando ${store.name} intento ${attempt}...`);
        const storeRows = await store.run(storePage);
        const finalRows = filterFinalCatalogRows(storeRows).filter((row) => row.source_site === store.name);
        console.log(`OK ${store.name} intento ${attempt}: ${storeRows.length} productos leidos, ${finalRows.length} productos utiles.`);
        return storeRows;
      } finally {
        await storePage.close().catch(() => undefined);
      }
    }

    for (const store of storeScrapers) {
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

          if (attemptRows.length > 0) {
            break;
          }

          if (attempt < 2) {
            console.log(`ADVERTENCIA: ${store.name} devolvio 0 productos. Reintentando solo esta tienda.`);
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
    for (const store of storeScrapers) {
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





















