import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  AMERICANA_2000_API_URL,
  AMERICANA_2000_SOURCE_URL,
  SUENA_CENTER_ALGOLIA_APP_ID,
  SUENA_CENTER_ALGOLIA_INDEX,
  SUENA_CENTER_SOURCE_URL,
} from '../scrapers/gt/api-stores.js';

const mainSource = readFileSync('src/scrape-facenco-energy.ts', 'utf8');
const apiStoresSource = readFileSync('src/scrapers/gt/api-stores.ts', 'utf8');

test('conserva la configuracion API de Suena Center', () => {
  assert.equal(SUENA_CENTER_SOURCE_URL, 'https://gt.camasuena.com/categorias/camas');
  assert.equal(SUENA_CENTER_ALGOLIA_APP_ID, 'LP9ZU0LM0S');
  assert.equal(SUENA_CENTER_ALGOLIA_INDEX, 'Prod_Suena_Online_GT_V1');
  assert.match(apiStoresSource, /hitsPerPage: 1000/);
});

test('conserva categoria, limite y moneda de Americana 2000', () => {
  assert.match(AMERICANA_2000_SOURCE_URL, /am2k_attr_product_brand=/);
  assert.equal(new URL(AMERICANA_2000_API_URL).searchParams.get('category'), '328');
  assert.equal(new URL(AMERICANA_2000_API_URL).searchParams.get('per_page'), '100');
  assert.match(apiStoresSource, /currency_code[\s\S]*GTQ/);
});

test('las tiendas API ya no se implementan en el ejecutor principal', () => {
  for (const functionName of ['scrapeSuenaCenterGt', 'scrapeAmericana2000Gt']) {
    assert.doesNotMatch(mainSource, new RegExp(`async function ${functionName}\\b`));
    assert.match(apiStoresSource, new RegExp(`export async function ${functionName}\\b`));
  }
});
