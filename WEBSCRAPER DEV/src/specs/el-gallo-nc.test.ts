import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EL_GALLO_NC,
  canonicalElGalloNcProductUrl,
  createElGalloNicaraguaScraper,
  dedupeElGalloNcProductUrls,
  elGalloNcPageUrl,
  isElGalloNcUrl,
  parseElGalloNcPrice,
} from '../scrapers/nc/el-gallo.js';

test('El Gallo NC conserva país, moneda y fuentes sin activar el worker', () => {
  assert.equal(EL_GALLO_NC.country, 'NC');
  assert.equal(EL_GALLO_NC.currency, 'NIO');
  assert.equal(EL_GALLO_NC.operational, false);
  assert.deepEqual(EL_GALLO_NC.expected, { camas: 43, colchones: 42 });
  assert.ok(Object.values(EL_GALLO_NC.sources).every(isElGalloNcUrl));
});

test('extractor recorre cinco páginas por búsqueda y deduplica', async () => {
  const visited: string[] = [];
  const diagnostics: Array<{ source: string; page: number; count: number; url: string }> = [];
  const product = 'https://www.elgallomasgallo.com.ni/cama-capri-exclusiva-mat';
  const scraper = createElGalloNicaraguaScraper({
    navigate: async (_page, url) => { visited.push(url); },
    extractCards: async (_page, sourceUrl) => [{
      source_site: 'mock', brand: 'Capri', line: '', category: 'Camas',
      product_name: 'Cama Capri', availability: 'Disponible', regular_price: 'C$ 13,999',
      sale_price: 'C$ 10,999', discount: '21%', installment: '',
      product_url: `${product}?from=listado`, source_url: sourceUrl, headline: '', description: '',
      warranty: '', benefits: '', image_url: '', image_alt: '', scraped_at: '',
    }],
    onPageResult: (source, page, count, url) => diagnostics.push({ source, page, count, url }),
  });
  const rows = await scraper({} as any, '2026-09-25T00:00:00.000Z');
  assert.equal(visited.length, 10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].product_url, product);
  assert.equal(rows[0].source_site, EL_GALLO_NC.name);
  assert.equal(diagnostics.length, 10);
  assert.equal(diagnostics[0].url, visited[0]);
  assert.deepEqual([diagnostics[0].source, diagnostics[0].page, diagnostics[0].count], ['camas', 1, 1]);
});

test('paginación conserva filtros y no acepta rangos arbitrarios', () => {
  const first = new URL(elGalloNcPageUrl('camas', 1));
  const fifth = new URL(elGalloNcPageUrl('colchones', 5));
  assert.equal(first.searchParams.get('page'), null);
  assert.equal(first.searchParams.get('tipo_de_producto'), 'Matrimonial~Queen~Individual~King');
  assert.equal(fifth.searchParams.get('page'), '5');
  assert.equal(fifth.searchParams.get('q'), 'colchon');
  assert.throws(() => elGalloNcPageUrl('camas', 0), /fuera de rango/);
  assert.throws(() => elGalloNcPageUrl('camas', 1.5), /fuera de rango/);
});

test('precio acepta un solo importe en córdobas', () => {
  assert.equal(parseElGalloNcPrice('C$ 10,999'), 10999);
  assert.equal(parseElGalloNcPrice('C$4,299.00'), 4299);
  assert.equal(parseElGalloNcPrice('Q 10,999'), null);
  assert.equal(parseElGalloNcPrice('C$10,999 C$13,999'), null);
});

test('productos se deduplican por URL canónica entre búsquedas', () => {
  const product = 'https://www.elgallomasgallo.com.ni/cama-capri-exclusiva-mat';
  assert.equal(canonicalElGalloNcProductUrl(`${product}?related=uc_onsite_cp#detalle`), product);
  assert.deepEqual(dedupeElGalloNcProductUrls([product, `${product}/?related=otro`]), [product]);
  assert.throws(() => canonicalElGalloNcProductUrl(EL_GALLO_NC.sources.camas), /no identifica/);
  assert.equal(isElGalloNcUrl('https://www.elgallomasgallo.com.ni.evil.test/item'), false);
  assert.equal(isElGalloNcUrl('https://user:pass@www.elgallomasgallo.com.ni/item'), false);
});
