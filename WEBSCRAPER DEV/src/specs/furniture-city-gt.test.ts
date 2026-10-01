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
const runtimeSource = readFileSync('src/scraper-runtime.ts', 'utf8');

test('Furniture City consulta sólo la categoría oficial y conserva los precios del listado', async () => {
  const productUrl = 'https://www.furniturecity.com.gt/producto/cama-prueba/';
  const navigated: string[] = [];
  const extracted: string[] = [];
  const linkFallbackOptions: boolean[] = [];
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
    source_url: FURNITURE_CITY_SOURCE_URL,
    headline: '',
    description: '',
    warranty: '',
    benefits: '',
    image_url: '',
    image_alt: '',
    scraped_at: '',
  };
  const page = {} as Page;
  const scraper = createFurnitureCityGuatemalaScraper({
    navigate: async (_page, url) => { navigated.push(url); },
    extractCards: async (_page, url, config) => {
      extracted.push(`${url}|${config.cardSelector}|${config.titleSelector}`);
      linkFallbackOptions.push(config.includeLinkFallback ?? true);
      return [extractedRow];
    },
  });

  const rows = await scraper(page, '2026-09-03T12:00:00.000Z');
  assert.deepEqual(navigated, [FURNITURE_CITY_SOURCE_URL]);
  assert.equal(extracted.length, 1);
  assert.deepEqual(linkFallbackOptions, [false]);
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
  assert.doesNotMatch(mainSource, /async function scrapeFurnitureCity\b/);
  assert.doesNotMatch(furnitureSource, /extractFurnitureCityCatalogUrls/);
  assert.match(furnitureSource, /async function scrapeFurnitureCity\b/);
  assert.match(runtimeSource, /config\.includeLinkFallback === false \? \[\]/);
  assert.match(mainSource, /createFurnitureCityGuatemalaScraper/);
});
