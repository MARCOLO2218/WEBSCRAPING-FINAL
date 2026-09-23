import { isNicaraguaCuracaoUrl } from './la-curacao.js';

export type CuracaoNcPage<T extends { productId: string }> = {
  items: readonly T[];
  /** Null only when the page reader verified that no next page exists. */
  nextUrl: string | null;
  /** False when the page's product extraction was partial or uncertain. */
  complete: boolean;
};

export type CuracaoNcPaginationResult<T> = {
  items: T[];
  pagesVisited: string[];
  productPages: Array<{ productId: string; pages: string[] }>;
  duplicateProducts: number;
  complete: boolean;
  failedUrl: string | null;
  reason: 'finished' | 'partial_page' | 'empty_page' | 'read_error' | 'invalid_next_url' | 'cycle' | 'max_pages';
};

function pageKey(value: string): string {
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}

/**
 * A fail-closed page collector. A store adapter supplies page contents and the
 * verified next-page URL; this function handles route validation, loops,
 * incomplete pages, the safety limit and identity deduplication.
 */
export async function collectCuracaoNcPages<T extends { productId: string }>(
  startUrl: string,
  readPage: (url: string) => Promise<CuracaoNcPage<T>>,
  maxPages: number,
): Promise<CuracaoNcPaginationResult<T>> {
  if (!isNicaraguaCuracaoUrl(startUrl)) throw new Error('URL inicial fuera de La Curacao Nicaragua.');
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error('maxPages debe ser un entero positivo.');

  const visited = new Set<string>();
  const pagesVisited: string[] = [];
  const byId = new Map<string, T>();
  const pagesByProduct = new Map<string, string[]>();
  let duplicateProducts = 0;
  let url = new URL(startUrl).toString();
  const finish = (
    complete: boolean,
    reason: CuracaoNcPaginationResult<T>['reason'],
    failedUrl: string | null = null,
  ) => ({
    items: [...byId.values()],
    pagesVisited,
    productPages: [...pagesByProduct].map(([productId, pages]) => ({ productId, pages })),
    duplicateProducts,
    complete,
    failedUrl,
    reason,
  });

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const key = pageKey(url);
    if (visited.has(key)) {
      return finish(false, 'cycle');
    }
    visited.add(key);
    pagesVisited.push(url);

    let page: CuracaoNcPage<T>;
    try {
      page = await readPage(url);
    } catch {
      return finish(false, 'read_error', url);
    }
    if (!page.complete) {
      return finish(false, 'partial_page');
    }
    for (const item of page.items) {
      const productId = item.productId.trim();
      if (!productId) throw new Error('Identidad de producto vacía durante la paginación.');
      if (byId.has(productId)) duplicateProducts += 1;
      else byId.set(productId, item);
      const pages = pagesByProduct.get(productId) ?? [];
      if (pages.at(-1) !== url) pages.push(url);
      pagesByProduct.set(productId, pages);
    }
    if (page.nextUrl === null) {
      return page.items.length === 0
        ? finish(false, 'empty_page', url)
        : finish(true, 'finished');
    }
    if (!isNicaraguaCuracaoUrl(page.nextUrl)) {
      return finish(false, 'invalid_next_url');
    }
    const nextKey = pageKey(page.nextUrl);
    if (visited.has(nextKey)) {
      return finish(false, 'cycle');
    }
    if (page.items.length === 0) {
      return finish(false, 'empty_page', url);
    }
    if (pageNumber === maxPages - 1) {
      return finish(false, 'max_pages');
    }
    url = new URL(page.nextUrl).toString();
  }

  return finish(false, 'max_pages');
}
