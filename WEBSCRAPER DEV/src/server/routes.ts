import { createReadStream, existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sanitizeStoreSelection } from '../config/store-catalog.js';
import { getDbPool, getProducts, toCsv } from './catalog-service.js';
import { proxyImage, readJsonBody, sendJson, serveStatic } from './http.js';
import type { createScraperJobQueue } from './scraper-job-queue.js';
import { handlePriceUpload } from './facenco-upload.js';
import { authenticatedExecutionActor } from './access-guard.js';
import type { RegionalCatalogReader } from './regional-catalog-reader.js';

export type CatalogRouteDependencies = {
  regionalReader?: RegionalCatalogReader;
  publicDir: string;
  outputCsv: string;
  scraperJobQueue: ReturnType<typeof createScraperJobQueue>;
  ncJobs?: (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>;
  accessGuard?: (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean>;
};

export function createCatalogRequestHandler(dependencies: CatalogRouteDependencies) {
  if (dependencies.regionalReader && !dependencies.accessGuard) {
    throw new Error('El lector regional requiere guardia de acceso por país.');
  }
  const { publicDir, outputCsv, scraperJobQueue } = dependencies;
  const readProducts = dependencies.regionalReader
    ? dependencies.regionalReader.getProducts.bind(dependencies.regionalReader) : getProducts;

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const protocol = (req.socket as typeof req.socket & { encrypted?: boolean } | undefined)?.encrypted ? 'https' : 'http';
      const url = new URL(req.url || '/', `${protocol}://${req.headers.host}`);
      if (dependencies.accessGuard && !await dependencies.accessGuard(req, res, url)) return;
      if (dependencies.regionalReader) {
        res.setHeader('Cache-Control', 'no-store');
        if (url.pathname === '/nicaragua-catalogo.json') {
          sendJson(res, await dependencies.regionalReader.ncSnapshot());
          return;
        }
        if (url.pathname === '/output/comparacion_colchones.csv') {
          const products = await readProducts(new URLSearchParams());
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="comparacion_colchones.csv"' });
          res.end(toCsv(products));
          return;
        }
      }
      if (url.pathname.startsWith('/api/nc/') && dependencies.ncJobs) {
        await dependencies.ncJobs(req, res, url);
        return;
      }

      if (url.pathname === '/api/facenco-prices') {
        await handlePriceUpload(req, res, url.searchParams.get('confirm') === 'true');
        return;
      }

      if (url.pathname === '/api/products') {
        const products = await readProducts(url.searchParams);
        sendJson(res, products);
        return;
      }

      if (url.pathname === '/api/latest-run') {
        if (dependencies.regionalReader) {
          sendJson(res, await dependencies.regionalReader.latestRun());
          return;
        }
        const pool = getDbPool();
        const schema = process.env.PGSCHEMA || 'catalogo';
        const result = await pool.query(`
          SELECT id AS run_id, semana_run, semana_inicio, started_at, total_products
          FROM ${schema}.scraping_runs
          ORDER BY id DESC
          LIMIT 1
        `);
        sendJson(res, result.rows[0] || null);
        return;
      }

      if (url.pathname === '/api/image') {
        await proxyImage(url.searchParams.get('url'), res);
        return;
      }

      if (url.pathname === '/api/run-scraper' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const stores = sanitizeStoreSelection(body.stores);
        const actor = authenticatedExecutionActor(req);
        if (scraperJobQueue.requiresAuthenticatedActor && !actor) {
          res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: 'Sesión autenticada requerida para ejecutar.' }));
          return;
        }
        const job = scraperJobQueue.requiresAuthenticatedActor
          ? await scraperJobQueue.enqueueAuthenticated(stores, actor!.userId)
          : scraperJobQueue.enqueue(stores);
        res.writeHead(202, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, accepted: true, job }));
        return;
      }

      if (url.pathname === '/api/scraper-job') {
        const id = url.searchParams.get('id') || '';
        const job = scraperJobQueue.getJob(id);
        if (!job) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'No se encontro la solicitud del scraper.' }));
          return;
        }
        sendJson(res, { ok: true, job });
        return;
      }

      if (url.pathname === '/api/scraper-status') {
        sendJson(res, scraperJobQueue.getStatus());
        return;
      }

      if (url.pathname === '/api/summary') {
        const products = await readProducts(url.searchParams);
        const prices = products.map((product) => product.precio_numero).filter((value): value is number => value !== null);
        const cheaper = products.filter((product) => product.etiqueta_diferencia === 'Mas barato').length;
        const expensive = products.filter((product) => product.etiqueta_diferencia === 'Mas caro').length;
        const stores = new Set(products.map((product) => product.sitio_fuente).filter(Boolean));

        sendJson(res, {
          total: products.length,
          precio_promedio: prices.length ? prices.reduce((sum, value) => sum + value, 0) / prices.length : null,
          mas_baratos: cheaper,
          mas_caros: expensive,
          tiendas: stores.size,
        });
        return;
      }

      if (url.pathname === '/api/export.csv') {
        const products = await readProducts(url.searchParams);
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="catalogo_comercial_comparativo.csv"',
        });
        res.end(toCsv(products));
        return;
      }

      if (url.pathname === '/output/comparacion_colchones.csv' && existsSync(outputCsv)) {
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="comparacion_colchones.csv"',
        });
        createReadStream(outputCsv).pipe(res);
        return;
      }

      serveStatic(url.pathname, res, publicDir);
    } catch (error) {
      console.error(error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'No se pudo cargar el catalogo. Revisa conexion PostgreSQL y archivo .env.' }));
    }
  };
}
