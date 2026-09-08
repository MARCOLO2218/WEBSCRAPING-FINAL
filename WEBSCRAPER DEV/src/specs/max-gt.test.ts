import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync('src/scrape-facenco-energy.ts', 'utf8');
const maxSource = readFileSync('src/scrapers/gt/max.ts', 'utf8');

test('MAX conserva sus cinco busquedas y una pagina por busqueda', () => {
  for (const query of ['camas', 'colchon', 'colchones', 'base%20cama', 'almohada']) {
    assert.match(maxSource, new RegExp(`max\\.com\\.gt/search\\?q=${query}`));
  }
  assert.match(maxSource, /const maxPagesPerSearch = 1/);
});

test('MAX conserva contexto Guatemala y moneda GTQ', () => {
  assert.match(maxSource, /localStorage\.setItem\('country', 'GT'\)/);
  assert.match(maxSource, /localStorage\.setItem\('currency', 'GTQ'\)/);
  assert.match(maxSource, /name: 'country', value: 'GT'/);
  assert.match(maxSource, /name: 'currency', value: 'GTQ'/);
});

test('el extractor especializado de MAX vive fuera del ejecutor', () => {
  for (const functionName of ['prepareMaxPage', 'autoScrollMaxCatalogPage', 'extractMaxProductsFromPage', 'scrapeMaxGtDetailed']) {
    assert.doesNotMatch(mainSource, new RegExp(`(?:async )?function ${functionName}\\b`));
    assert.match(maxSource, new RegExp(`(?:async )?function ${functionName}\\b`));
  }
  assert.match(mainSource, /createMaxGuatemalaScraper/);
});
