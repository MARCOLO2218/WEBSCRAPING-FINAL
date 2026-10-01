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
  const extractedRow = {
    source_site: 'Furniture City Guatemala',
    brand: 'Furniture City',
    line: '',
    category: 'Colchones',
    product_name: 'Colchón de prueba',
    availability: 'Disponible',
    regular_price: 'Q1,200.00',
    sale_price: 'Q999.00',
    discount: '',
    installment: '',
    product_url: productUrl,
    source_url: categoryUrl,
    headline: '',
    description: '',
    warranty: '',
    benefits: '',
    image_url: '',
    image_alt: '',
    scraped_at: '',
  };
  const page = {
    evaluate: async () => [categoryUrl],
  } as unknown as Page;
  const scraper = createFurnitureCityGuatemalaScraper({
    navigate: async (_page, url) => { navigated.push(url); },
    extractCards: async (_page, url, config) => {
      extracted.push(`${url}|${config.cardSelector}|${config.titleSelector}`);
      return [extractedRow];
    },
  });

  const rows = await scraper(page, '2026-09-03T12:00:00.000Z');
  assert.deepEqual(navigated, [FURNITURE_CITY_SOURCE_URL, FURNITURE_CITY_SOURCE_URL, categoryUrl]);
  assert.equal(extracted.length, 2);
  assert.ok(extracted.every((value) => value.includes('li.product')));
  assert.equal(rows[0]?.product_url, productUrl);
  assert.equal(rows[0]?.source_site, 'Furniture City Guatemala');
  assert.equal(rows[0]?.regular_price, 'Q1,200.00');
  assert.equal(rows[0]?.sale_price, 'Q999.00');
});

test('Furniture City usa su categoría actual de Descanso', () => {
  assert.equal(FURNITURE_CITY_SOURCE_URL, 'https://www.furniturecity.com.gt/product-category/Descanso/');
});

test('Furniture City vive fuera del ejecutor principal', () => {
  for (const name of ['extractFurnitureCityCatalogUrls', 'scrapeFurnitureCity']) {
    assert.doesNotMatch(mainSource, new RegExp(`async function ${name}\\b`));
    assert.match(furnitureSource, new RegExp(`async function ${name}\\b`));
  }
  assert.match(mainSource, /createFurnitureCityGuatemalaScraper/);
});
