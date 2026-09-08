import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { WALMART_GT_SOURCE_URL } from '../scrapers/gt/walmart.js';

const mainSource = readFileSync('src/scrape-facenco-energy.ts', 'utf8');
const walmartSource = readFileSync('src/scrapers/gt/walmart.ts', 'utf8');

test('Walmart conserva busquedas y limites de paginacion', () => {
  assert.match(walmartSource, /const pageSize = 50/);
  assert.match(walmartSource, /const maxProductsPerSearch = 300/);
  for (const term of ['cama', 'colchon', 'almohada', 'base cama', 'protector cama']) {
    assert.ok(walmartSource.includes(`'${term}'`));
  }
});

test('Walmart conserva endpoint API, origen y filtro Guatemala', () => {
  assert.match(WALMART_GT_SOURCE_URL, /^https:\/\/www\.walmart\.com\.gt\//);
  assert.match(walmartSource, /api\/catalog_system\/pub\/products\/search/);
  assert.match(walmartSource, /filterGuatemalaQuetzalRows\(rows, 'Walmart Guatemala'\)/);
});

test('Walmart vive fuera del ejecutor principal', () => {
  assert.doesNotMatch(mainSource, /async function scrapeWalmartGt\b/);
  assert.match(walmartSource, /async function scrapeWalmartGt\b/);
  assert.match(mainSource, /createWalmartGuatemalaScraper/);
});
