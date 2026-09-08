import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createCatalogRequestHandler } from '../server/routes.js';
import { createScraperJobQueue } from '../server/scraper-job-queue.js';

const mainSource = readFileSync('src/catalog-server.ts', 'utf8');
const routesSource = readFileSync('src/server/routes.ts', 'utf8');

function responseDouble() {
  const captured: { status?: number; headers?: unknown; body?: string } = {};
  const response = {
    writeHead: (status: number, headers?: unknown) => {
      captured.status = status;
      captured.headers = headers;
      return response;
    },
    end: (body?: unknown) => {
      captured.body = body === undefined ? undefined : String(body);
      return response;
    },
  } as unknown as ServerResponse;
  return { response, captured };
}

function request(url: string): IncomingMessage {
  return {
    url,
    method: 'GET',
    headers: { host: 'localhost:3030' },
  } as IncomingMessage;
}

test('la ruta de estado conserva su respuesta JSON', async () => {
  const queue = createScraperJobQueue({
    runScraper: async () => ({ ok: true, output: 'OK' }),
  });
  const handler = createCatalogRequestHandler({
    publicDir: 'public',
    outputCsv: 'output/comparacion_colchones.csv',
    scraperJobQueue: queue,
  });
  const { response, captured } = responseDouble();

  await handler(request('/api/scraper-status'), response);

  assert.equal(captured.status, 200);
  assert.deepEqual(JSON.parse(captured.body || '{}'), {
    running: false,
    queueSize: 0,
    currentJobId: null,
    currentJob: null,
    queuedJobs: [],
    jobsInOrder: [],
    lastJob: null,
  });
});

test('la consulta de trabajo inexistente conserva estado y mensaje', async () => {
  const handler = createCatalogRequestHandler({
    publicDir: 'public',
    outputCsv: 'output/comparacion_colchones.csv',
    scraperJobQueue: createScraperJobQueue(),
  });
  const { response, captured } = responseDouble();

  await handler(request('/api/scraper-job?id=no-existe'), response);

  assert.equal(captured.status, 404);
  assert.deepEqual(JSON.parse(captured.body || '{}'), {
    ok: false,
    error: 'No se encontro la solicitud del scraper.',
  });
});

test('catalog-server queda limitado a composición y arranque', () => {
  assert.match(mainSource, /createCatalogRequestHandler/);
  assert.match(mainSource, /createServer\(requestHandler\)/);
  assert.doesNotMatch(mainSource, /url\.pathname ===/);
  assert.doesNotMatch(mainSource, /async \(req, res\)/);
  assert.match(routesSource, /url\.pathname === '\/api\/products'/);
  assert.match(routesSource, /url\.pathname === '\/api\/run-scraper'/);
  assert.match(routesSource, /serveStatic\(url\.pathname, res, publicDir\)/);
});
