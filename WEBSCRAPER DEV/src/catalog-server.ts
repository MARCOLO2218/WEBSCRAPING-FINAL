import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { config as loadEnv } from 'dotenv';
import { Pool } from 'pg';
import ExcelJS from 'exceljs';

const envFile = existsSync('.env') ? '.env' : undefined;
if (envFile) {
  loadEnv({ path: envFile });
}

const PORT = Number(process.env.CATALOG_PORT || 3030);
const PUBLIC_DIR = resolve('public');
const OUTPUT_CSV = resolve('output/comparacion_colchones.csv');
const FACENCO_PRICE_FILE = resolve('data/precios_facenco.xlsx');
const LOG_DIR = resolve('logs');
const SCRAPER_LOG = resolve(LOG_DIR, 'ultimo_scraper.log');
let scraperRunning = false;

type ScraperJob = {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  ok?: boolean;
  output?: string;
};

const scraperJobs = new Map<string, ScraperJob>();
const scraperJobQueue: ScraperJob[] = [];
let scraperQueueProcessing = false;
let currentScraperJob: ScraperJob | null = null;
const MAX_SCRAPER_JOB_HISTORY = 50;

type DbProduct = {
  id: string;
  run_id: string | null;
  semana_run: number | null;
  semana_inicio: string | null;
  sitio_fuente: string | null;
  marca: string | null;
  linea: string | null;
  categoria: string | null;
  producto: string | null;
  disponibilidad: string | null;
  precio_regular: string | null;
  precio_oferta: string | null;
  precio_regular_min?: number | null;
  precio_regular_max?: number | null;
  precio_oferta_min?: number | null;
  precio_oferta_max?: number | null;
  descuento: string | null;
  cuotas: string | null;
  url_producto: string | null;
  url_fuente: string | null;
  titulo: string | null;
  descripcion: string | null;
  garantia: string | null;
  beneficios: string | null;
  url_imagen: string | null;
  texto_imagen: string | null;
  fecha_scraping: string | null;
  creado_en: string | null;
  registro_uuid: string | null;
  run_uuid: string | null;
};

type CatalogProduct = DbProduct & {
  precio_numero: number | null;
  diferencia_facenco: number | null;
  etiqueta_diferencia: string;
};

function getDbPool(): Pool {
  return new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: String(process.env.PGSSL || '').toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
  });
}

function parsePrice(value: string | null): number | null {
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

async function loadFacencoPriceRows(templateRows: DbProduct[]): Promise<DbProduct[]> {
  if (!existsSync(FACENCO_PRICE_FILE)) return [];

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FACENCO_PRICE_FILE);
  const sheet = workbook.getWorksheet('Precios FACENCO') || workbook.worksheets[0];
  if (!sheet) return [];

  const headerRowNumber = 4;
  const headerMap = new Map<string, number>();
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.eachCell((cell, colNumber) => {
    const header = cleanCell(cell.value)?.toLowerCase();
    if (header) headerMap.set(header, colNumber);
  });

  const latest = templateRows.find((row) => row.run_id) || templateRows[0];
  const rows: DbProduct[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    const active = (getCellText(row, headerMap, 'activo') || 'SI').toUpperCase();
    if (active === 'NO') return;

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

function mergeFacencoExcelRows(dbRows: DbProduct[], excelRows: DbProduct[]): DbProduct[] {
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

function normalizeText(value: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function withPriceComparison(rows: DbProduct[]): CatalogProduct[] {
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

async function getProducts(searchParams: URLSearchParams): Promise<CatalogProduct[]> {
  const schema = process.env.PGSCHEMA || 'catalogo';
  const filters: string[] = [];
  const values: string[] = [];

  const filterMap: Array<[string, string]> = [
    ['semana', 'semana_run::text'],
    ['tienda', 'sitio_fuente'],
    ['marca', 'marca'],
    ['categoria', 'categoria'],
    ['disponibilidad', 'disponibilidad'],
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
    filters.push(`(producto ILIKE $${values.length} OR marca ILIKE $${values.length} OR sitio_fuente ILIKE $${values.length})`);
  }

  const latestRunFilter = `run_id = (SELECT id FROM ${schema}.scraping_runs ORDER BY id DESC LIMIT 1)`;
  const where = `WHERE ${[latestRunFilter, ...filters].join(' AND ')}`;
  const pool = getDbPool();

  try {
    const result = await pool.query<DbProduct>(`
      SELECT *
      FROM ${schema}.productos_catalogo
      ${where}
      ORDER BY id ASC
    `, values);

    const facencoExcelRows = await loadFacencoPriceRows(result.rows);
    const mergedRows = mergeFacencoExcelRows(result.rows, facencoExcelRows);

    return withPriceComparison(mergedRows);
  } finally {
    await pool.end();
  }
}

function toCsv(rows: CatalogProduct[]): string {
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

async function sendJson(res: import('node:http').ServerResponse, data: unknown): Promise<void> {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function cleanScraperLine(line: string): string | null {
  const trimmed = line.replace(/\u001b\[[0-9;]*m/g, '').trim();
  if (!trimmed) return null;
  if (trimmed.includes('DETALLE_TECNICO')) return null;
  if (trimmed.includes('Call log:')) return null;
  if (trimmed.startsWith('at ')) return null;
  if (trimmed.includes('node:internal')) return null;
  if (trimmed.includes('file:///')) return null;
  if (trimmed.includes('injected env')) return null;
  return trimmed;
}

function summarizeScraperOutput(output: string, ok: boolean): string {
  const lines = output.split(/\r?\n/).map(cleanScraperLine).filter((line): line is string => Boolean(line));
  const important = lines.filter((line) =>
    line.startsWith('Run ID de esta consulta') ||
    line.startsWith('Inicio de semana') ||
    line.startsWith('PostgreSQL actualizado') ||
    line.startsWith('Productos extraidos') ||
    line.startsWith('CSV generado') ||
    line.startsWith('OK ') ||
    line.startsWith('ADVERTENCIA:')
  );

  if (important.length > 0) {
    return important.slice(0, 12).join('\n');
  }

  if (!ok) {
    if (/ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET/i.test(output)) {
      return 'El scraper no pudo completar la consulta porque una pagina cerro la conexion. Intenta nuevamente mas tarde.';
    }
    if (/Timeout|timed out/i.test(output)) {
      return 'El scraper no pudo completar la consulta porque una pagina tardo demasiado en responder. Intenta nuevamente mas tarde.';
    }
    if (/PostgreSQL|password|ECONNREFUSED|ENOTFOUND/i.test(output)) {
      return 'El scraper no pudo guardar en base de datos. Revisa la conexion PostgreSQL y el archivo .env.';
    }
    return 'El scraper no pudo finalizar. Revisa logs\\ultimo_scraper.log para detalle tecnico.';
  }

  return 'Scraper finalizado correctamente.';
}

async function writeScraperLog(output: string): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(SCRAPER_LOG, output, 'utf8');
}

async function proxyImage(sourceUrl: string | null, res: import('node:http').ServerResponse): Promise<void> {
  if (!sourceUrl) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Falta URL de imagen');
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('URL de imagen invalida');
    return;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Protocolo de imagen no permitido');
    return;
  }

  const response = await fetch(parsed, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Referer': `${parsed.origin}/`,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('No se pudo cargar la imagen del proveedor');
    return;
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const body = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400',
  });
  res.end(body);
}

function runScraperProcess(): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, ['dist/scrape-facenco-energy.js'], {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
    });

    let output = '';

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    child.on('close', (code) => {
      const ok = code === 0;
      void writeScraperLog(output);
      resolveRun({
        ok,
        output: summarizeScraperOutput(output, ok),
      });
    });

    child.on('error', (error) => {
      void writeScraperLog(error.message);
      resolveRun({
        ok: false,
        output: summarizeScraperOutput(error.message, false),
      });
    });
  });
}

function createJobId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanupScraperJobs(): void {
  const finished = [...scraperJobs.values()]
    .filter((job) => job.status === 'done' || job.status === 'error')
    .sort((a, b) => String(b.finishedAt || b.createdAt).localeCompare(String(a.finishedAt || a.createdAt)));

  for (const job of finished.slice(MAX_SCRAPER_JOB_HISTORY)) {
    scraperJobs.delete(job.id);
  }
}

function publicJob(job: ScraperJob): ScraperJob & { queuePosition: number } {
  const queueIndex = scraperJobQueue.findIndex((item) => item.id === job.id);
  return {
    ...job,
    queuePosition: job.status === 'queued' && queueIndex >= 0 ? queueIndex + 1 : 0,
  };
}

function processScraperQueue(): void {
  if (scraperQueueProcessing) return;
  scraperQueueProcessing = true;

  void (async () => {
    while (scraperJobQueue.length) {
      const job = scraperJobQueue.shift();
      if (!job) continue;

      currentScraperJob = job;
      scraperRunning = true;
      job.status = 'running';
      job.startedAt = new Date().toISOString();

      const result = await runScraperProcess();
      job.ok = result.ok;
      job.output = result.output;
      job.status = result.ok ? 'done' : 'error';
      job.finishedAt = new Date().toISOString();

      currentScraperJob = null;
      scraperRunning = false;
      cleanupScraperJobs();
    }

    scraperQueueProcessing = false;
  })();
}

function enqueueScraperJob(): ScraperJob & { queuePosition: number } {
  const job: ScraperJob = {
    id: createJobId(),
    status: 'queued',
    createdAt: new Date().toISOString(),
  };

  scraperJobs.set(job.id, job);
  scraperJobQueue.push(job);
  processScraperQueue();
  return publicJob(job);
}

function serveStatic(pathname: string, res: import('node:http').ServerResponse): void {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = normalize(join(PUBLIC_DIR, requested));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const contentTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
  };

  res.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (url.pathname === '/api/products') {
      const products = await getProducts(url.searchParams);
      await sendJson(res, products);
      return;
    }

    if (url.pathname === '/api/image') {
      await proxyImage(url.searchParams.get('url'), res);
      return;
    }

    if (url.pathname === '/api/run-scraper' && req.method === 'POST') {
      const job = enqueueScraperJob();
      res.writeHead(202, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, accepted: true, job }));
      return;
    }

    if (url.pathname === '/api/scraper-job') {
      const id = url.searchParams.get('id') || '';
      const job = scraperJobs.get(id);
      if (!job) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'No se encontro la solicitud del scraper.' }));
        return;
      }
      await sendJson(res, { ok: true, job: publicJob(job) });
      return;
    }

    if (url.pathname === '/api/scraper-status') {
      await sendJson(res, { running: scraperRunning, queueSize: scraperJobQueue.length + (currentScraperJob ? 1 : 0), currentJobId: currentScraperJob?.id || null });
      return;
    }

    if (url.pathname === '/api/summary') {
      const products = await getProducts(url.searchParams);
      const prices = products.map((product) => product.precio_numero).filter((value): value is number => value !== null);
      const cheaper = products.filter((product) => product.etiqueta_diferencia === 'Mas barato').length;
      const expensive = products.filter((product) => product.etiqueta_diferencia === 'Mas caro').length;
      const stores = new Set(products.map((product) => product.sitio_fuente).filter(Boolean));

      await sendJson(res, {
        total: products.length,
        precio_promedio: prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null,
        mas_baratos: cheaper,
        mas_caros: expensive,
        tiendas: stores.size,
      });
      return;
    }

    if (url.pathname === '/api/export.csv') {
      const products = await getProducts(url.searchParams);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="catalogo_comercial_comparativo.csv"',
      });
      res.end(toCsv(products));
      return;
    }

    if (url.pathname === '/output/comparacion_colchones.csv' && existsSync(OUTPUT_CSV)) {
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="comparacion_colchones.csv"',
      });
      createReadStream(OUTPUT_CSV).pipe(res);
      return;
    }

    serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'No se pudo cargar el catalogo. Revisa conexion PostgreSQL y archivo .env.' }));
  }
});

server.listen(PORT, () => {
  console.log(`Catalogo Comercial Comparativo listo en http://localhost:${PORT}`);
});








