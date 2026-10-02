import assert from 'node:assert/strict';
import test from 'node:test';
import type { Page } from 'playwright';
import { scrapeCemacoCards, scrapeCemacoCatalog, cemacoPageUrl } from '../scrapers/gt/cemaco.js';
import type { CsvProduct } from '../domain/product.js';

const source = 'https://www.cemaco.com/busqueda?q=camas&indexName=cemaco';

test('Cemaco limita paginación al origen y búsqueda originales', () => {
  assert.equal(cemacoPageUrl(`${source}&page=1`, source), source);
  assert.equal(cemacoPageUrl(`${source}&page=2&tracking=abc`, source), `${source}&page=2`);
  for (const href of ['https://example.com/busqueda?q=camas&indexName=cemaco&page=2', '/ofertas?page=2', '/busqueda?q=otros&indexName=cemaco&page=2', `${source}&page=0`, `${source}&page=21`, `${source}&page=2.5`]) {
    assert.equal(cemacoPageUrl(href, source), null);
  }
});

test('Cemaco descubre páginas sucesivas y conserva sólo URLs únicas', async () => {
  let current = '';
  const visited: string[] = [];
  const result = await scrapeCemacoCatalog({} as Page, source, '2026-10-02', {
    navigate: async (_page, url) => { current = url; visited.push(url); },
    prepare: async () => {},
    readCards: async () => [ { product_url: 'https://www.cemaco.com/comun/p' }, { product_url: `https://www.cemaco.com/producto-${new URL(current).searchParams.get('page') ?? '1'}/p` } ] as CsvProduct[],
    readPageLinks: async () => {
      const number = Number(new URL(current).searchParams.get('page') ?? 1);
      return [source, `${source}&page=${number < 4 ? number + 1 : 4}`];
    },
  });
  assert.deepEqual(visited, [source, `${source}&page=2`, `${source}&page=3`, `${source}&page=4`]);
  assert.equal(result.length, 5);
});

test('Cemaco recorre páginas ocultas por puntos suspensivos del paginador', async () => {
  const visited: string[] = [];
  await scrapeCemacoCatalog({} as Page, source, '', {
    navigate: async (_page, url) => { visited.push(url); }, prepare: async () => {},
    readCards: async (_page, url) => [{ product_url: `${url}/p` }] as CsvProduct[],
    readPageLinks: async () => [source, `${source}&page=4`],
  });
  assert.deepEqual(visited, [source, `${source}&page=2`, `${source}&page=3`, `${source}&page=4`]);
});

test('Cemaco no declara cobertura si una página está vacía o supera el límite', async () => {
  const dependencies = {
    navigate: async () => {}, prepare: async () => {},
    readCards: async () => [] as CsvProduct[], readPageLinks: async () => [] as string[],
  };
  await assert.rejects(scrapeCemacoCatalog({} as Page, source, '', dependencies), /sin tarjetas oficiales/);
  await assert.rejects(scrapeCemacoCatalog({} as Page, source, '', {
    ...dependencies,
    readCards: async () => [{ product_url: 'https://www.cemaco.com/colchon/p' }] as CsvProduct[],
    readPageLinks: async () => [`${source}&page=21`],
  }), /límite de 20 páginas/);
});

test('Cemaco toma fichas oficiales, separa centavos y deduplica URLs', async () => {
  const money = (whole: string, cents: string) => ({
    childNodes: [{ nodeType: 3, textContent: whole }, { nodeType: 1, textContent: cents }],
    querySelector: () => ({ textContent: cents }),
  });
  const card = (href: string, name = 'Colchón Beautyrest Firme') => ({
    getAttribute: () => href,
    querySelector: (selector: string) => {
      if (selector.includes('hitName')) return { textContent: name };
      if (selector.includes('hitBrand')) return { textContent: 'Simmons' };
      if (selector.includes('hitOfferedPrice')) return money('Q5,388', '50');
      if (selector.includes('hitPrice')) return money('Reg:Q8,290', '00');
      return null;
    },
  });
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    querySelectorAll: (selector: string) => {
      assert.equal(selector, 'a[data-product][class*="searchResult__hit"][href]');
      return [card('/colchon/p'), card('/colchon/p'), card('/restricciones'), card('https://other.example/colchon/p'), card('/sin-nombre/p', '')];
    },
  } });
  try {
    const page = { evaluate: async (fn: Function, args: unknown) => fn(args) } as unknown as Page;
    const rows = await scrapeCemacoCards(page, 'https://www.cemaco.com/busqueda?q=camas', '2026-10-02');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].product_name, 'Colchón Beautyrest Firme');
    assert.equal(rows[0].regular_price, 'Q8,290.00');
    assert.equal(rows[0].sale_price, 'Q5,388.50');
    assert.equal(rows[0].product_url, 'https://www.cemaco.com/colchon/p');
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
