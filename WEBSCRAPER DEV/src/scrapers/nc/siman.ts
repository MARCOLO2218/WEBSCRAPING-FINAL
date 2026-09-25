import type { Page } from 'playwright';
import type { CsvProduct } from '../../domain/product.js';
import type { ProductSelectorConfig } from '../types.js';

const host = 'ni.siman.com';
const camasRefinement = 'W3siYXR0cmlidXRlIjoicXVlcnkiLCJyZWZpbmVtZW50cyI6W3siYXR0cmlidXRlIjoicXVlcnkiLCJ2YWx1ZSI6ImNhbWFzIn1dfV0';
const colchonesRefinement = 'W3siYXR0cmlidXRlIjoicXVlcnkiLCJyZWZpbmVtZW50cyI6W3siYXR0cmlidXRlIjoicXVlcnkiLCJ2YWx1ZSI6ImNvbGNob25lcyJ9XX1d';

export const SIMAN_NC = {
  key: 'siman-nc',
  name: 'Siman Nicaragua',
  country: 'NC',
  currency: 'NIO',
  operational: false,
  expected: { camas: 94, colchones: 32 },
  pageLimits: { camas: 5, colchones: 2 },
  sources: {
    camas: `https://${host}/search?_q=camas&refinements=${camasRefinement}`,
    colchones: `https://${host}/search?_q=colchones&refinements=${colchonesRefinement}`,
  },
} as const;

export type SimanNcSource = keyof typeof SIMAN_NC.sources;

export function isSimanNcUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host
      && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

export function simanNcPageUrl(source: SimanNcSource, page: number): string {
  const maxPage = SIMAN_NC.pageLimits[source];
  if (!Number.isSafeInteger(page) || page < 1 || page > maxPage) {
    throw new Error(`Pagina de Siman Nicaragua fuera de rango para ${source}.`);
  }
  const url = new URL(SIMAN_NC.sources[source]);
  if (page > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

export function parseSimanNcPrice(value: string | null | undefined): number | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  const match = text.match(/^C\$\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)$/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function canonicalSimanNcProductUrl(value: string): string {
  if (!isSimanNcUrl(value)) throw new Error('Producto fuera de Siman Nicaragua.');
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  if (url.pathname === '/' || url.pathname === '/search') {
    throw new Error('La URL no identifica un producto de Siman Nicaragua.');
  }
  return url.toString();
}

export function dedupeSimanNcProductUrls(values: readonly string[]): string[] {
  return [...new Set(values.map(canonicalSimanNcProductUrl))].sort();
}

function isRelevantSimanNcProduct(name: string): boolean {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\bcuna\b|mini cama|mascota|perro|gato/.test(normalized)) return false;
  return /cama|colchon|protector|cubrecama|sabana|almohada|base|box/.test(normalized);
}

export type SimanNcScraperDependencies = {
  navigate: (page: Page, url: string) => Promise<void>;
  extractCards: (page: Page, sourceUrl: string, config: ProductSelectorConfig) => Promise<CsvProduct[]>;
  onPageResult?: (source: SimanNcSource, page: number, stats: SimanNcPageStats) => void;
};

export type SimanNcPageStats = {
  extracted: number;
  irrelevant: number;
  invalidUrl: number;
  invalidPrice: number;
  duplicates: number;
  accepted: number;
};

const selectors: ProductSelectorConfig = {
  sourceSite: SIMAN_NC.name,
  brand: 'Siman',
  currencyCode: 'NIO',
  cardSelector: '.siman-algolia-react-4-x-hitItem, .vtex-search-result-3-x-galleryItem, [class*="galleryItem"]',
  titleSelector: '.siman-algolia-react-4-x-searchProductsItemName, [class*="productName"], [class*="productBrand"]',
  anchorSelector: '.siman-algolia-react-4-x-hitLinkItem, a.vtex-product-summary-2-x-clearLink, a[href]',
  imageSelector: '.siman-algolia-react-4-x-product-image-container img, img.vtex-product-summary-2-x-image, img',
  regularPriceSelector: '.siman-algolia-react-4-x-productListPrice, [class*="listPrice"], [class*="ListPrice"]',
  salePriceSelector: '.siman-algolia-react-4-x-productSellingPriceDiscount, .siman-algolia-react-4-x-productSellingPrice, [class*="sellingPrice"], [class*="SellingPrice"]',
  discountSelector: '[class*="discount"], [class*="Discount"]',
  installmentSelector: '[class*="installment"], [class*="Installment"]',
};

export function createSimanNicaraguaScraper(dependencies: SimanNcScraperDependencies) {
  return async function scrapeSimanNc(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
    const rows = new Map<string, CsvProduct>();
    for (const source of Object.keys(SIMAN_NC.sources) as SimanNcSource[]) {
      for (let pageNumber = 1; pageNumber <= SIMAN_NC.pageLimits[source]; pageNumber += 1) {
        const pageUrl = simanNcPageUrl(source, pageNumber);
        await dependencies.navigate(page, pageUrl);
        for (let scroll = 0; scroll < 8; scroll += 1) {
          await page.mouse.wheel(0, 1400);
          await page.waitForTimeout(500);
        }
        const extracted = await dependencies.extractCards(page, pageUrl, selectors);
        const stats: SimanNcPageStats = {
          extracted: extracted.length,
          irrelevant: 0,
          invalidUrl: 0,
          invalidPrice: 0,
          duplicates: 0,
          accepted: 0,
        };
        for (const row of extracted) {
          if (!isRelevantSimanNcProduct(row.product_name)) {
            stats.irrelevant += 1;
            continue;
          }
          let productUrl: string;
          try {
            productUrl = canonicalSimanNcProductUrl(row.product_url);
          } catch {
            stats.invalidUrl += 1;
            continue;
          }
          const prices = [row.regular_price, row.sale_price].filter(Boolean);
          if (prices.some((price) => parseSimanNcPrice(price) === null)) {
            stats.invalidPrice += 1;
            continue;
          }
          if (rows.has(productUrl)) stats.duplicates += 1;
          rows.set(productUrl, {
            ...row,
            source_site: SIMAN_NC.name,
            product_url: productUrl,
            source_url: pageUrl,
            scraped_at: scrapedAt,
          });
          stats.accepted += 1;
        }
        dependencies.onPageResult?.(source, pageNumber, stats);
        if (pageNumber > 1 && stats.accepted === 0) break;
      }
    }
    return [...rows.values()];
  };
}
