import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanSimanNcDiscount } from '../scrapers/nc/siman.js';
const { buildNcPreviewSnapshot } = await import(new URL('../../scripts/nc-preview-snapshot.mjs', import.meta.url).href);

test('descuento Siman NC elimina el precio y conserva sólo porcentaje', () => {
  assert.equal(cleanSimanNcDiscount('C$20,799.00-20%'), '20%');
  assert.equal(cleanSimanNcDiscount('15 %'), '15%');
  assert.equal(cleanSimanNcDiscount('C$20,799.00'), '');
});

test('vista NC sólo publica un resultado completo de las cinco tiendas y moneda NC/NIO', () => {
  const report = { status: 'ok', country: 'NC', currency: 'NIO', stores: ['la-curacao', 'el-gallo', 'siman', 'walmart', 'maxipali'].map(store => ({ store, status: 'ok', products: [{ country: 'NC', currency: 'NIO' }] })) };
  const snapshot = buildNcPreviewSnapshot(report, '2026-10-04');
  assert.equal(snapshot.products.length, 5);
  assert.equal(snapshot.mode, 'dev_preview');
  assert.throws(() => buildNcPreviewSnapshot({ ...report, status: 'partial' }, ''), /incompleta/);
  assert.throws(() => buildNcPreviewSnapshot({ ...report, stores: report.stores.slice(1) }, ''), /incompleta/);
  assert.throws(() => buildNcPreviewSnapshot({ ...report, currency: 'GTQ' }, ''), /incompleta/);
});

test('vista NC muestra datos usando textContent y no ejecuta scraping desde navegador', () => {
  const source = readFileSync('public/nicaragua-catalogo.js', 'utf8');
  assert.match(source, /textContent = text/);
  assert.match(source, /cache: 'no-store'/);
  assert.match(source, /Sin precio publicado/);
  assert.doesNotMatch(source, /innerHTML|run-scraper|\/api\/products/);
});
