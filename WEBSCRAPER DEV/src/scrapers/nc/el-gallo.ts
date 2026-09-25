import type { Page } from 'playwright';
import type { CsvProduct } from '../../domain/product.js';
import type { ProductSelectorConfig } from '../types.js';

const host = 'www.elgallomasgallo.com.ni';

export const EL_GALLO_NC = {
  key: 'el-gallo-nc',
  name: 'El Gallo mas Gallo Nicaragua',
  country: 'NC',
  currency: 'NIO',
  operational: false,
  expected: { camas: 43, colchones: 42 },
  pageLimits: { camas: 5, colchones: 5 },
  sources: {
    camas: `https://${host}/catalogsearch/result/?q=camas&tipo_de_producto=Matrimonial~Queen~Individual~King&marca=Capri~Olympia~Facenco~Indufoam~Armon%C3%ADa~Therapedic`,
    colchones: `https://${host}/catalogsearch/result/?q=colchon&tipo_de_producto=Matrimonial~Queen~Individual~King&marca=Capri~Olympia~Facenco~Indufoam~Armon%C3%ADa~Therapedic`,
  },
} as const;

export type ElGalloNcSource = keyof typeof EL_GALLO_NC.sources;

export function isElGalloNcUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host
      && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

export function elGalloNcPageUrl(source: ElGalloNcSource, page: number): string {
  if (!Number.isSafeInteger(page) || page < 1 || page > 25) {
    throw new Error('Pagina de El Gallo Nicaragua fuera de rango.');
  }
  const url = new URL(EL_GALLO_NC.sources[source]);
  if (page > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

export function parseElGalloNcPrice(value: string | null | undefined): number | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  const match = text.match(/^C\$\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)$/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function canonicalElGalloNcProductUrl(value: string): string {
  if (!isElGalloNcUrl(value)) throw new Error('Producto fuera de El Gallo Nicaragua.');
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  url.pathname = url.pathname.split('/').map((segment) => {
    if (segment.length % 2 === 0) {
      const midpoint = segment.length / 2;
      if (segment.slice(0, midpoint) === segment.slice(midpoint)) return segment.slice(0, midpoint);
    }
    return segment;
  }).join('/');
  if (url.pathname === '/' || url.pathname.startsWith('/catalogsearch/')) {
    throw new Error('La URL no identifica un producto de El Gallo Nicaragua.');
  }
  return url.toString();
}

export function dedupeElGalloNcProductUrls(values: readonly string[]): string[] {
  return [...new Set(values.map(canonicalElGalloNcProductUrl))].sort();
}

export type ElGalloNcScraperDependencies = {
  navigate: (page: Page, url: string) => Promise<void>;
  extractCards: (page: Page, sourceUrl: string, config: ProductSelectorConfig) => Promise<CsvProduct[]>;
  onPageResult?: (source: ElGalloNcSource, page: number, count: number) => void;
};

const selectors: ProductSelectorConfig = {
  sourceSite: EL_GALLO_NC.name,
  brand: 'El Gallo mas Gallo',
  currencyCode: 'NIO',
  cardSelector: '.result-wrapper, .product-item, .item.product, [class*="product-item"]',
  titleSelector: '.result-title, .product-item-name, .product.name a, [class*="product-item-link"]',
  anchorSelector: 'a.result-thumbnail, a.result-link, a.product-item-link, .product-item-name a, a.product.photo, a[href]',
  imageSelector: '.result-thumbnail img, .product-image-photo, img.product-image-photo, img',
  regularPriceSelector: '.before_special, .old-price .price, [data-price-type="oldPrice"] .price',
  salePriceSelector: '.after_special, .special-price .price, [data-price-type="finalPrice"] .price, .price-final_price .price',
  discountSelector: '[class*="discount"], [class*="porcentaje"]',
  installmentSelector: '[class*="installment"], [class*="cuota"]',
};

export function createElGalloNicaraguaScraper(dependencies: ElGalloNcScraperDependencies) {
  return async function scrapeElGalloNc(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
    const rows = new Map<string, CsvProduct>();
    for (const source of Object.keys(EL_GALLO_NC.sources) as ElGalloNcSource[]) {
      for (let pageNumber = 1; pageNumber <= EL_GALLO_NC.pageLimits[source]; pageNumber += 1) {
        const pageUrl = elGalloNcPageUrl(source, pageNumber);
        await dependencies.navigate(page, pageUrl);
        const extracted = await dependencies.extractCards(page, pageUrl, selectors);
        dependencies.onPageResult?.(source, pageNumber, extracted.length);
        let accepted = 0;
        for (const row of extracted) {
          let productUrl: string;
          try {
            productUrl = canonicalElGalloNcProductUrl(row.product_url);
          } catch {
            continue;
          }
          const prices = [row.regular_price, row.sale_price].filter(Boolean);
          if (prices.some((price) => parseElGalloNcPrice(price) === null)) continue;
          rows.set(productUrl, {
            ...row,
            source_site: EL_GALLO_NC.name,
            product_url: productUrl,
            source_url: pageUrl,
            scraped_at: scrapedAt,
          });
          accepted += 1;
        }
        if (pageNumber > 1 && accepted === 0) break;
      }
    }
    return [...rows.values()];
  };
}
