import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createNcJobs } from '../server/nc-jobs.js';
const { mergeNcPreviewSnapshot } = await import(new URL('../../scripts/nc-preview-snapshot.mjs', import.meta.url).href);

test('NC conserva tiendas fallidas y reemplaza sólo resultados exitosos', () => {
  const row = { country: 'NC', currency: 'NIO', store_id: 'siman-nc', product_name: 'Anterior' };
  const previous = { version: 1, country: 'NC', currency: 'NIO', scrapedAt: 'antes', stores: [{ store: 'siman', status: 'ok' }], products: [row] };
  const failed = mergeNcPreviewSnapshot({ country: 'NC', currency: 'NIO', stores: [{ store: 'siman', status: 'error', products: [] }] }, 'ahora', previous);
  assert.deepEqual(failed.products, [row]);
  assert.equal(failed.stores[0].scrapedAt, 'antes');
  const next = mergeNcPreviewSnapshot({ country: 'NC', currency: 'NIO', stores: [{ store: 'siman', status: 'ok', products: [{ ...row, product_name: 'Nuevo' }] }] }, 'después', failed);
  assert.equal(next.products.length, 1);
  assert.equal(next.products[0].product_name, 'Nuevo');
  assert.throws(() => mergeNcPreviewSnapshot({ country: 'GT', currency: 'GTQ', stores: [] }, '', previous));
});

test('API NC valida selección y ejecuta sólo tiendas solicitadas', async () => {
  const calls: string[][] = [];
  const handler = createNcJobs(async stores => { calls.push(stores || []); return { ok: true, output: '{}' }; });
  const server = createServer((req, res) => { void handler(req, res, new URL(req.url || '/', `http://${req.headers.host}`)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/nc/run`;
  try {
    for (const body of [{}, { stores: [] }, { stores: ['gt'] }, { stores: ['siman', 'siman'] }]) {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 400);
    }
    assert.equal(calls.length, 0);
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stores: ['siman'] }) });
    assert.equal(response.status, 202);
    assert.deepEqual(calls, [['siman']]);
    const cross = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://other.example' }, body: JSON.stringify({ mode: 'all' }) });
    assert.equal(cross.status, 403);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
