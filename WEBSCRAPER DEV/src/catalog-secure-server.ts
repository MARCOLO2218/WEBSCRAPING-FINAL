import { createServer } from 'node:https';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { config as loadEnv } from 'dotenv';
import { createSecureHandler, canonicalHttpsOrigin } from './server/secure-handler.js';
import { createScraperJobQueue } from './server/scraper-job-queue.js';
import { createNcJobs } from './server/nc-jobs.js';

const { values } = parseArgs({ options: {
  origin: { type: 'string' }, cert: { type: 'string' }, key: { type: 'string' },
  port: { type: 'string', default: '8443' },
} });
if (!values.origin || !values.cert || !values.key) throw new Error('Se requiere --origin --cert --key.');
const origin = canonicalHttpsOrigin(values.origin);
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535
  || Number(origin.port || 443) !== port) throw new Error('Puerto debe coincidir con origen HTTPS.');
const tls = { cert: readFileSync(values.cert), key: readFileSync(values.key), minVersion: 'TLSv1.2' as const };
// Conserva configuración GT existente; no escribe ni copia .env.
if (existsSync('.env')) loadEnv({ path: '.env' });
const handler = createSecureHandler(values.origin, { publicDir: resolve('public'),
  outputCsv: resolve('output/comparacion_colchones.csv'),
  scraperJobQueue: createScraperJobQueue(), ncJobs: createNcJobs() });
const server = createServer(tls, (req, res) => {
  void handler(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(503, { 'Cache-Control': 'no-store' });
    res.end();
  });
});
server.listen(port, '0.0.0.0', () => console.log(`Catálogo protegido disponible en ${origin.origin}`));
