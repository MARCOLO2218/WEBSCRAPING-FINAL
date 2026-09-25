import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAXIPALI_NC,
  canonicalMaxipaliNcProductUrl,
  classifyMaxipaliNcProduct,
  createMaxipaliNicaraguaScraper,
  dedupeMaxipaliNcProductUrls,
  isMaxipaliNcUrl,
  maxipaliNcProductId,
} from '../scrapers/nc/maxipali.js';

test('Maxi Pali NC conserva seis productos útiles separados y no activa el worker', () => {
  assert.equal(MAXIPALI_NC.country, 'NC');
  assert.equal(MAXIPALI_NC.currency, 'NIO');
  assert.equal(MAXIPALI_NC.operational, false);
  assert.deepEqual(MAXIPALI_NC.expected, { camas: 1, colchones: 3, accesorios: 2 });
  assert.ok(Object.values(MAXIPALI_NC.products).every(isMaxipaliNcUrl));
});

test('extractor visita las seis fichas confirmadas y conserva productos sin precio', async () => {
  const visited: string[] = [];
  const scraper = createMaxipaliNicaraguaScraper({
    navigate: async (_page, url) => { visited.push(url); },
    extractProduct: async (_page, productUrl) => ({
      source_site: 'mock', brand: 'Maxi Pali', line: '', category: 'Camas y colchones',
      product_name: productUrl.includes('cubrecama') ? 'CUBRECAMA MATRIMONIAL ESTAMPADA' :
        productUrl.includes('colchon') ? 'COLCHON QUEEN OZARK TRAIL' : 'CAMA SUPER DESCANSO',
      availability: '', regular_price: '', sale_price: '', discount: '', installment: '',
      product_url: productUrl, source_url: productUrl, headline: '', description: '', warranty: '',
      benefits: '', image_url: '', image_alt: '', scraped_at: '',
    }),
  });
  const rows = await scraper({} as any, '2026-09-25T00:00:00.000Z');
  assert.equal(visited.length, 6);
  assert.equal(rows.length, 6);
  assert.ok(rows.every((row) => row.source_site === MAXIPALI_NC.name));
  assert.ok(rows.every((row) => row.regular_price === '' && row.sale_price === ''));
});

test('clasificación excluye cámara y limpia colchón', () => {
  assert.equal(classifyMaxipaliNcProduct('CAMA SÚPER DESCANSO 2 PILLOW MAT'), 'cama');
  assert.equal(classifyMaxipaliNcProduct('COLCHON QUEEN OZARK TRAIL CON INFLADOR'), 'colchon');
  assert.equal(classifyMaxipaliNcProduct('CUBRECAMA MATRIMONIAL ESTAMPADA'), 'accesorio');
  assert.equal(classifyMaxipaliNcProduct('Carro RC Camara 2.4g AF'), null);
  assert.equal(classifyMaxipaliNcProduct('Limpia colchón espuma'), null);
});

test('identidad Maxi Pali procede del código publicado en la URL', () => {
  assert.equal(maxipaliNcProductId(MAXIPALI_NC.products.cama), '740115040065');
  assert.equal(maxipaliNcProductId(MAXIPALI_NC.products.colchonQueen), '692038863858');
  assert.throws(() => maxipaliNcProductId(MAXIPALI_NC.sources.camas), /sin identificador/);
  assert.throws(() => maxipaliNcProductId('https://example.com/item-740115040065'), /fuera/);
});

test('URLs se normalizan y deduplican por identificador', () => {
  const product = MAXIPALI_NC.products.cama;
  assert.equal(canonicalMaxipaliNcProductUrl(`${product}?origen=busqueda#detalle`), product);
  assert.deepEqual(dedupeMaxipaliNcProductUrls([product, `${product}?otro=1`]), [product]);
});
