import { chromium } from 'playwright';
import { executeNcReadOnly, NC_EXECUTION_STORES } from '../dist/scrapers/nc/execution.js';
import { LA_CURACAO_NC, collectCuracaoNcPages, readCuracaoNcDom } from '../dist/scrapers/nc/la-curacao.js';
import { runNicaraguaPilots } from './nicaragua-stores-pilot.mjs';

const summaryOnly = process.argv.includes('--summary');
const args = process.argv.slice(2).filter(arg => arg !== '--' && arg !== '--summary');
if (args.some(arg => !arg.startsWith('--stores='))) throw new Error('Use --stores=la-curacao,el-gallo,siman,walmart,maxipali');
if (args.length > 1) throw new Error('No repita --stores');
const requested = args.length ? args[0].slice('--stores='.length).split(',').map(value => value.trim()).filter(Boolean) : [];
if (args.length && !requested.length) throw new Error('Selección de tiendas vacía');
for (const store of requested) if (!Object.hasOwn(NC_EXECUTION_STORES, store)) throw new Error(`Tienda NC desconocida: ${store}`);

const browser = await chromium.launch({ headless: true });
const scrapedAt = new Date().toISOString();
try {
  const runners = Object.fromEntries(Object.keys(NC_EXECUTION_STORES).map(store => [store, async () => {
    console.log(`Nicaragua: iniciando ${store}.`);
    if (store !== 'la-curacao') {
      let rows = [];
      const report = await runNicaraguaPilots([store], { browser, scrapedAt, onRows: (_store, result) => { rows = result; } });
      const diagnostic = report.stores[store];
      if (diagnostic.status !== 'ok') throw new Error(diagnostic.message);
      return { rows, coverage: 'bounded_sources', diagnostics: diagnostic };
    }
    const page = await browser.newPage({ locale: 'es-NI' });
    const pages = [];
    try {
      const result = await collectCuracaoNcPages(LA_CURACAO_NC.categoryUrl, async url => {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
        await page.waitForSelector('.product-item-info', { timeout: 20_000 });
        const parsed = await readCuracaoNcDom(page, url);
        pages.push({ url, count: parsed.items.length, declaredTotal: parsed.declaredTotal, issues: parsed.issues });
        return parsed;
      }, 10);
      if (!result.complete) throw new Error(`La Curacao: cobertura ${result.reason}; ${JSON.stringify(pages)}`);
      return { coverage: 'verified_category', diagnostics: { pages, duplicates: result.duplicateProducts }, rows: result.items.map(product => ({
        source_site: 'La Curacao Nicaragua', brand: product.brand, line: '', category: product.category || 'Camas y colchones',
        product_id: product.productId, product_name: product.productName, product_url: product.productUrl, source_url: product.sourceUrl,
        regular_price: product.regularPriceText, sale_price: product.salePriceText, availability: product.availability,
        discount: product.discount, installment: product.installment, image_url: product.imageUrl, image_alt: product.imageAlt,
        headline: product.productName, description: '', warranty: '', benefits: '', scraped_at: scrapedAt,
      })) };
    } finally { await page.close(); }
  }]));
  const report = await executeNcReadOnly(requested, runners);
  const visibleReport = summaryOnly ? { ...report, stores: report.stores.map(({ products, diagnostics, ...store }) => ({
    ...store, sample: products.slice(0, 3),
  })) } : report;
  console.log(JSON.stringify({ scrapedAt, ...visibleReport }, null, 2));
  if (report.status !== 'ok') process.exitCode = 1;
} finally { await browser.close(); }
