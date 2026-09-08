import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createCatalogRequestHandler } from './server/routes.js';
import { createScraperJobQueue } from './server/scraper-job-queue.js';

const envFile = existsSync('.env') ? '.env' : undefined;
if (envFile) {
  loadEnv({ path: envFile });
}

const PORT = Number(process.env.CATALOG_PORT || 3030);
const PUBLIC_DIR = resolve('public');
const OUTPUT_CSV = resolve('output/comparacion_colchones.csv');
const scraperJobQueue = createScraperJobQueue();

const requestHandler = createCatalogRequestHandler({
  publicDir: PUBLIC_DIR,
  outputCsv: OUTPUT_CSV,
  scraperJobQueue,
});
const server = createServer(requestHandler);

server.listen(PORT, () => {
  console.log(`Catalogo Comercial Comparativo listo en http://localhost:${PORT}`);
});
