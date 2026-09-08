import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Page } from 'playwright';
import {
  LA_COLCHONERIA_SOURCE_URL,
  OLYMPIA_SOURCE_URL,
  createOlympiaLaColchoneriaGuatemalaScrapers,
} from '../scrapers/gt/olympia-la-colchoneria.js';

const mainSource = readFileSync('src/scrape-facenco-energy.ts', 'utf8');
const moduleSource = readFileSync('src/scrapers/gt/olympia-la-colchoneria.ts', 'utf8');

test('Olympia y La Colchonería conservan navegación y fecha de scraping', async () => {
  const navigated: string[] = [];
  const dates: string[] = [];
  const page = {
    evaluate: async (_callback: unknown, sourceUrl: string) => [{
      source_site: sourceUrl === OLYMPIA_SOURCE_URL ? 'Camas Olympia Online GT' : 'La Colchonería Guatemala',
      product_name: 'Producto prueba',
      product_url: `${sourceUrl}producto-prueba`,
      scraped_at: '',
    }],
  } as unknown as Page;
  const scrapers = createOlympiaLaColchoneriaGuatemalaScrapers({
    navigate: async (_page, url) => { navigated.push(url); },
  });

  for (const scraper of [scrapers.olympia, scrapers.laColchoneria]) {
    const rows = await scraper(page, '2026-09-03T12:00:00.000Z');
    dates.push(rows[0]?.scraped_at ?? '');
  }

  assert.deepEqual(navigated, [OLYMPIA_SOURCE_URL, LA_COLCHONERIA_SOURCE_URL]);
  assert.deepEqual(dates, ['2026-09-03T12:00:00.000Z', '2026-09-03T12:00:00.000Z']);
});

test('se conservan los selectores específicos de ambas tiendas', () => {
  assert.match(moduleSource, /\.ol-products-grid article\.ol-card/);
  assert.match(moduleSource, /\.ol-card-title/);
  assert.match(moduleSource, /\.ol-price-old/);
  assert.match(moduleSource, /\.ol-price-new/);
  assert.match(moduleSource, /\.product-card\.js-product-card/);
  assert.match(moduleSource, /\.product-card__name\[href\]/);
  assert.match(moduleSource, /data-src/);
});

test('Olympia y La Colchonería viven fuera del ejecutor principal', () => {
  for (const name of [
    'extractOlympiaProducts',
    'scrapeOlympia',
    'extractLaColchoneriaProducts',
    'scrapeLaColchoneria',
  ]) {
    assert.doesNotMatch(mainSource, new RegExp(`async function ${name}\\b`));
    assert.match(moduleSource, new RegExp(`async function ${name}\\b`));
  }
  assert.doesNotMatch(mainSource, /const OLYMPIA_SOURCE_URL/);
  assert.doesNotMatch(mainSource, /const LA_COLCHONERIA_SOURCE_URL/);
  assert.match(mainSource, /createOlympiaLaColchoneriaGuatemalaScrapers/);
});
