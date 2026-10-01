import { chromium } from 'playwright';
import type { CsvProduct } from './domain/product.js';
import { filterGuatemalaQuetzalRows } from './scrape-facenco-energy.js';
import { scrapeAmericana2000Gt, scrapeSuenaCenterGt } from './scrapers/gt/api-stores.js';
import { createGuatemalaPagedVisualStores } from './scrapers/gt/paged-visual-stores.js';
import { createMaxGuatemalaScraper } from './scrapers/gt/max.js';
import { createWalmartGuatemalaScraper } from './scrapers/gt/walmart.js';
import { createSimanGuatemalaScraper } from './scrapers/gt/siman.js';
import { createGuatemalaCardStores } from './scrapers/gt/card-stores.js';
import { scrapeBedsDreams } from './scrapers/gt/beds-dreams.js';
import { createFurnitureCityGuatemalaScraper } from './scrapers/gt/furniture-city.js';
import { createOlympiaLaColchoneriaGuatemalaScrapers } from './scrapers/gt/olympia-la-colchoneria.js';
import { createFacencoGuatemalaScraper } from './scrapers/gt/facenco.js';
import { createGuatemalaVisualStores } from './scrapers/gt/visual-stores.js';
import { createVisualScraperEngine } from './scrapers/shared/visual-engine.js';
import { createGuatemalaScraperRegistry } from './scrapers/gt/registry.js';
import { extractCardProducts, goto } from './scraper-runtime.js';

const timestamp = new Date().toISOString();
const engine = createVisualScraperEngine({
  navigate: goto,
  filterGuatemalaRows: filterGuatemalaQuetzalRows,
  extractCards: extractCardProducts,
});
const visualStores = createGuatemalaVisualStores(engine);
const pagedVisualStores = createGuatemalaPagedVisualStores(engine);
const max = createMaxGuatemalaScraper({ navigate: goto, filterGuatemalaRows: filterGuatemalaQuetzalRows });
const walmart = createWalmartGuatemalaScraper({ filterGuatemalaRows: filterGuatemalaQuetzalRows });
const siman = createSimanGuatemalaScraper(engine);
const cardStores = createGuatemalaCardStores({
  navigate: goto,
  extractCards: extractCardProducts,
  filterGuatemalaRows: filterGuatemalaQuetzalRows,
});
const furnitureCity = createFurnitureCityGuatemalaScraper({ navigate: goto, extractCards: extractCardProducts });
const olympiaColchoneria = createOlympiaLaColchoneriaGuatemalaScrapers({ navigate: goto });
const facenco = createFacencoGuatemalaScraper({ navigate: goto });

const allStores = createGuatemalaScraperRegistry(timestamp, {
  facenco,
  olympia: olympiaColchoneria.olympia,
  laColchoneria: olympiaColchoneria.laColchoneria,
  sleepGallery: cardStores.sleepGallery,
  serta: cardStores.serta,
  americana2000: scrapeAmericana2000Gt,
  mattress: cardStores.mattress,
  bedsDreams: scrapeBedsDreams,
  furnitureCity,
  laCuracao: visualStores.laCuracao,
  max,
  elektra: visualStores.elektra,
  walmart,
  cemaco: visualStores.cemaco,
  siman,
  suenaCenter: scrapeSuenaCenterGt,
  dormilandia: visualStores.dormilandia,
  dormisuenos: pagedVisualStores.dormisuenos,
  bodegangas: pagedVisualStores.bodegangas,
});
const requestedStoreNames = process.argv.find((argument) => argument.startsWith('--stores='))
  ?.slice('--stores='.length)
  .split(',')
  .map((name) => name.trim().toLocaleLowerCase())
  .filter(Boolean) ?? [];
const stores = requestedStoreNames.length
  ? allStores.filter((store) => requestedStoreNames.includes(store.name.toLocaleLowerCase()))
  : allStores;
if (requestedStoreNames.length && stores.length !== requestedStoreNames.length) {
  throw new Error(`No se encontró alguna tienda solicitada. Disponibles: ${allStores.map((store) => store.name).join(', ')}`);
}

const headed = process.argv.includes('--headed');
const browser = await chromium.launch({ headless: !headed });
const page = await browser.newPage({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
});
const failures: string[] = [];

try {
  console.log(`Auditoria GT solo lectura: ${timestamp} (${stores.length}/${allStores.length} tiendas)`);
  console.log('Persistencia PostgreSQL y exportación de catálogo no forman parte de este comando.');

  for (const store of stores) {
    const startedAt = Date.now();
    try {
      const rows: CsvProduct[] = await store.run(page);
      const livePage = await page.evaluate(() => ({ title: document.title, text: (document.body?.innerText ?? '').slice(0, 800) }));
      if (/database error|error establishing a database connection/i.test(`${livePage.title} ${livePage.text}`)) {
        throw new Error(`El sitio publico una pagina de error: ${livePage.title}.`);
      }
      if (/checking your browser|verify you are human|captcha|access denied/i.test(`${livePage.title} ${livePage.text}`)) {
        throw new Error(`El sitio presentó protección anti-bot en ${livePage.title}. Prueba la auditoría en modo visible.`);
      }
      const named = rows.filter((row) => row.product_name.trim());
      const priced = rows.filter((row) => row.regular_price.trim() || row.sale_price.trim());
      const linked = rows.filter((row) => row.product_url.trim());
      console.log(JSON.stringify({
        tienda: store.name,
        estado: rows.length ? 'OK' : 'VACIA',
        candidatos: rows.length,
        con_nombre: named.length,
        con_precio: priced.length,
        con_url: linked.length,
        muestras: rows.slice(0, 3).map((row) => ({ producto: row.product_name, precio: row.sale_price || row.regular_price || '' })),
        diagnostico_pagina: rows.length === 0 ? await page.evaluate(() => ({
          title: document.title,
          etheme_cards: document.querySelectorAll('.etheme-product-grid-item').length,
          product_links: document.querySelectorAll('a[href*="/producto/"]').length,
          text: (document.body?.innerText ?? '').slice(0, 400),
        })) : undefined,
        segundos: Math.round((Date.now() - startedAt) / 1000),
      }));
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      failures.push(`${store.name}: ${detalle}`);
      console.log(JSON.stringify({
        tienda: store.name,
        estado: 'ERROR',
        detalle,
        segundos: Math.round((Date.now() - startedAt) / 1000),
      }));
    } finally {
      await page.goto('about:blank').catch(() => undefined);
    }
  }
} finally {
  await browser.close();
}

console.log(`Resumen auditoría: ${stores.length} tiendas, ${failures.length} fallos de ejecución.`);
if (failures.length) process.exitCode = 1;
