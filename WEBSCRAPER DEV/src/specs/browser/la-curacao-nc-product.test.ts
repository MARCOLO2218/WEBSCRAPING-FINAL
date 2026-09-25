import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { LA_CURACAO_NC } from '../../scrapers/nc/la-curacao.js';
import { readCuracaoNcProductDom } from '../../scrapers/nc/la-curacao.js';

// Pruebas offline: JS deshabilitado y toda solicitud de red abortada.
const html = readFileSync(new URL('../../../src/specs/fixtures/la-curacao-nc/producto-serta.html', import.meta.url), 'utf8');
const productUrl = 'https://www.lacuracaonline.com/nicaragua/set-de-cama-serta-sleep-true-confort-medio-queen-457989600019/p';
const sourceUrl = LA_CURACAO_NC.sources.principal;
let browser: Browser;
let context: BrowserContext;
let page: Page;

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

test('ficha NC: extrae SKU, marca, precio final/habitual y atributos exactos', async () => {
  const result = await readCuracaoNcProductDom(page, productUrl, sourceUrl, { savedHtml: true });
  assert.equal(result.complete, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.product?.productId, '457989600019');
  assert.equal(result.product?.regularPrice, 40440);
  assert.equal(result.product?.salePrice, 26999);
  assert.equal(result.product?.discount, '33%');
  assert.equal(result.product?.brand, 'Serta');
  assert.equal(result.product?.plazas, 'Queen');
  assert.equal(result.product?.color, 'Azul');
  assert.equal(result.product?.category, 'Set de Cama');
  assert.equal(result.product?.availability, 'https://schema.org/InStock');
  assert.equal(result.product?.currency, 'NIO');
});

test('la cuota queda como dato informativo y la imagen local no se inventa', async () => {
  const result = await readCuracaoNcProductDom(page, productUrl, sourceUrl, { savedHtml: true });
  assert.equal(result.product?.installment, 'Obtén hasta 12 cuotas de C$2,249.92');
  assert.equal(result.product?.salePrice, 26999);
  assert.equal(result.product?.imageUrl, '');
  assert.deepEqual(result.warnings, ['imagen_local_sin_url_publica']);
});

test('un precio sin oferta se conserva sólo como precio regular', async () => {
  await page.locator('.old-price').evaluate(node => node.remove());
  await page.locator('.special-price').evaluate(node => node.classList.remove('special-price'));
  await page.locator('script[type="application/ld+json"]').evaluate(node => {
    const data = JSON.parse(node.textContent!); data.price = '26999.000000'; node.textContent = JSON.stringify(data);
  });
  const result = await readCuracaoNcProductDom(page, productUrl, sourceUrl, { savedHtml: true });
  assert.equal(result.complete, true);
  assert.equal(result.product?.regularPrice, 26999);
  assert.equal(result.product?.salePrice, null);
});

test('rechaza SKU discrepante, canonical ajeno y moneda o precio JSON-LD inconsistente', async () => {
  await page.locator('form[data-product-sku]').evaluate(node => node.setAttribute('data-product-sku', '999'));
  assert.ok((await readCuracaoNcProductDom(page, productUrl, sourceUrl, { savedHtml: true })).issues.includes('sku_url_inconsistente'));
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.locator('link[rel=canonical]').evaluate((node, value) => node.setAttribute('href', value), sourceUrl);
  assert.ok((await readCuracaoNcProductDom(page, productUrl, sourceUrl, { savedHtml: true })).issues.includes('canonical_no_coincide'));
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.locator('script[type="application/ld+json"]').evaluate(node => {
    const data = JSON.parse(node.textContent!); data.offers[0].priceCurrency = 'USD'; node.textContent = JSON.stringify(data);
  });
  assert.ok((await readCuracaoNcProductDom(page, productUrl, sourceUrl, { savedHtml: true })).issues.includes('oferta_jsonld_inconsistente'));
});

test('aisla ficha principal de productos relacionados y rechaza precio ambiguo', async () => {
  await page.locator('body').evaluate(node => node.insertAdjacentHTML('beforeend', '<form data-product-sku="000"></form><h1>Producto relacionado</h1>'));
  assert.equal((await readCuracaoNcProductDom(page, productUrl, sourceUrl, { savedHtml: true })).product?.productId, '457989600019');
  await page.locator('.product-info-main .price-box').evaluate(node => node.insertAdjacentHTML('beforeend', '<span data-price-type="finalPrice"><span class="price">C$1.00</span></span>'));
  assert.ok((await readCuracaoNcProductDom(page, productUrl, sourceUrl, { savedHtml: true })).issues.includes('precios_ausentes_o_ambiguos'));
});

test('valida URL de ficha, fuente y correspondencia de URL cargada', async () => {
  await assert.rejects(() => readCuracaoNcProductDom(page, productUrl.replace('/nicaragua/', '/guatemala/'), sourceUrl, { savedHtml: true }), /Nicaragua/);
  await assert.rejects(() => readCuracaoNcProductDom(page, productUrl, sourceUrl + '?brand=serta', { savedHtml: true }), /Parámetros/);
  await assert.rejects(() => readCuracaoNcProductDom(page, productUrl, sourceUrl.replace('/camas-y-colchones/camas', '/camas-no-registradas'), { savedHtml: true }), /Fuente/);
  await assert.rejects(() => readCuracaoNcProductDom(page, productUrl, sourceUrl), /página cargada/);
});
