import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCuracaoNcPages } from '../scrapers/nc/la-curacao.js';

const first = 'https://www.lacuracaonline.com/nicaragua/c/muebles/camas-y-colchones/camas';

test('paginación NC recorre páginas, preserva query y deduplica por identidad', async () => {
  const result = await collectCuracaoNcPages(first, async (url) => {
    if (url === first) return {
      items: [{ productId: 'sku-1' }, { productId: 'sku-2' }],
      nextUrl: `${first}?p=2`, complete: true,
    };
    assert.equal(url, `${first}?p=2`);
    return { items: [{ productId: 'sku-2' }, { productId: 'sku-3' }], nextUrl: null, complete: true };
  }, 3);

  assert.equal(result.complete, true);
  assert.equal(result.reason, 'finished');
  assert.deepEqual(result.items.map((item) => item.productId), ['sku-1', 'sku-2', 'sku-3']);
  assert.equal(result.duplicateProducts, 1);
  assert.equal(result.pagesVisited.length, 2);
  assert.deepEqual(result.productPages.find((entry) => entry.productId === 'sku-2')?.pages,
    [first, `${first}?p=2`]);
});

test('paginación NC no declara completo contenido parcial, ciclos ni exceso de páginas', async () => {
  const partial = await collectCuracaoNcPages(first, async () => ({
    items: [{ productId: 'sku-1' }], nextUrl: null, complete: false,
  }), 2);
  assert.equal(partial.reason, 'partial_page');
  assert.equal(partial.complete, false);

  const cycle = await collectCuracaoNcPages(first, async () => ({
    items: [], nextUrl: first, complete: true,
  }), 3);
  assert.equal(cycle.reason, 'cycle');

  const limited = await collectCuracaoNcPages(first, async (url) => ({
    items: [{ productId: url.endsWith('?p=2') ? 'sku-2' : 'sku-1' }],
    nextUrl: `${first}?p=2`, complete: true,
  }), 1);
  assert.equal(limited.reason, 'max_pages');
});

test('paginación NC rechaza rutas ajenas e identidades vacías', async () => {
  const external = await collectCuracaoNcPages(first, async () => ({
    items: [], nextUrl: 'https://example.test/nicaragua/page/2', complete: true,
  }), 2);
  assert.equal(external.reason, 'invalid_next_url');
  await assert.rejects(() => collectCuracaoNcPages(first, async () => ({
    items: [{ productId: '  ' }], nextUrl: null, complete: true,
  }), 2), /Identidad de producto vacía/);
  await assert.rejects(() => collectCuracaoNcPages(first, async () => ({
    items: [], nextUrl: null, complete: true,
  }), 0), /maxPages/);
});

test('paginación NC no considera éxito una página vacía ni un fallo de lectura', async () => {
  const empty = await collectCuracaoNcPages(first, async () => ({
    items: [], nextUrl: null, complete: true,
  }), 2);
  assert.equal(empty.complete, false);
  assert.equal(empty.reason, 'empty_page');
  assert.equal(empty.failedUrl, first);

  const failedUrl = `${first}?p=2`;
  const readError = await collectCuracaoNcPages(first, async (url) => {
    if (url === first) return { items: [{ productId: 'sku-1' }], nextUrl: failedUrl, complete: true };
    throw new Error('timeout de navegación');
  }, 3);
  assert.equal(readError.complete, false);
  assert.equal(readError.reason, 'read_error');
  assert.equal(readError.failedUrl, failedUrl);
  assert.deepEqual(readError.items.map((item) => item.productId), ['sku-1']);
});

test('paginación NC exige total estable y cantidad de identidades igual al total anunciado', async () => {
  const result = await collectCuracaoNcPages(first, async url => ({
    items: [{ productId: url === first ? 'sku-1' : 'sku-2' }],
    nextUrl: url === first ? `${first}?p=2` : null,
    complete: true, declaredTotal: 2,
  }), 3);
  assert.equal(result.complete, true);

  const repeated = await collectCuracaoNcPages(first, async url => ({
    items: [{ productId: 'sku-1' }], nextUrl: url === first ? `${first}?p=2` : null,
    complete: true, declaredTotal: 2,
  }), 3);
  assert.equal(repeated.complete, false);
  assert.equal(repeated.reason, 'count_mismatch');

  const changed = await collectCuracaoNcPages(first, async url => ({
    items: [{ productId: url }], nextUrl: `${first}?p=2`,
    complete: true, declaredTotal: url === first ? 2 : 3,
  }), 3);
  assert.equal(changed.reason, 'total_changed');
  assert.equal(changed.complete, false);

  const missing = await collectCuracaoNcPages(first, async url => ({
    items: [{ productId: url }], nextUrl: url === first ? `${first}?p=2` : null,
    complete: true, declaredTotal: url === first ? 2 : null,
  }), 3);
  assert.equal(missing.reason, 'count_mismatch');
});

test('Camas no declara cobertura completa cuando las capturas suman 53 de 54 SKU', async () => {
  const counts = new Map([[first, 24], [`${first}?p=2`, 23], [`${first}?p=3`, 6]]);
  const result = await collectCuracaoNcPages(first, async (url) => {
    const pageNumber = Number(new URL(url).searchParams.get('p') ?? 1);
    const count = counts.get(url) ?? 0;
    return {
      items: Array.from({ length: count }, (_, index) => ({ productId: `page-${pageNumber}-sku-${index}` })),
      nextUrl: pageNumber < 3 ? `${first}?p=${pageNumber + 1}` : null,
      complete: true,
      declaredTotal: 54,
    };
  }, 3);

  assert.equal(result.items.length, 53);
  assert.equal(result.duplicateProducts, 0);
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'count_mismatch');
});
