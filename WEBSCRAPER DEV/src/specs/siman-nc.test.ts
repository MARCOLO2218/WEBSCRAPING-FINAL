import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIMAN_NC,
  canonicalSimanNcProductUrl,
  createSimanNicaraguaScraper,
  dedupeSimanNcProductUrls,
  isSimanNcUrl,
  parseSimanNcPrice,
  simanNcPageUrl,
} from '../scrapers/nc/siman.js';

test('Siman NC conserva país, moneda y cobertura observada sin activar el worker', () => {
  assert.equal(SIMAN_NC.country, 'NC');
  assert.equal(SIMAN_NC.currency, 'NIO');
  assert.equal(SIMAN_NC.operational, false);
  assert.deepEqual(SIMAN_NC.expected, { camas: 94, colchones: 32 });
  assert.deepEqual(SIMAN_NC.pageLimits, { camas: 5, colchones: 2 });
  assert.ok(Object.values(SIMAN_NC.sources).every(isSimanNcUrl));
});

test('paginación respeta límites distintos por búsqueda', () => {
  assert.equal(new URL(simanNcPageUrl('camas', 5)).searchParams.get('page'), '5');
  assert.equal(new URL(simanNcPageUrl('colchones', 2)).searchParams.get('page'), '2');
  assert.equal(new URL(simanNcPageUrl('camas', 1)).searchParams.get('page'), null);
  assert.throws(() => simanNcPageUrl('colchones', 3), /fuera de rango/);
  assert.throws(() => simanNcPageUrl('camas', 0), /fuera de rango/);
});

test('precio NC exige un importe único en córdobas', () => {
  assert.equal(parseSimanNcPrice('C$ 26,999.00'), 26999);
  assert.equal(parseSimanNcPrice('C$25,799.00-50%'), 25799);
  assert.equal(parseSimanNcPrice('C$ 9,000.00 - 10%'), 9000);
  assert.equal(parseSimanNcPrice('C$8999'), 8999);
  assert.equal(parseSimanNcPrice('$ 8,999'), null);
  assert.equal(parseSimanNcPrice('C$8,999 C$10,999'), null);
  assert.equal(parseSimanNcPrice('C$8,999-Oferta'), null);
});

test('productos repetidos entre camas y colchones usan URL canónica', () => {
  const product = 'https://ni.siman.com/cama-de-prueba/p';
  assert.equal(canonicalSimanNcProductUrl(`${product}?utm_source=search#detalle`), product);
  assert.deepEqual(dedupeSimanNcProductUrls([product, `${product}?sku=123`]), [product]);
  assert.throws(() => canonicalSimanNcProductUrl(SIMAN_NC.sources.camas), /no identifica/);
  assert.equal(isSimanNcUrl('https://ni.siman.com.evil.test/producto/p'), false);
});

test('extractor pagina ambas búsquedas y deduplica productos', async () => {
  const productUrl = 'https://ni.siman.com/cama-siman-prueba/p';
  let extracted = 0;
  const pageStats: Array<{ source: string; page: number; extracted: number; irrelevant: number; duplicates: number; accepted: number }> = [];
  const dependencies = {
    navigate: async () => undefined,
    extractCards: async (_page: unknown, sourceUrl: string) => {
      extracted += 1;
      if (sourceUrl.includes('page=') && !sourceUrl.includes('page=2')) return [];
      return [{ source_site: 'otro', brand: 'Siman', line: '', category: 'Camas',
        product_name: 'Cama Siman prueba', availability: 'Disponible', regular_price: 'C$ 10,000.00',
        sale_price: 'C$ 9,000.00-10%', discount: '10%', installment: '',
        product_url: `${productUrl}?origen=${extracted}`, source_url: sourceUrl, headline: '', description: '',
        warranty: '', benefits: '', image_url: '', image_alt: '', scraped_at: '' }];
    },
    onPageResult: (source: string, pageNumber: number, stats: any) => pageStats.push({ source, page: pageNumber, ...stats }),
  } as any;
  const page = { mouse: { wheel: async () => undefined }, waitForTimeout: async () => undefined } as any;
  const rows = await createSimanNicaraguaScraper(dependencies)(page, '2026-09-25T12:00:00.000Z');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].product_url, productUrl);
  assert.equal(rows[0].source_site, SIMAN_NC.name);
  assert.equal(rows[0].sale_price, 'C$ 9,000.00');
  assert.equal(rows[0].scraped_at, '2026-09-25T12:00:00.000Z');
  assert.ok(pageStats.some(({ duplicates }) => duplicates > 0));
  assert.ok(pageStats.every(({ extracted, accepted }) => extracted >= accepted));
  assert.ok(extracted >= 4);
});

test('diagnostica exclusiones irrelevantes, URL no válida y precio ilegible', async () => {
  const valid = (name: string, url: string, price = 'C$ 10,000') => ({
    source_site: 'otro', brand: 'Siman', line: '', category: 'Camas',
    product_name: name, availability: 'Disponible', regular_price: price,
    sale_price: '', discount: '', installment: '', product_url: url, source_url: '',
    headline: '', description: '', warranty: '', benefits: '', image_url: '', image_alt: '', scraped_at: '',
  });
  const stats: any[] = [];
  const dependencies = {
    navigate: async () => undefined,
    extractCards: async () => [
      valid('Cuna mini cama', 'https://ni.siman.com/cuna/p'),
      valid('Cama sin URL propia', 'https://ni.siman.com/search'),
      valid('Colchón precio ilegible', 'https://ni.siman.com/colchon/p', 'Consultar precio'),
    ],
    onPageResult: (_source: string, _page: number, result: unknown) => stats.push(result),
  } as any;
  const page = { mouse: { wheel: async () => undefined }, waitForTimeout: async () => undefined } as any;
  const rows = await createSimanNicaraguaScraper(dependencies)(page, '2026-09-25T12:00:00.000Z');
  assert.deepEqual(rows, []);
  assert.deepEqual(stats[0], {
    extracted: 3, irrelevant: 1, invalidUrl: 1, invalidPrice: 1,
    invalidPriceSamples: [{ name: 'Colchón precio ilegible', regular: 'Consultar precio', sale: '' }],
    duplicates: 0, accepted: 0,
  });
});
