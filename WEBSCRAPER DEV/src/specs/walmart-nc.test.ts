import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WALMART_NC,
  canonicalWalmartNcProductUrl,
  createWalmartNicaraguaScraper,
  dedupeWalmartNcProductUrls,
  isWalmartNcUrl,
  parseWalmartNcPrice,
  walmartNcApiUrl,
} from '../scrapers/nc/walmart.js';

test('Walmart NC conserva fuentes y conteos separados sin activar el worker', () => {
  assert.equal(WALMART_NC.country, 'NC');
  assert.equal(WALMART_NC.currency, 'NIO');
  assert.equal(WALMART_NC.operational, false);
  assert.deepEqual(WALMART_NC.expected,
    { accesorios: 109, colchonesFiltrados: 17, colchonesAmpliados: 18 });
  assert.ok(Object.values(WALMART_NC.sources).every(isWalmartNcUrl));
});

test('precios Walmart NC exigen un importe único en córdobas', () => {
  assert.equal(parseWalmartNcPrice('C$ 9,700.00'), 9700);
  assert.equal(parseWalmartNcPrice('C$18,963.00'), 18963);
  assert.equal(parseWalmartNcPrice('Q9,700.00'), null);
  assert.equal(parseWalmartNcPrice('C$18,963 C$21,950'), null);
});

test('productos Walmart NC se deduplican por URL canónica', () => {
  const product = WALMART_NC.controlProductUrl;
  assert.equal(canonicalWalmartNcProductUrl(`${product}?utm_source=search#detalle`), product);
  assert.deepEqual(dedupeWalmartNcProductUrls([product, `${product}?sku=7401150400123`]), [product]);
  assert.throws(() => canonicalWalmartNcProductUrl(WALMART_NC.sources.colchonesFiltrados), /no canónica/);
  assert.equal(isWalmartNcUrl('https://www.walmart.com.ni.evil.test/item/p'), false);
});

test('API Walmart NC pagina con rangos cerrados y acotados', () => {
  assert.equal(walmartNcApiUrl('cama', 0),
    'https://www.walmart.com.ni/api/catalog_system/pub/products/search/cama?_from=0&_to=49');
  assert.equal(walmartNcApiUrl('colchón', 50, 25),
    'https://www.walmart.com.ni/api/catalog_system/pub/products/search/colch%C3%B3n?_from=50&_to=74');
  assert.throws(() => walmartNcApiUrl('', 0), /inválido/);
  assert.throws(() => walmartNcApiUrl('cama', -1), /inválido/);
  assert.throws(() => walmartNcApiUrl('cama', 0, 51), /inválido/);
});

test('extractor API filtra falsos positivos, pagina y deduplica', async () => {
  const payloads = [
    [{ productName: 'Cama Individual Masterbed Orthopremier', brand: 'Masterbed', link: WALMART_NC.controlProductUrl,
      categories: ['/Artículos para el hogar/Colchones y Blancos/Colchones/'],
      items: [{ images: [{ imageUrl: 'https://example.test/cama.jpg', imageText: 'Cama' }], sellers: [
        { commertialOffer: { Price: 9700, ListPrice: 10000, AvailableQuantity: 2 } },
      ] }] },
    { productName: 'Carro RC Camara 2.4g', link: 'https://www.walmart.com.ni/camara/p', items: [] },
    { productName: 'Cama Impermeable Vibrant Life Mediana para Perro',
      link: 'https://www.walmart.com.ni/cama-vibrant-life/p', items: [] }],
    [{ productName: 'Cama Individual Masterbed Orthopremier', brand: 'Masterbed', link: `${WALMART_NC.controlProductUrl}?sku=1`,
      categories: ['/Artículos para el hogar/Colchones y Blancos/Colchones/'],
      items: [{ images: [], sellers: [{ commertialOffer: { Price: 9700, ListPrice: 10000, AvailableQuantity: 0 } }] }] }],
  ];
  let call = 0;
  const page = {
    goto: async () => ({ ok: () => true }),
    locator: () => ({ innerText: async () => JSON.stringify(payloads[call++] ?? []) }),
  } as any;
  const scraper = createWalmartNicaraguaScraper({ pageSize: 2, maxProductsPerSearch: 2,
    searchTerms: ['cama', 'colchon'] });
  const rows = await scraper(page, '2026-09-25T12:00:00.000Z');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sale_price, 'C$ 9,700.00');
  assert.equal(rows[0].regular_price, 'C$ 10,000.00');
  assert.equal(rows[0].discount, '3%');
  assert.equal(rows[0].product_url, WALMART_NC.controlProductUrl);
  assert.equal(rows[0].source_site, 'Walmart Nicaragua');
});

test('diagnostica ofertas API ausentes de productos Walmart sin precio', async () => {
  const payload = [{ productName: 'Cama King Koil matrimonial', brand: 'King Koil',
    link: 'https://www.walmart.com.ni/cama-king-koil/p',
    categories: ['/Artículos para el hogar/Colchones y Blancos/Colchones/'],
    items: [{ sellers: [{ sellerName: 'Walmart', commertialOffer: {
      Price: 0, ListPrice: 0, AvailableQuantity: 0, IsAvailable: false, SellerStockKeepingUnitId: '123',
    } }] }],
  }];
  let diagnostic: any[] = [];
  const page = {
    goto: async () => ({ ok: () => true }),
    locator: () => ({ innerText: async () => JSON.stringify(payload) }),
  } as any;
  const scraper = createWalmartNicaraguaScraper({ pageSize: 1, maxProductsPerSearch: 1,
    searchTerms: ['cama'], onUnpricedProducts: (rows) => { diagnostic = rows; } });
  const rows = await scraper(page, '2026-09-25T12:00:00.000Z');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].regular_price, '');
  assert.deepEqual(diagnostic, [{
    productName: 'Cama King Koil matrimonial', category: 'Camas y colchones',
    productUrl: 'https://www.walmart.com.ni/cama-king-koil/p',
    offers: [{ seller: 'Walmart', price: 0, listPrice: 0, availableQuantity: 0,
      isAvailable: false, fields: ['Price', 'ListPrice', 'AvailableQuantity', 'IsAvailable', 'SellerStockKeepingUnitId'] }],
  }]);
});
