import test from 'node:test';
import assert from 'node:assert/strict';
import type { CsvProduct } from '../domain/product.js';
import { executeNcReadOnly, normalizeNcProducts, NC_EXECUTION_STORES, type NcStoreKey } from '../scrapers/nc/execution.js';

function row(store: NcStoreKey): CsvProduct {
  const definition = NC_EXECUTION_STORES[store];
  return { source_site: definition.name, brand: '', line: '', category: 'Camas',
    product_name: 'Cama de prueba', availability: '', regular_price: 'C$19,000.00', sale_price: 'C$10,399.00',
    discount: '', installment: '', product_url: `https://${definition.host}/${store === 'la-curacao' ? 'nicaragua/' : ''}cama/p`,
    source_url: `https://${definition.host}/${store === 'la-curacao' ? 'nicaragua/' : ''}camas`,
    headline: '', description: '', warranty: '', benefits: '', image_url: '', image_alt: '', scraped_at: '2026-10-04' };
}

test('ejecutor NC conserva campos, moneda, importes y deduplica URL', () => {
  const original = row('la-curacao');
  const products = normalizeNcProducts('la-curacao', [{ ...original, product_id: 'SKU-123' }, { ...original, product_id: 'SKU-123', product_url: `${original.product_url}?utm=abc` }]);
  assert.equal(products.length, 1);
  assert.equal(products[0].product_id, 'SKU-123');
  assert.equal(products[0].country, 'NC');
  assert.equal(products[0].currency, 'NIO');
  assert.equal(products[0].regular_price_value, 19000);
  assert.equal(products[0].sale_price_value, 10399);
  assert.equal(products[0].scraped_at, original.scraped_at);
});

test('ejecutor NC conserva precio ausente y rechaza moneda/host/identidad ajenos', () => {
  const original = row('maxipali');
  const [product] = normalizeNcProducts('maxipali', [{ ...original, regular_price: '', sale_price: '' }]);
  assert.equal(product.regular_price_value, null);
  assert.equal(product.sale_price_value, null);
  for (const change of [{ sale_price: 'Q1,000.00' }, { sale_price: 'C$0' }, { product_url: 'https://www.walmart.com.gt/cama/p' }, { source_site: 'FACENCO' }, { product_name: ' ' }]) {
    assert.throws(() => normalizeNcProducts('maxipali', [{ ...original, ...change }]));
  }
  assert.throws(() => normalizeNcProducts('la-curacao', [{ ...row('la-curacao'), product_url: 'https://www.lacuracaonline.com/guatemala/cama/p' }]));
});

function runners(calls: string[]) {
  return Object.fromEntries((Object.keys(NC_EXECUTION_STORES) as NcStoreKey[]).map(store => [store, async () => {
    calls.push(store);
    return { rows: [row(store)], coverage: 'bounded_sources' as const };
  }])) as Parameters<typeof executeNcReadOnly>[1];
}

test('ejecutor NC selecciona tiendas, no repite y rechaza desconocidas antes de ejecutar', async () => {
  const calls: string[] = [];
  const adapters = runners(calls);
  const report = await executeNcReadOnly(['siman', 'walmart', 'siman'], adapters);
  assert.deepEqual(calls, ['siman', 'walmart']);
  assert.equal(report.databaseWrites, false);
  assert.equal(report.status, 'ok');
  assert.equal(report.stores[0].products[0].country, 'NC');
  await assert.rejects(executeNcReadOnly(['siman', 'unknown'], adapters), /desconocida/);
  assert.deepEqual(calls, ['siman', 'walmart']);
});

test('ejecutor NC continúa después de fallo y no declara éxito de tienda vacía', async () => {
  const calls: string[] = [];
  const adapters = runners(calls);
  adapters['la-curacao'] = async () => { throw new Error('sin cobertura'); };
  adapters.siman = async () => ({ rows: [], coverage: 'bounded_sources' });
  const report = await executeNcReadOnly([], adapters);
  assert.deepEqual(report.stores.map(store => store.status), ['error', 'ok', 'empty', 'ok', 'ok']);
  assert.equal(report.status, 'partial');
  assert.equal(report.stores.length, 5);
});
