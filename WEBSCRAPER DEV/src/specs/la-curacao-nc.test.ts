import test from 'node:test';
import assert from 'node:assert/strict';
import { LA_CURACAO_NC, compareCuracaoNcCoverage, compareCuracaoNcCategory, isNicaraguaCuracaoUrl,
  parseCuracaoNcPrice, type SourceCoverage } from '../scrapers/nc/la-curacao.js';
import { createCuracaoNcProduct } from '../scrapers/nc/la-curacao.js';

function coverage(): SourceCoverage[] {
  return [
    { source: 'principal', productIds: ['a', 'b', 'a'], complete: true },
    { source: 'individuales', productIds: [' a '], complete: true },
    { source: 'queen', productIds: ['b'], complete: true },
    { source: 'king', productIds: ['b'], complete: true },
    { source: 'matrimoniales', productIds: [], complete: true },
  ];
}

test('categoría superior puede cubrir camas sin ser el mismo conjunto', () => {
  const result = compareCuracaoNcCategory({ productIds: ['a', 'b', 'colchon'], complete: true }, coverage());
  assert.equal(result.categoryCoversBeds, true);
  assert.equal(result.equivalent, false);
  assert.deepEqual(result.onlyCategory, ['colchon']);
  assert.deepEqual(result.productSources.find((entry) => entry.productId === 'colchon'),
    { productId: 'colchon', sources: ['categoria'] });
  assert.deepEqual(result.productSources.find((entry) => entry.productId === 'a')?.sources,
    ['categoria', 'individuales', 'principal']);
  assert.equal(compareCuracaoNcCategory({ productIds: ['a'], complete: true }, coverage()).categoryCoversBeds, false);
  assert.equal(compareCuracaoNcCategory({ productIds: ['a', 'b'], complete: false }, coverage()).categoryCoversBeds, null);
});

test('Curacao NC mantiene moneda y URLs propias sin habilitar el worker', () => {
  assert.equal(LA_CURACAO_NC.country, 'NC');
  assert.equal(LA_CURACAO_NC.currency, 'NIO');
  assert.equal(LA_CURACAO_NC.operational, false);
  assert.ok(Object.values(LA_CURACAO_NC.sources).every(isNicaraguaCuracaoUrl));
  for (const url of ['https://www.lacuracaonline.com/guatemala/camas',
    'https://www.lacuracaonline.com.evil.test/nicaragua/camas',
    'https://user:password@www.lacuracaonline.com/nicaragua/camas',
    'https://www.lacuracaonline.com/nicaragua/../guatemala/camas']) {
    assert.equal(isNicaraguaCuracaoUrl(url), false);
  }
});

test('precio NC acepta un importe C$ y rechaza texto ambiguo o moneda ajena', () => {
  assert.equal(parseCuracaoNcPrice('C$65,999.00'), 65999);
  assert.equal(parseCuracaoNcPrice(' C$ 8,999 '), 8999);
  assert.equal(parseCuracaoNcPrice('Q8,999'), null);
  assert.equal(parseCuracaoNcPrice('$8,999'), null);
  assert.equal(parseCuracaoNcPrice('Antes C$74,340 ahora C$65,999'), null);
  assert.equal(parseCuracaoNcPrice(null), null);
});

test('producto NC conserva país, NIO, precios y procedencia fuera del CSV GT', () => {
  const product = createCuracaoNcProduct({
    productId: 'sku-123',
    productName: 'Cama Queen de prueba',
    productUrl: 'https://www.lacuracaonline.com/nicaragua/cama-queen-prueba',
    sourceUrl: LA_CURACAO_NC.sources.queen,
    regularPrice: 'C$74,340.00',
    salePrice: 'C$65,999.00',
    discount: '11%',
    installment: '12 cuotas',
    firmness: 'Firme',
    plazas: 'Queen',
    color: 'Azul',
    material: 'Madera',
  });
  assert.equal(product.storeId, 'la-curacao-nc');
  assert.equal(product.country, 'NC');
  assert.equal(product.currency, 'NIO');
  assert.equal(product.regularPrice, 74340);
  assert.equal(product.salePrice, 65999);
  assert.deepEqual([product.firmness, product.plazas, product.color, product.material],
    ['Firme', 'Queen', 'Azul', 'Madera']);
  assert.equal(product.sourceUrl, LA_CURACAO_NC.sources.queen);
  assert.equal('source_site' in product, false);
});

test('producto NC rechaza enlaces fuera de país/fuente y precios no validados', () => {
  const candidate = {
    productId: 'sku-123', productName: 'Cama prueba',
    productUrl: 'https://www.lacuracaonline.com/nicaragua/cama-prueba',
    sourceUrl: LA_CURACAO_NC.sources.principal,
  };
  assert.throws(() => createCuracaoNcProduct({ ...candidate,
    productUrl: 'https://www.lacuracaonline.com/guatemala/cama-prueba' }), /Nicaragua/);
  assert.throws(() => createCuracaoNcProduct({ ...candidate,
    sourceUrl: 'https://www.lacuracaonline.com/nicaragua/otra-fuente' }), /fuente registrada/);
  assert.throws(() => createCuracaoNcProduct({ ...candidate, salePrice: 'Q1,000' }), /C\$/);
  assert.throws(() => createCuracaoNcProduct({ ...candidate, imageUrl: 'javascript:alert(1)' }), /URL de imagen/);
  assert.throws(() => createCuracaoNcProduct({ ...candidate, productId: ' ' }), /identidad/);
});

test('cobertura deduplica productos presentes en varias categorías', () => {
  const result = compareCuracaoNcCoverage(coverage());
  assert.equal(result.equivalent, true);
  assert.equal(result.uniqueTotal, 2);
  assert.deepEqual(result.shared, ['a', 'b']);
  assert.deepEqual(result.productSources, [
    { productId: 'a', sources: ['principal', 'individuales'] },
    { productId: 'b', sources: ['principal', 'queen', 'king'] },
  ]);
});

test('cobertura enlaza SKU publicado y URL fallback por URL canónica compartida', () => {
  const url = 'https://www.lacuracaonline.com/nicaragua/cama-prueba-123/p';
  const rows: SourceCoverage[] = [
    { source: 'principal', productIds: ['123'], products: [{ productId: '123', productUrl: url }], complete: true },
    { source: 'individuales', productIds: [url], products: [{ productId: url, productUrl: url }], complete: true },
    { source: 'queen', productIds: [], complete: true },
    { source: 'king', productIds: [], complete: true },
    { source: 'matrimoniales', productIds: [], complete: true },
  ];
  const result = compareCuracaoNcCoverage(rows);
  assert.equal(result.equivalent, true);
  assert.deepEqual(result.shared, [url]);
  assert.equal(result.uniqueTotal, 1);
  assert.equal(compareCuracaoNcCategory({
    productIds: ['123'], products: [{ productId: '123', productUrl: url }], complete: true,
  }, rows).equivalent, true);
  assert.throws(() => compareCuracaoNcCoverage(rows.map((row, index) => index === 0
    ? { ...row, products: [{ productId: 'wrong-sku', productUrl: url }] } : row)), /no coincide/);
  assert.throws(() => compareCuracaoNcCoverage(rows.map((row, index) => index === 0
    ? { ...row, products: [{ productId: '123', productUrl: 'https://example.com/item/p' }] } : row)), /ajena/);
});

test('cobertura reporta exclusivos de principal y tamaños', () => {
  const rows = coverage();
  rows[0].productIds = ['a', 'c'];
  const result = compareCuracaoNcCoverage(rows);
  assert.equal(result.equivalent, false);
  assert.deepEqual(result.onlyMain, ['c']);
  assert.deepEqual(result.onlySizes, ['b']);
});

test('una paginación parcial o fuente ausente no certifica igualdad', () => {
  const rows = coverage();
  rows[1].complete = false;
  assert.equal(compareCuracaoNcCoverage(rows).equivalent, null);
  assert.deepEqual(compareCuracaoNcCoverage(rows.slice(0, 4)).incompleteSources,
    ['individuales', 'matrimoniales']);
  assert.throws(() => compareCuracaoNcCoverage([rows[0], rows[0]]), /repetida/);
});
