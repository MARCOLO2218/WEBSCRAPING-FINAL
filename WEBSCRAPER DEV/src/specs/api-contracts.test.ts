import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const serverSource = readFileSync('src/catalog-server.ts', 'utf8');
const contract = readFileSync('docs/API_CONTRACTS.md', 'utf8');

test('todas las rutas API del servidor estan registradas en el contrato', () => {
  const routes = [...serverSource.matchAll(/url\.pathname === '([^']*\/api\/[^']*)'/g)]
    .map((match) => match[1]);
  const uniqueRoutes = [...new Set(routes)].sort();

  assert.deepEqual(uniqueRoutes, [
    '/api/export.csv',
    '/api/image',
    '/api/latest-run',
    '/api/products',
    '/api/run-scraper',
    '/api/scraper-job',
    '/api/scraper-status',
    '/api/summary',
  ]);

  for (const route of uniqueRoutes) {
    assert.ok(contract.includes(route), `falta documentar ${route}`);
  }
});

test('el contrato registra compatibilidad y modelos esenciales', () => {
  assert.match(contract, /\/output\/comparacion_colchones\.csv/);
  assert.match(contract, /## Modelo de producto/);
  assert.match(contract, /## Modelo de trabajo del scraper/);
  assert.match(contract, /## Filtros compartidos/);
});
