import test from 'node:test';
import assert from 'node:assert/strict';
import { LA_CURACAO_NC } from '../scrapers/nc/la-curacao.js';
import { createCuracaoNcProduct } from '../scrapers/nc/la-curacao.js';
import { checkCuracaoNcSavedUrl, reviewCuracaoNcSavedPages, type CuracaoNcSavedPage } from '../scrapers/nc/la-curacao.js';

const source = LA_CURACAO_NC.categoryUrl;
const second = `${source}?p=2`;
// Resultados sintéticos del lector: no representan páginas 2/3 reales recibidas.
function sample(url: string, ids: string[], nextUrl: string | null, total = 3): CuracaoNcSavedPage {
  return {
    url, sha256: 'a'.repeat(64),
    page: {
      pageNumber: Number(new URL(url).searchParams.get('p') ?? 1),
      pageSize: 2, declaredTotal: total, cardCount: ids.length,
      complete: true, nextUrl, issues: [], warnings: [], filters: [],
      items: ids.map(id => createCuracaoNcProduct({ productId: id, productName: `Cama ${id}`,
        productUrl: `https://www.lacuracaonline.com/nicaragua/cama-${id}/p`,
        sourceUrl: url, regularPrice: 'C$100.00' })),
    },
  };
}

test('capturas NC se recorren por siguiente, conservando huellas y procedencia', async () => {
  const result = await reviewCuracaoNcSavedPages(source, [sample(second, ['3'], null), sample(source, ['1', '2'], second)]);
  assert.equal(result.sourceCoverageComplete, true);
  assert.equal(result.reason, 'finished');
  assert.deepEqual(result.pagesVisited, [source, second]);
  assert.deepEqual(result.items.map(p => p.productId), ['1', '2', '3']);
  assert.deepEqual(result.productPages[2], { productId: '3', pages: [second] });
  assert.ok(result.evidence.every(e => e.inspected && e.sha256 === 'a'.repeat(64)));
});

test('falta de captura produce informe parcial, con siguiente URL pendiente', async () => {
  const result = await reviewCuracaoNcSavedPages(source, [sample(source, ['1', '2'], second)]);
  assert.equal(result.complete, false);
  assert.equal(result.sourceCoverageComplete, false);
  assert.equal(result.reason, 'missing_saved_page');
  assert.equal(result.missingSavedUrl, second);
  assert.equal(result.declaredTotal, 3);
  assert.equal(result.items.length, 2);
});

test('capturas NC rechazan mezcla de fuente/orden, URLs repetidas, inicio tardío y huellas inválidas', async () => {
  await assert.rejects(() => reviewCuracaoNcSavedPages(source, [sample(LA_CURACAO_NC.sources.queen, ['1'], null)]), /misma fuente/);
  await assert.rejects(() => reviewCuracaoNcSavedPages(source, [sample(`${source}?product_list_order=product_price_asc`, ['1'], null)]), /misma fuente/);
  await assert.rejects(() => reviewCuracaoNcSavedPages(source, [sample(source, ['1'], null), sample(`${source}?p=1`, ['1'], null)]), /repetida/);
  await assert.rejects(() => reviewCuracaoNcSavedPages(second, [sample(second, ['1'], null)]), /página 1/);
  await assert.rejects(() => reviewCuracaoNcSavedPages(source, [{ ...sample(source, ['1'], null), sha256: '' }]), /SHA-256/);
});

test('no combina un SKU con dos URLs ni una URL con dos SKU', async () => {
  const conflicting = sample(second, ['1'], null);
  conflicting.page.items[0].productUrl = 'https://www.lacuracaonline.com/nicaragua/otra-cama/p';
  const result = await reviewCuracaoNcSavedPages(source, [sample(source, ['1', '2'], second), conflicting]);
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'identity_conflict');
  assert.equal(result.identityConflicts[0].productId, '1');

  const alias = sample(second, ['3'], null);
  alias.page.items[0].productUrl = 'https://www.lacuracaonline.com/nicaragua/cama-1/p';
  assert.equal((await reviewCuracaoNcSavedPages(source, [sample(source, ['1', '2'], second), alias])).reason, 'identity_conflict');
});

test('capturas NC no certifican total cambiado, repetición ni procedencia incongruente', async () => {
  const first = sample(source, ['1', '2'], second);
  assert.equal((await reviewCuracaoNcSavedPages(source, [first, sample(second, ['3'], null, 4)])).reason, 'total_changed');
  assert.equal((await reviewCuracaoNcSavedPages(source, [first, sample(second, ['2'], null)])).reason, 'count_mismatch');
  const wrongSource = sample(second, ['3'], null);
  wrongSource.page.items[0].sourceUrl = LA_CURACAO_NC.sources.queen;
  assert.equal((await reviewCuracaoNcSavedPages(source, [first, wrongSource])).complete, false);
});

test('una captura extra sin visitar y una tarjeta parcial impiden certificar el conjunto', async () => {
  const extra = await reviewCuracaoNcSavedPages(source, [sample(source, ['1'], null, 1), sample(second, ['2'], null, 1)]);
  assert.equal(extra.complete, false);
  assert.equal(extra.reason, 'unused_saved_pages');
  assert.deepEqual(extra.unvisitedSavedUrls, [second]);
  const partial = sample(source, ['1'], second);
  partial.page.complete = false;
  partial.page.issues = ['tarjeta_2:identidad_ausente_o_ambigua'];
  const result = await reviewCuracaoNcSavedPages(source, [partial]);
  assert.equal(result.reason, 'partial_page');
  assert.deepEqual(result.evidence[0].issues, partial.page.issues);
});

test('URL de página guardada se contrasta sin ejecutar el HTML', () => {
  assert.equal(checkCuracaoNcSavedUrl(`<!-- saved from url=(0068)${source} -->`, `${source}?p=1`), true);
  assert.equal(checkCuracaoNcSavedUrl('<!doctype html><h1>Fixture</h1>', source), false);
  assert.throws(() => checkCuracaoNcSavedUrl(`<!-- saved from url=(0072)${second} -->`, source), /no coincide/);
  assert.throws(() => checkCuracaoNcSavedUrl(`<!-- saved from url=(0072)${source.replace('/nicaragua/', '/guatemala/')} -->`, source), /Nicaragua/);
});
