import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { readCuracaoNcDom } from '../dist/scrapers/nc/la-curacao.js';
import { readCuracaoNcProductDom } from '../dist/scrapers/nc/la-curacao.js';
import { checkCuracaoNcSavedUrl, reviewCuracaoNcSavedPages } from '../dist/scrapers/nc/la-curacao.js';

const args = process.argv.slice(2);
const productMode = args[0] === '--product';
if ((!productMode && args.length !== 2) || (productMode && args.length !== 4)) {
  console.error('Uso: node scripts/curacao-nc-offline.mjs archivo.html URL_original | --pages manifiesto.json | --product ficha.html URL_producto URL_fuente');
  process.exit(1);
}
const multiPage = args[0] === '--pages';
let startUrl = productMode ? args[2] : args[1];
let inputs = [{ file: productMode ? args[1] : args[0], url: productMode ? args[2] : args[1] }];
const sourceUrl = productMode ? args[3] : null;
if (multiPage) {
  const manifestPath = resolve(args[1]);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
  if (manifest?.version !== 1 || typeof manifest.startUrl !== 'string' || !Array.isArray(manifest.pages)
    || manifest.pages.length === 0 || manifest.pages.some(p => typeof p?.file !== 'string' || !p.file.trim() || typeof p.url !== 'string')) {
    throw new Error('Manifiesto inválido: requiere version 1, startUrl y pages con file/url.');
  }
  startUrl = manifest.startUrl;
  inputs = manifest.pages.map(p => ({ file: resolve(dirname(manifestPath), p.file), url: p.url }));
}
// Comprobar archivos y procedencia antes de abrir el navegador.
const files = inputs.map(input => {
  const html = readFileSync(input.file, 'utf8');
  if (productMode) {
    const saved = html.match(/<!--\s*saved from url=\(\d+\)([^\r\n]*?)\s*-->/i);
    let savedUrlVerified = false;
    if (saved) {
      const captured = new URL(saved[1].trim());
      const declared = new URL(input.url);
      captured.hash = '';
      declared.hash = '';
      if (captured.href !== declared.href) throw new Error('La URL guardada no coincide con la ficha declarada.');
      savedUrlVerified = true;
    }
    return { ...input, html, savedUrlVerified };
  }
  return { ...input, html, savedUrlVerified: checkCuracaoNcSavedUrl(html, input.url) };
});
const browser = await chromium.launch({
  channel: process.env.CURACAO_NC_BROWSER_CHANNEL || (process.platform === 'win32' ? 'chrome' : undefined),
  headless: true,
});
try {
  const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
  // No navegar al sitio, cargar recursos, ejecutar scripts ni abrir las imágenes locales.
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  if (productMode) {
    await page.setContent(files[0].html, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const result = await readCuracaoNcProductDom(page, startUrl, sourceUrl, { savedHtml: true });
    if (!files[0].savedUrlVerified) result.warnings.push('url_original_declarada_manualmente');
    console.log(JSON.stringify({ mode: 'saved_product_offline', productUrl: startUrl, sourceUrl,
      sourceSha256: createHash('sha256').update(files[0].html).digest('hex'), ...result }, null, 2));
    if (!result.complete) process.exitCode = 2;
  } else {
  const samples = [];
  for (const file of files) {
    await page.setContent(file.html, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const result = await readCuracaoNcDom(page, file.url, { savedHtml: true });
    if (!file.savedUrlVerified) result.warnings.push('url_original_declarada_manualmente');
    samples.push({ url: file.url, sha256: createHash('sha256').update(file.html).digest('hex'), page: result });
  }
  const result = multiPage ? await reviewCuracaoNcSavedPages(startUrl, samples) : {
    mode: 'saved_html_offline', sourceUrl: startUrl,
    sourceSha256: samples[0].sha256,
    coverageComplete: false, // Una página no certifica una fuente ni la unión de tamaños.
    ...samples[0].page,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.complete) process.exitCode = 2;
  }
} finally { await browser.close(); }
