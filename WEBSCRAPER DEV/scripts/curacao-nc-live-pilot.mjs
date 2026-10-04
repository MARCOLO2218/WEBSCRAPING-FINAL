import { chromium } from 'playwright';
import { LA_CURACAO_NC, collectCuracaoNcPages, readCuracaoNcDom } from '../dist/scrapers/nc/la-curacao.js';

// Read-only category pilot; separate from the saved-capture review and GT workers.
const browser = await chromium.launch({ headless: true });
const observations = [];
try {
  const page = await browser.newPage({ locale: 'es-NI' });
  const result = await collectCuracaoNcPages(LA_CURACAO_NC.categoryUrl, async url => {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? 'sin respuesta'}`);
    await page.waitForSelector('.product-item-info', { timeout: 20_000 });
    const parsed = await readCuracaoNcDom(page, url);
    observations.push({ url, page: parsed.pageNumber, cards: parsed.cardCount,
      extracted: parsed.items.length, declaredTotal: parsed.declaredTotal,
      complete: parsed.complete, issues: parsed.issues, warnings: parsed.warnings });
    console.log(`La Curacao NC: página ${parsed.pageNumber}, ${parsed.items.length} fichas, total anunciado ${parsed.declaredTotal}.`);
    return parsed;
  }, 10);
  console.log(JSON.stringify({
    status: result.complete ? 'ok' : 'partial', databaseWrites: false,
    country: 'NC', currency: 'NIO', source: LA_CURACAO_NC.categoryUrl,
    count: result.items.length, complete: result.complete, reason: result.reason,
    failedUrl: result.failedUrl, duplicates: result.duplicateProducts, pages: observations,
    sample: result.items.slice(0, 3),
  }, null, 2));
  if (!result.complete) process.exitCode = 1;
} finally {
  await browser.close();
}
