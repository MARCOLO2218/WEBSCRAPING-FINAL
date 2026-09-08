import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Page } from 'playwright';
import type { CsvProduct } from '../domain/product.js';
import {
  MATTRESS_SOURCE_URL,
  SERTA_GT_SOURCE_URL,
  SLEEP_GALLERY_SOURCE_URL,
  createGuatemalaCardStores,
} from '../scrapers/gt/card-stores.js';

const mainSource = readFileSync('src/scrape-facenco-energy.ts', 'utf8');
const cardStoresSource = readFileSync('src/scrapers/gt/card-stores.ts', 'utf8');

test('Sleep Gallery y Mattress conservan URL y selectores principales', async () => {
  const navigated: string[] = [];
  const extracted: Array<{ url: string; site: string; card: string }> = [];
  const stores = createGuatemalaCardStores({
    navigate: async (_page, url) => { navigated.push(url); },
    extractCards: async (_page, url, config) => {
      extracted.push({ url, site: config.sourceSite, card: config.cardSelector });
      return [];
    },
    filterGuatemalaRows: (rows) => rows,
  });
  const page = { waitForLoadState: async () => undefined } as unknown as Page;
  await stores.sleepGallery(page, 'fecha');
  await stores.mattress(page, 'fecha');

  assert.deepEqual(navigated, [SLEEP_GALLERY_SOURCE_URL, MATTRESS_SOURCE_URL]);
  assert.deepEqual(extracted, [
    { url: SLEEP_GALLERY_SOURCE_URL, site: 'Sleep Gallery Guatemala', card: 'article.sg-card' },
    { url: MATTRESS_SOURCE_URL, site: 'Mattress Guatemala', card: 'li.product' },
  ]);
});

test('Serta conserva siete secciones y aplica filtro GTQ', async () => {
  const urls: string[] = [];
  const filteredSites: string[] = [];
  const stores = createGuatemalaCardStores({
    navigate: async (_page, url) => { urls.push(url); },
    extractCards: async () => [],
    filterGuatemalaRows: (rows, site) => { filteredSites.push(site || ''); return rows; },
  });
  const page = { waitForLoadState: async () => undefined } as unknown as Page;
  await stores.serta(page, 'fecha');

  assert.equal(urls.length, 7);
  assert.equal(urls[0], SERTA_GT_SOURCE_URL);
  assert.deepEqual(filteredSites, ['Serta Guatemala']);
});

test('las tres tiendas de tarjetas viven fuera del ejecutor', () => {
  for (const name of ['scrapeSleepGallery', 'scrapeSertaGt', 'scrapeMattress']) {
    assert.doesNotMatch(mainSource, new RegExp(`async function ${name}\\b`));
    assert.match(cardStoresSource, new RegExp(`async function ${name}\\b`));
  }
});
