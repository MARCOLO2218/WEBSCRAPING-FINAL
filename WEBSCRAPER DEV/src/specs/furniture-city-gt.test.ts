import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Page } from 'playwright';
import {
  FURNITURE_CITY_SOURCE_URL,
  createFurnitureCityGuatemalaScraper,
} from '../scrapers/gt/furniture-city.js';

const mainSource = readFileSync('src/scrape-facenco-energy.ts', 'utf8');
const furnitureSource = readFileSync('src/scrapers/gt/furniture-city.ts', 'utf8');

test('Furniture City conserva descubrimiento de categorias y productos', async () => {
  const categoryUrl = 'https://www.furniturecity.com.gt/product-category/colchones/';
  const productUrl = 'https://www.furniturecity.com.gt/producto/cama-prueba/';
  const navigated: string[] = [];
  const extracted: string[] = [];
  const page = {
    evaluate: async () => [categoryUrl, productUrl],
  } as unknown as Page;
  const scraper = createFurnitureCityGuatemalaScraper({
    navigate: async (_page, url) => { navigated.push(url); },
    extractCards: async (_page, url, config) => {
      extracted.push(`${url}|${config.cardSelector}|${config.titleSelector}`);
      return [];
    },
  });

  const rows = await scraper(page, '2026-09-03T12:00:00.000Z');
  assert.deepEqual(navigated, [FURNITURE_CITY_SOURCE_URL, FURNITURE_CITY_SOURCE_URL, categoryUrl]);
  assert.equal(extracted.length, 2);
  assert.ok(extracted.every((value) => value.includes('li.product')));
  assert.equal(rows[0]?.product_url, productUrl);
  assert.equal(rows[0]?.source_site, 'Furniture City Guatemala');
});

test('Furniture City vive fuera del ejecutor principal', () => {
  for (const name of ['extractFurnitureCityCatalogUrls', 'scrapeFurnitureCity']) {
    assert.doesNotMatch(mainSource, new RegExp(`async function ${name}\\b`));
    assert.match(furnitureSource, new RegExp(`async function ${name}\\b`));
  }
  assert.match(mainSource, /createFurnitureCityGuatemalaScraper/);
});
