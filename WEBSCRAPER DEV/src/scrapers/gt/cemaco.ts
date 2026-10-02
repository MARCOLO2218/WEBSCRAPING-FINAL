import type { Page } from 'playwright';
import type { CsvProduct } from '../../domain/product.js';

export function cemacoPageUrl(href: string, sourceUrl: string): string | null {
  try {
    const source = new URL(sourceUrl);
    const candidate = new URL(href, source);
    const number = candidate.searchParams.get('page') ?? '1';
    if (candidate.origin !== source.origin || candidate.pathname !== source.pathname
      || candidate.searchParams.get('q') !== source.searchParams.get('q')
      || candidate.searchParams.get('indexName') !== source.searchParams.get('indexName')
      || !/^[1-9]\d*$/.test(number) || Number(number) > 20) return null;
    source.searchParams.delete('page');
    if (number !== '1') source.searchParams.set('page', number);
    return source.href;
  } catch { return null; }
}

export type CemacoCatalogDependencies = {
  navigate: (page: Page, url: string) => Promise<void>;
  prepare: (page: Page) => Promise<void>;
  readCards?: typeof scrapeCemacoCards;
  readPageLinks?: (page: Page) => Promise<string[]>;
};

export async function scrapeCemacoCatalog(page: Page, sourceUrl: string, scrapedAt: string, dependencies: CemacoCatalogDependencies): Promise<CsvProduct[]> {
  const readCards = dependencies.readCards ?? scrapeCemacoCards;
  const readPageLinks = dependencies.readPageLinks ?? ((page: Page) => page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>('a[class*="numberPaginatorA"][href]')).map(link => link.getAttribute('href') ?? '')));
  const initial = cemacoPageUrl(sourceUrl, sourceUrl);
  if (!initial) throw new Error('URL de búsqueda Cemaco inválida');
  const queue = [initial];
  const visited = new Set<string>();
  const unique = new Map<string, CsvProduct>();
  for (let index = 0; index < queue.length; index += 1) {
    const url = queue[index];
    if (visited.has(url)) continue;
    await dependencies.navigate(page, url);
    await dependencies.prepare(page);
    const rows = await readCards(page, url, scrapedAt);
    if (!rows.length) throw new Error(`Cemaco sin tarjetas oficiales en ${url}; cobertura no validada`);
    visited.add(url);
    for (const row of rows) if (!unique.has(row.product_url)) unique.set(row.product_url, row);
    console.log(`Cemaco Guatemala: página ${new URL(url).searchParams.get('page') ?? '1'}, ${rows.length} fichas, ${unique.size} únicas acumuladas.`);
    for (const href of await readPageLinks(page)) {
      const next = cemacoPageUrl(href, sourceUrl);
      if (next) {
        // The paginator abbreviates ranges with ellipses: enqueue missing intermediate pages too.
        const last = Number(new URL(next).searchParams.get('page') ?? 1);
        for (let number = 2; number <= last; number += 1) {
          const candidate = new URL(sourceUrl);
          candidate.searchParams.set('page', String(number));
          const intermediate = cemacoPageUrl(candidate.href, sourceUrl)!;
          if (!visited.has(intermediate) && !queue.includes(intermediate)) queue.push(intermediate);
        }
      }
      // Fail explicitly instead of silently claiming complete coverage at the safety limit.
      if (!next) {
        try {
          const candidate = new URL(href, sourceUrl);
          const exceedsLimit = Number(candidate.searchParams.get('page')) > 20;
          candidate.searchParams.set('page', '20');
          if (exceedsLimit && cemacoPageUrl(candidate.href, sourceUrl)) {
            throw new Error('Cemaco excede el límite de 20 páginas; revisar cobertura');
          }
        } catch (error) {
          if (error instanceof Error && error.message.startsWith('Cemaco excede')) throw error;
        }
      }
    }
  }
  return Array.from(unique.values());
}

export async function scrapeCemacoCards(page: Page, sourceUrl: string, scrapedAt: string): Promise<CsvProduct[]> {
  return page.evaluate(({ sourceUrl, scrapedAt }) => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const price = (element: Element | null): string => {
      if (!element) return '';
      const cents = clean(element.querySelector('span')?.textContent);
      const whole = clean(Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent).join(''));
      const amount = whole.match(/Q\s*([\d,]+)(?:\.(\d{2}))?/i);
      if (!amount || (cents && !/^\d{2}$/.test(cents))) return '';
      return `Q${amount[1]}.${amount[2] ?? (cents || '00')}`;
    };
    const rows: CsvProduct[] = [];
    const seen = new Set<string>();
    for (const card of document.querySelectorAll<HTMLAnchorElement>('a[data-product][class*="searchResult__hit"][href]')) {
      const url = new URL(card.getAttribute('href') ?? '', sourceUrl);
      const title = clean(card.querySelector('[class*="searchResult__hitName"]')?.textContent);
      if (url.hostname !== 'www.cemaco.com' || !url.pathname.endsWith('/p') || !title || seen.has(url.href)) continue;
      const image = card.querySelector<HTMLImageElement>('img');
      rows.push({
        source_site: 'Cemaco Guatemala', brand: clean(card.querySelector('[class*="searchResult__hitBrand"]')?.textContent) || 'Cemaco',
        line: '', category: '', product_name: title, availability: 'Listado en tienda online',
        regular_price: price(card.querySelector('[class$="searchResult__hitPrice"]')),
        sale_price: price(card.querySelector('[class$="searchResult__hitOfferedPrice"]')) || price(card.querySelector('[class$="searchResult__hitPrice"]')),
        discount: '', installment: '', product_url: url.href, source_url: sourceUrl,
        headline: '', description: '', warranty: '', benefits: '',
        image_url: image?.src ?? '', image_alt: clean(image?.alt), scraped_at: scrapedAt,
      });
      seen.add(url.href);
    }
    return rows;
  }, { sourceUrl, scrapedAt });
}
