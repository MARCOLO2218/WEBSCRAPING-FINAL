import assert from 'node:assert/strict';
import test from 'node:test';
import type { Page } from 'playwright';
import type { CsvProduct } from '../domain/product.js';
import {
  BODEGANGAS_SOURCE_URL,
  DORMISUENOS_SOURCE_URL,
  createGuatemalaPagedVisualStores,
} from '../scrapers/gt/paged-visual-stores.js';
import type { VisualScraperEngine } from '../scrapers/shared/visual-engine.js';

const sampleRow: CsvProduct = {
  source_site: 'Dormisuenos Guatemala', brand: 'Dormisuenos', line: '', category: 'Camas',
  product_name: 'Cama prueba', availability: 'Disponible', regular_price: 'Q1,000.00', sale_price: '',
  discount: '', installment: '', product_url: 'https://example.com/cama', source_url: '', headline: '',
  description: '', warranty: '', benefits: '', image_url: '', image_alt: '', scraped_at: '',
};

test('Dormisuenos conserva cuatro paginas visuales antes del fallback', async () => {
  const urls: string[] = [];
  const engine = {
    scrapeGenericGuatemalaStore: async () => [],
    scrapePagedVisualProductGrid: async () => [],
    scrapeVisualProductGrid: async (_page: Page, _date: string, url: string) => {
      urls.push(url);
      return [{ ...sampleRow }];
    },
  } as VisualScraperEngine;
  const stores = createGuatemalaPagedVisualStores(engine);
  const rows = await stores.dormisuenos({} as Page, '2026-09-03T12:00:00.000Z');

  assert.equal(rows.length, 1);
  assert.deepEqual(urls, [1, 2, 3, 4].map((page) => {
    const url = new URL(DORMISUENOS_SOURCE_URL);
    url.searchParams.set('product-page', String(page));
    return url.toString();
  }));
});

test('Bodegangas conserva tres rutas candidatas y cinco paginas por ruta', async () => {
  const calls: Array<[string, string, string, number | undefined]> = [];
  const engine = {
    scrapeGenericGuatemalaStore: async () => [],
    scrapeVisualProductGrid: async () => [],
    scrapePagedVisualProductGrid: async (_page: Page, _date: string, url: string, site: string, brand: string, pages?: number) => {
      calls.push([url, site, brand, pages]);
      return [];
    },
  } as VisualScraperEngine;
  const stores = createGuatemalaPagedVisualStores(engine);
  await stores.bodegangas({} as Page, '2026-09-03T12:00:00.000Z');

  assert.deepEqual(calls, [
    [BODEGANGAS_SOURCE_URL, 'Bodegangas Guatemala', 'Bodegangas', 5],
    ['https://bodegangasgts.com/?product_cat=camas&s=camas&et_search=true&post_type=product', 'Bodegangas Guatemala', 'Bodegangas', 5],
    ['https://bodegangasgts.com/product-category/camas/', 'Bodegangas Guatemala', 'Bodegangas', 5],
  ]);
});
