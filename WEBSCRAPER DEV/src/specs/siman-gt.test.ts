import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Page } from 'playwright';
import type { CsvProduct } from '../domain/product.js';
import { createSimanGuatemalaScraper, SIMAN_GT_SOURCE_URL } from '../scrapers/gt/siman.js';
import type { VisualScraperEngine } from '../scrapers/shared/visual-engine.js';

const mainSource = readFileSync('src/scrape-facenco-energy.ts', 'utf8');
const simanSource = readFileSync('src/scrapers/gt/siman.ts', 'utf8');

test('Siman conserva ocho paginas y timeout de 90 segundos', () => {
  assert.match(simanSource, /const maxPages = 8/);
  assert.match(simanSource, /const pageTimeoutMs = 90_000/);
  assert.match(mainSource, /Siman Guatemala'[\s\S]*10 \* 60_000/);
});

test('Siman pagina con el motor visual y detiene una pagina vacia posterior', async () => {
  const urls: string[] = [];
  const generic = async (_page: Page, _date: string, url: string): Promise<CsvProduct[]> => {
    urls.push(url);
    return [];
  };
  const scraper = createSimanGuatemalaScraper({
    scrapeGenericGuatemalaStore: generic,
    scrapeVisualProductGrid: async () => [],
    scrapePagedVisualProductGrid: async () => [],
  } as VisualScraperEngine);
  await scraper({} as Page, '2026-09-03T12:00:00.000Z');

  assert.equal(urls.length, 2);
  assert.equal(urls[0], SIMAN_GT_SOURCE_URL);
  assert.equal(new URL(urls[1]).searchParams.get('page'), '2');
});

test('Siman vive fuera del ejecutor principal', () => {
  assert.doesNotMatch(mainSource, /async function scrapeSimanGt\b/);
  assert.match(simanSource, /async function scrapeSimanGt\b/);
  assert.match(mainSource, /createSimanGuatemalaScraper/);
});
