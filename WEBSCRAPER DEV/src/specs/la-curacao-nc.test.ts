import test from 'node:test';
import assert from 'node:assert/strict';
import { LA_CURACAO_NC, compareCuracaoNcCoverage, compareCuracaoNcCategory, isNicaraguaCuracaoUrl,
  type SourceCoverage } from '../scrapers/nc/la-curacao.js';

function coverage(): SourceCoverage[] {
  return [
    { source: 'principal', productIds: ['a', 'b', 'a'], complete: true },
    { source: 'individuales', productIds: ['a'], complete: true },
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

test('cobertura deduplica productos presentes en varias categorías', () => {
  const result = compareCuracaoNcCoverage(coverage());
  assert.equal(result.equivalent, true);
  assert.equal(result.uniqueTotal, 2);
  assert.deepEqual(result.shared, ['a', 'b']);
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
