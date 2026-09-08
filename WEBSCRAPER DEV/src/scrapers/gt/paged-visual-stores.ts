import type { Page } from 'playwright';
import { cleanProductText as cleanText, normalizeProductText as normalizeCatalogText, type CsvProduct } from '../../domain/product.js';
import type { VisualScraperEngine } from '../shared/visual-engine.js';

export const DORMISUENOS_SOURCE_URL = 'https://tiendasdormisuenos.com/categoria-producto/camas/?product-page=1';
export const BODEGANGAS_SOURCE_URL = 'https://bodegangasgts.com/?product_cat=0&s=camas&et_search=true&post_type=product';

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
  const urls = [
    BODEGANGAS_SOURCE_URL,
    'https://bodegangasgts.com/?product_cat=camas&s=camas&et_search=true&post_type=product',
    'https://bodegangasgts.com/product-category/camas/'
  ];
  const rowsByKey = new Map<string, CsvProduct>();

  for (const url of urls) {
    const rows = await scrapePagedVisualProductGrid(page, scrapedAt, url, 'Bodegangas Guatemala', 'Bodegangas', 5);
    for (const row of rows) {
      const key = row.product_url || `${row.product_name}|${row.regular_price}|${row.sale_price}`;
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          ...row,
          source_url: BODEGANGAS_SOURCE_URL,
        });
      }
    }

    if (rowsByKey.size >= 20) {
      break;
    }
  }

  return Array.from(rowsByKey.values());
}

  return { dormisuenos: scrapeDormisuenosGt, bodegangas: scrapeBodegangasGt };
}
