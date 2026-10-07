import type { Page } from 'playwright';
import { cleanProductText as cleanText, normalizeProductText as normalizeCatalogText, type CsvProduct } from '../../domain/product.js';
import type { VisualScraperEngine } from '../shared/visual-engine.js';

export const DORMISUENOS_SOURCE_URL = 'https://tiendasdormisuenos.com/categoria-producto/camas/?product-page=1';
export const BODEGANGAS_SOURCE_URL = 'https://bodegangasgts.com/categoria-producto/dormitorio/camas/';
export const BODEGANGAS_CARD_SELECTOR = '.product-grid-item, li.product, .etheme-product-grid-item';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createGuatemalaPagedVisualStores(engine: VisualScraperEngine) {
  const scrapeVisualProductGrid = engine.scrapeVisualProductGrid;
  const scrapePagedVisualProductGrid = engine.scrapePagedVisualProductGrid;

function dormisuenosUrlWithPage(pageNumber: number): string {
  const url = new URL(DORMISUENOS_SOURCE_URL);
  url.searchParams.set('product-page', String(pageNumber));
  return url.toString();
}

async function scrapeDormisuenosGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  const rowsByUrl = new Map<string, CsvProduct>();
  const maxPages = 4;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const pageUrl = dormisuenosUrlWithPage(pageNumber);
    const pageRows = await scrapeVisualProductGrid(page, scrapedAt, pageUrl, 'Dormisuenos Guatemala', 'Dormisuenos');

    if (pageRows.length === 0 && pageNumber > 1) {
      break;
    }

    for (const row of pageRows) {
      const key = row.product_url || row.product_name;
      if (!rowsByUrl.has(key)) {
        rowsByUrl.set(key, {
          ...row,
          source_url: DORMISUENOS_SOURCE_URL,
        });
      }
    }
  }

  const visualRows = Array.from(rowsByUrl.values());
  if (visualRows.length > 0) return visualRows;

  console.log('Dormisuenos Guatemala: la pagina visual vino vacia; probando API de WooCommerce...');
  try {
    const apiUrl = new URL('/wp-json/wc/store/v1/products', DORMISUENOS_SOURCE_URL);
    apiUrl.searchParams.set('per_page', '100');
    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; FACENCO-Catalog/1.0)',
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`API respondio HTTP ${response.status}`);
    }

    const products = await response.json() as Array<Record<string, any>>;
    const apiRows = products
      .filter((product) => Array.isArray(product.categories)
        && product.categories.some((category: Record<string, any>) => {
          const value = normalizeCatalogText(`${category.slug ?? ''} ${category.name ?? ''}`);
          return /(^|\s)camas?(\s|$)/.test(value);
        }))
      .map((product) => {
        const prices = product.prices ?? {};
        const minorUnit = Number(prices.currency_minor_unit ?? 2);
        const divisor = 10 ** (Number.isFinite(minorUnit) ? minorUnit : 2);
        const regularValue = Number(prices.regular_price ?? prices.price ?? 0) / divisor;
        const saleValue = Number(prices.sale_price ?? 0) / divisor;
        const formatApiPrice = (value: number): string => value > 0
          ? `Q${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : '';
        const name = cleanText(String(product.name ?? ''));
        const image = Array.isArray(product.images) ? product.images[0] ?? {} : {};
        const description = cleanText(String(product.short_description ?? product.description ?? '').replace(/<[^>]+>/g, ' '));

        return {
          source_site: 'Dormisuenos Guatemala',
          brand: cleanText(String(product.brands?.[0]?.name ?? 'Dormisuenos')),
          line: '',
          category: 'Camas',
          product_name: name,
          availability: product.is_in_stock === false ? 'Agotado' : 'Disponible',
          regular_price: formatApiPrice(regularValue),
          sale_price: saleValue > 0 && saleValue < regularValue ? formatApiPrice(saleValue) : '',
          discount: '',
          installment: '',
          product_url: cleanText(String(product.permalink ?? DORMISUENOS_SOURCE_URL)),
          source_url: DORMISUENOS_SOURCE_URL,
          headline: name,
          description,
          warranty: '',
          benefits: '',
          image_url: cleanText(String(image.src ?? '')),
          image_alt: cleanText(String(image.alt ?? name)),
          scraped_at: scrapedAt,
        } satisfies CsvProduct;
      })
      .filter((row) => row.product_name && (row.regular_price || row.sale_price));

    console.log(`Dormisuenos Guatemala API: ${apiRows.length} camas recuperadas.`);
    return apiRows;
  } catch (error) {
    console.log(`ADVERTENCIA: Dormisuenos Guatemala API no disponible: ${errorMessage(error)}`);
    return [];
  }
}

async function scrapeBodegangasGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  const rowsByKey = new Map<string, CsvProduct>();
  const maxPages = 5;
  let pageUrl = BODEGANGAS_SOURCE_URL;
  const visited = new Set<string>();

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    if (visited.has(pageUrl)) throw new Error('Bodegangas: paginación repetida; catálogo incompleto.');
    visited.add(pageUrl);
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
    const pageStatus = await page.evaluate(() => `${document.title} ${(document.body?.innerText ?? '').slice(0, 800)}`);
    if (/checking your browser|verify you are human|captcha|access denied/i.test(pageStatus)) {
      throw new Error(`Bodegangas: protección anti-bot en página ${pageNumber}; catálogo incompleto.`);
    }

    const rows = await page.evaluate(({ pageUrl, scrapedAt, cardSelector }) => {
      const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
      const absolute = (value: string) => {
        try { return new URL(value, pageUrl).toString(); } catch { return ''; }
      };
      return Array.from(document.querySelectorAll<HTMLElement>(cardSelector))
        .map((card): CsvProduct | null => {
          const productAnchor = card.querySelector<HTMLAnchorElement>('a[href*="/producto/"], a[href*="/product/"]');
          const image = card.querySelector<HTMLImageElement>('img');
          const title = clean(card.querySelector('.woocommerce-loop-product__title, .wd-entities-title, h1,h2,h3,h4,[class*="title"],[class*="name"]')?.textContent)
            || clean(productAnchor?.getAttribute('title'))
            || clean(image?.getAttribute('alt'));
          const productUrl = absolute(productAnchor?.getAttribute('href') ?? '');
          if (!title || !productUrl) return null;

          const text = clean(card.innerText);
          const amounts = (root: Element | null) => [...new Set(
            Array.from(root?.querySelectorAll('.woocommerce-Price-amount') ?? [])
              .flatMap(element => clean(element.textContent).match(/Q\s*[\d,]+(?:\.\d{2})?/gi) ?? [])
              .map(amount => amount.replace(/\s+/g, ''))
          )].slice(0, 2).join(' - ');
          const price = card.querySelector('.price');
          const struckPrice = amounts(price?.querySelector('del') ?? null);
          const salePrice = amounts(price?.querySelector('ins') ?? null);
          const listedPrice = amounts(price);
          const brandAnchor = card.querySelector<HTMLAnchorElement>('a[href*="/marcas/"]');
          const imageUrl = absolute(image?.currentSrc || image?.getAttribute('data-src') || image?.getAttribute('src') || '');
          return {
            source_site: 'Bodegangas Guatemala',
            brand: clean(brandAnchor?.textContent) || 'Bodegangas',
            line: '',
            category: 'Camas',
            product_name: title,
            availability: /agotado|out of stock/i.test(text) ? 'Agotado' : 'Listado en tienda online',
            regular_price: struckPrice || (salePrice ? '' : listedPrice),
            sale_price: salePrice,
            discount: clean(card.querySelector('.onsale,[class*="onsale"],[class*="badge"]')?.textContent),
            installment: '',
            product_url: productUrl,
            source_url: pageUrl,
            headline: title,
            description: '',
            warranty: '',
            benefits: '',
            image_url: imageUrl,
            image_alt: clean(image?.getAttribute('alt')),
            scraped_at: scrapedAt,
          };
        })
        .filter((row): row is CsvProduct => row !== null);
    }, { pageUrl, scrapedAt, cardSelector: BODEGANGAS_CARD_SELECTOR });

    for (const row of rows) {
      const key = row.product_url || `${row.product_name}|${row.regular_price}|${row.sale_price}`;
      if (!rowsByKey.has(key)) rowsByKey.set(key, row);
    }

    if (rows.length === 0) throw new Error(`Bodegangas: página ${pageNumber} sin tarjetas; revisar estructura o acceso.`);
    const nextHref = await page.locator('a.next.page-numbers').first().getAttribute('href').catch(() => null);
    if (!nextHref) return Array.from(rowsByKey.values());
    const nextUrl = new URL(nextHref, pageUrl);
    if (nextUrl.origin !== new URL(BODEGANGAS_SOURCE_URL).origin
      || !nextUrl.pathname.startsWith(new URL(BODEGANGAS_SOURCE_URL).pathname)) {
      throw new Error('Bodegangas: siguiente página fuera de la categoría autorizada.');
    }
    pageUrl = nextUrl.toString();
  }

  throw new Error('Bodegangas: límite de páginas alcanzado; catálogo incompleto.');
}

  return { dormisuenos: scrapeDormisuenosGt, bodegangas: scrapeBodegangasGt };
}
