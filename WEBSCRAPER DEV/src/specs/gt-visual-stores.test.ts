import assert from 'node:assert/strict';
import test from 'node:test';
import type { Page } from 'playwright';
import type { CsvProduct } from '../domain/product.js';
import { createGuatemalaVisualStores, GT_VISUAL_STORE_URLS } from '../scrapers/gt/visual-stores.js';
import type { VisualScraperEngine } from '../scrapers/shared/visual-engine.js';

test('las cuatro tiendas GT envian sus parametros exactos al motor visual', async () => {
  const calls: unknown[][] = [];
  const generic = async (...args: [Page, string, string, string, string]): Promise<CsvProduct[]> => {
    calls.push(args);
    return [];
  };
  const unused = async (): Promise<CsvProduct[]> => [];
  const stores = createGuatemalaVisualStores({
    scrapeGenericGuatemalaStore: generic,
    scrapeVisualProductGrid: unused,
    scrapePagedVisualProductGrid: unused,
  } as VisualScraperEngine);
  const page = {} as Page;
  const scrapedAt = '2026-09-03T12:00:00.000Z';

  await stores.laCuracao(page, scrapedAt);
  await stores.elektra(page, scrapedAt);
  await stores.cemaco(page, scrapedAt);
  await stores.dormilandia(page, scrapedAt);

  assert.deepEqual(calls, [
    [page, scrapedAt, GT_VISUAL_STORE_URLS.laCuracao, 'La Curacao Guatemala', 'La Curacao'],
    [page, scrapedAt, GT_VISUAL_STORE_URLS.elektra, 'Elektra Guatemala', 'Elektra'],
    [page, scrapedAt, GT_VISUAL_STORE_URLS.cemaco, 'Cemaco Guatemala', 'Cemaco'],
    [page, scrapedAt, GT_VISUAL_STORE_URLS.dormilandia, 'Dormilandia Guatemala', 'Dormilandia'],
  ]);
});
