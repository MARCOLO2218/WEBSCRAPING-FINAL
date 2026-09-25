import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { readCuracaoNcDom } from '../../scrapers/nc/la-curacao.js';
import { LA_CURACAO_NC } from '../../scrapers/nc/la-curacao.js';
import { collectCuracaoNcPages } from '../../scrapers/nc/la-curacao.js';
import { reviewCuracaoNcSavedPages } from '../../scrapers/nc/la-curacao.js';

// Suite explícita de navegador: npm run test:curacao-dom. No descarga ni consulta la web.
const html = readFileSync(new URL('../../../src/specs/fixtures/la-curacao-nc/categoria-p1.html', import.meta.url), 'utf8');
const source = LA_CURACAO_NC.categoryUrl;
let browser: Browser;
let context: BrowserContext;
let page: Page;
const read = () => readCuracaoNcDom(page, source, { savedHtml: true });

before(async () => {
  browser = await chromium.launch({
    channel: process.env.CURACAO_NC_BROWSER_CHANNEL || (process.platform === 'win32' ? 'chrome' : undefined),
    headless: true,
  });
  context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
  await context.route('**/*', route => route.abort());
  page = await context.newPage();
});
after(async () => { await browser?.close(); });
test.beforeEach(async () => { await page.setContent(html, { waitUntil: 'domcontentloaded' }); });

test('HTML real NC: extrae 24 SKU, separa oferta/habitual y reconoce el siguiente enlace', async () => {
  const result = await read();
  assert.deepEqual(result.issues, []);
  assert.equal(result.complete, true); // Sólo esta página.
  assert.equal(result.items.length, 24);
  assert.equal(new Set(result.items.map(p => p.productId)).size, 24);
  assert.equal(result.declaredTotal, 68);
  assert.equal(result.pageSize, 24);
  assert.equal(result.nextUrl, `${source}?p=2`);
  const first = result.items[0];
  assert.equal(first.productId, '461918000016');
  assert.equal(first.regularPrice, 19000);
  assert.equal(first.salePrice, 10399);
  assert.equal(first.discount, '45%');
  const noSale = result.items.find(p => p.productId === '414351700104')!;
  assert.equal(noSale.regularPrice, 13000);
  assert.equal(noSale.salePrice, null);
  assert.ok(result.items.every(p => p.country === 'NC' && p.currency === 'NIO'));
  assert.ok(result.items.some(p => p.productName.startsWith('Colchón')));
  assert.deepEqual(result.filters, ['Categoría', 'Precio', 'Nivel de firmeza', 'Plazas', 'Marca', 'Color', 'Material']);
});

test('HTML guardado conserva stock del JSON-LD sin inventar imágenes, marca, plazas o cuotas', async () => {
  const result = await read();
  assert.deepEqual(result.warnings, ['imagenes_locales_sin_url_publica']);
  assert.ok(result.items.every(p => p.imageUrl === '' && p.brand === '' && p.plazas === ''
    && p.installment === '' && p.availability === 'https://schema.org/InStock'));
});

test('oferta JSON-LD debe coincidir por URL, precio y moneda con la tarjeta', async () => {
  await page.locator('script[type="application/ld+json"]').evaluate(e => {
    const data = JSON.parse(e.textContent!);
    data[0].offers[0].priceCurrency = 'GTQ';
    e.textContent = JSON.stringify(data);
  });
  assert.match((await read()).issues[0], /oferta_jsonld_inconsistente/);
  await page.locator('script[type="application/ld+json"]').evaluate(e => e.remove());
  const result = await read();
  assert.equal(result.complete, true);
  assert.ok(result.items.every(p => p.availability === ''));
});

test('usa URL canónica como identidad si falta SKU y no usa ID interno del contenedor', async () => {
  await page.locator('form[data-product-sku]').first().evaluate(e => e.removeAttribute('data-product-sku'));
  const result = await read();
  assert.equal(result.complete, true);
  assert.equal(result.items.length, 24);
  assert.equal(result.items[0].productId, result.items[0].productUrl);
  assert.ok(result.warnings.includes('identidad_por_url_canonica_sin_sku'));
});

test('acepta URL canónica como identidad cuando la tarjeta no publica SKU', async () => {
  await page.locator('.products-grid > .product-items').evaluate(node => node.classList.add('mgz-grid', 'mgz-product-items'));
  await page.locator('form[data-product-sku]').evaluateAll(nodes => nodes.forEach(node => node.removeAttribute('data-product-sku')));
  const result = await read();
  assert.equal(result.complete, true);
  assert.ok(result.warnings.includes('identidad_por_url_canonica_sin_sku'));
  assert.equal(result.items[0].productId, result.items[0].productUrl);
});

test('lee el grid MGZ de subcategoría, pero no certifica cobertura sin controles/conteos', async () => {
  await page.locator('.products-grid > .product-items').evaluate(node => node.classList.add('mgz-grid', 'mgz-product-items'));
  await page.locator('form[data-product-sku]').evaluateAll(nodes => nodes.forEach(node => node.removeAttribute('data-product-sku')));
  await page.locator('.toolbar-products').evaluateAll(nodes => nodes.forEach(node => node.remove()));
  const result = await read();
  assert.equal(result.cardCount, 24);
  assert.equal(result.items.length, 24);
  assert.equal(result.complete, false);
  assert.ok(result.issues.includes('controles_paginacion_ausentes_o_discrepantes'));
  assert.ok(result.warnings.includes('identidad_por_url_canonica_sin_sku'));
});

test('rechaza precios contradictorios, múltiples importes y moneda ajena', async () => {
  for (const text of ['C$1.00', 'C$10,399.00 C$19,000.00', 'Q10,399.00']) {
    await page.locator('[data-price-type="finalPrice"] .price').first().evaluate((e, value) => { e.textContent = value; }, text);
    assert.equal((await read()).complete, false);
  }
});

test('una cuota añadida fuera de price-box nunca sustituye el precio final', async () => {
  await page.locator('.product-item-info').first().evaluate(e => {
    e.insertAdjacentHTML('beforeend', '<div class="cuotas">12 cuotas de C$100.00</div>');
  });
  const result = await read();
  assert.equal(result.complete, true);
  assert.equal(result.items[0].salePrice, 10399);
  assert.equal(result.items[0].installment, ''); // Selector de cuotas aún sin muestra real.
});

test('rechaza una tarjeta truncada y SKU/URL duplicados dentro de la página', async () => {
  await page.locator('.product-item-info').last().evaluate(e => e.remove());
  assert.ok((await read()).issues.includes('conteo_tarjetas_inconsistente'));
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.locator('form[data-product-sku]').nth(1).evaluate(e => e.setAttribute('data-product-sku', '461918000016'));
  assert.match((await read()).issues[0], /producto_duplicado/);
});

test('no confunde ausencia de siguiente ni toolbar ausente con última página', async () => {
  await page.locator('.pages-item-next').evaluateAll(nodes => nodes.forEach(e => e.remove()));
  assert.ok((await read()).issues.includes('siguiente_ausente_o_ambiguo'));
  await page.locator('.toolbar-products').evaluateAll(nodes => nodes.forEach(e => e.remove()));
  assert.equal((await read()).complete, false);
});

test('rechaza salto de categoría, de país, de página y pérdida del orden solicitado', async () => {
  for (const url of [LA_CURACAO_NC.sources.queen + '?p=2', source.replace('/nicaragua/', '/guatemala/') + '?p=2', source + '?p=3']) {
    await page.locator('.pages-item-next a').evaluateAll((nodes, value) => nodes.forEach(e => e.setAttribute('href', value)), url);
    assert.ok((await read()).issues.includes('enlace_siguiente_invalido'));
  }
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  assert.ok((await readCuracaoNcDom(page, source + '?product_list_order=product_price_asc', { savedHtml: true })).issues.includes('enlace_siguiente_invalido'));
});

test('rechaza toolbars discrepantes y página actual distinta de la URL', async () => {
  await page.locator('.toolbar-amount .toolbar-number').last().evaluate(e => { e.textContent = '69'; });
  assert.ok((await read()).issues.includes('controles_paginacion_ausentes_o_discrepantes'));
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  assert.equal((await readCuracaoNcDom(page, source + '?p=2', { savedHtml: true })).complete, false);
});

test('última página sintética requiere concordancia de tarjetas y total', async () => {
  // Variación controlada: no es evidencia de haber recibido la página 3 real.
  await page.locator('.product-item-info').evaluateAll(nodes => nodes.slice(20).forEach(e => e.remove()));
  await page.locator('.toolbar-amount .items-total').evaluateAll(nodes => nodes.forEach(e => { e.textContent = '68'; }));
  await page.locator('.pages-items .current .page > span:not(.label)').evaluateAll(nodes => nodes.forEach(e => { e.textContent = '3'; }));
  await page.locator('.pages-item-next').evaluateAll(nodes => nodes.forEach(e => e.remove()));
  const result = await readCuracaoNcDom(page, source + '?p=3', { savedHtml: true });
  assert.equal(result.complete, true);
  assert.equal(result.nextUrl, null);
  assert.equal(result.items.length, 20);
});

test('acepta página intermedia corta si el contador corresponde a las tarjetas visibles', async () => {
  await page.locator('.product-item-info').last().evaluate(e => e.remove());
  await page.locator('.toolbar-amount .items-total').evaluateAll(nodes => nodes.forEach(e => { e.textContent = '47'; }));
  await page.locator('.toolbar-amount .toolbar-number:not(.items-total)').evaluateAll(nodes => nodes.forEach(e => { e.textContent = '54'; }));
  await page.locator('.pages-items .current .page > span:not(.label)').evaluateAll(nodes => nodes.forEach(e => { e.textContent = '2'; }));
  const camas = LA_CURACAO_NC.sources.principal;
  await page.locator('.pages-item-next a').evaluateAll((nodes, href) => nodes.forEach(e => e.setAttribute('href', href)), `${camas}?p=3`);
  const result = await readCuracaoNcDom(page, `${camas}?p=2`, { savedHtml: true });
  assert.deepEqual(result.issues, []);
  assert.equal(result.cardCount, 23);
  assert.equal(result.declaredTotal, 54);
  assert.equal(result.nextUrl, `${camas}?p=3`);
});

test('conecta lector DOM al colector sin certificar cobertura con una sola muestra', async () => {
  const result = await collectCuracaoNcPages(source, async () => read(), 1);
  assert.equal(result.items.length, 24);
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'max_pages');
});

test('valida origen y exige modo offline explícito para HTML cargado en blanco', async () => {
  await assert.rejects(() => readCuracaoNcDom(page, source), /Fuente fuera/);
  await assert.rejects(() => readCuracaoNcDom(page, source.replace('/nicaragua/', '/guatemala/'), { savedHtml: true }), /Fuente fuera/);
  await assert.rejects(() => readCuracaoNcDom(page, source + '?brand=olympia', { savedHtml: true }), /Parámetros/);
  await assert.rejects(() => readCuracaoNcDom(page, source + '?p=0', { savedHtml: true }), /Número de página/);
});

test('tres páginas HTML sintéticas completan 68 SKU sin simular evidencia del sitio vivo', async () => {
  const samples = [];
  for (let pageNumber = 1; pageNumber <= 3; pageNumber++) {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    if (pageNumber > 1) {
      await page.evaluate(({ pageNumber, source }) => {
        document.querySelectorAll('script').forEach(e => e.remove());
        document.querySelectorAll('.product-item-info').forEach((card, index) => {
          if (pageNumber === 3 && index >= 20) { card.remove(); return; }
          const sku = `synthetic-${pageNumber}-${index}`;
          card.querySelector('form[data-product-sku]')!.setAttribute('data-product-sku', sku);
          card.querySelector('a.product-item-link')!.setAttribute('href', `https://www.lacuracaonline.com/nicaragua/${sku}/p`);
        });
        document.querySelectorAll('.items-total').forEach(e => { e.textContent = String(Math.min(pageNumber * 24, 68)); });
        document.querySelectorAll('.current .page > span:not(.label)').forEach(e => { e.textContent = String(pageNumber); });
        document.querySelectorAll('.pages-item-next').forEach(e => {
          if (pageNumber === 3) e.remove();
          else e.querySelector('a')!.setAttribute('href', `${source}?p=3`);
        });
      }, { pageNumber, source });
    }
    const url = pageNumber === 1 ? source : `${source}?p=${pageNumber}`;
    const result = await readCuracaoNcDom(page, url, { savedHtml: true });
    assert.equal(result.complete, true);
    samples.push({ url, sha256: createHash('sha256').update(await page.content()).digest('hex'), page: result });
  }
  const report = await reviewCuracaoNcSavedPages(source, samples);
  assert.equal(report.sourceCoverageComplete, true);
  assert.equal(report.items.length, 68);
  assert.equal(report.duplicateProducts, 0);
  assert.equal(report.evidence.length, 3);
});
