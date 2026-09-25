import type { Page } from 'playwright';
import { cleanProductText, normalizeProductText, type CsvProduct } from '../../domain/product.js';

const host = 'www.walmart.com.ni';

export const WALMART_NC = {
  key: 'walmart-nc',
  name: 'Walmart Nicaragua',
  country: 'NC',
  currency: 'NIO',
  operational: false,
  expected: { accesorios: 109, colchonesFiltrados: 17, colchonesAmpliados: 18 },
  sources: {
    accesorios: `https://${host}/camas?_q=camas&fuzzy=0&initialMap=accesscontrollist,ft&initialQuery=walmartniwm774/camas&map=category-1,category-2,category-3,brand,brand,brand,brand,brand,brand,ft&operator=and&query=/articulos-para-el-hogar/colchones-y-blancos/protectores-y-sabanas/american-dream/disney-minnie/hotel-style/mainstays/mainstays-kids/we-bare-bears/camas&searchState`,
    colchonesFiltrados: `https://${host}/camas?_q=camas&fuzzy=0&initialMap=accesscontrollist,ft&initialQuery=walmartniwm774/camas&map=category-1,category-2,category-3,brand,brand,brand,brand,brand,brand,brand,brand,brand,ft&operator=and&query=/articulos-para-el-hogar/colchones-y-blancos/colchones/american-dream/disney-minnie/hotel-style/king-koil/mainstays/mainstays-kids/masterbed/olympia/we-bare-bears/camas&searchState`,
    colchonesAmpliados: `https://${host}/camas?_q=camas&fuzzy=0&initialMap=accesscontrollist,ft&initialQuery=walmartniwm774/camas&map=category-1,category-3,brand,brand,brand,ft&operator=and&query=/articulos-para-el-hogar/colchones/king-koil/masterbed/olympia/camas&searchState`,
  },
  controlProductUrl: `https://${host}/mb-cama-tamano-imperial-orthopremier-2p/p`,
} as const;

export type WalmartNcSource = keyof typeof WALMART_NC.sources;

export function isWalmartNcUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host
      && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

export function parseWalmartNcPrice(value: string | null | undefined): number | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  const match = text.match(/^C\$\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)$/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function canonicalWalmartNcProductUrl(value: string): string {
  if (!isWalmartNcUrl(value)) throw new Error('Producto fuera de Walmart Nicaragua.');
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  if (!url.pathname.endsWith('/p')) throw new Error('URL de producto Walmart Nicaragua no canónica.');
  return url.toString();
}

export function dedupeWalmartNcProductUrls(values: readonly string[]): string[] {
  return [...new Set(values.map(canonicalWalmartNcProductUrl))].sort();
}

export function walmartNcApiUrl(term: string, from: number, pageSize = 50): string {
  const query = term.trim().toLowerCase();
  if (!query || !Number.isSafeInteger(from) || from < 0
    || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new Error('Rango de API Walmart Nicaragua inválido.');
  }
  return `https://${host}/api/catalog_system/pub/products/search/${encodeURIComponent(query)}`
    + `?_from=${from}&_to=${from + pageSize - 1}`;
}

export type WalmartNcScraperOptions = {
  pageSize?: number;
  maxProductsPerSearch?: number;
  searchTerms?: readonly string[];
};

function formatNio(value: unknown): string {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return `C$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function walmartNcCategory(name: string, categories: unknown): string | null {
  const normalized = normalizeProductText(name);
  if (/limpia\s*colchon|camara|mascota|perro|gato|vibrant life|sofa\s*cama|camarote|litera/.test(normalized)) return null;
  const categoryText = Array.isArray(categories)
    ? normalizeProductText(categories.map((value) => String(value)).join(' '))
    : '';
  if (categoryText && !/colchones y blancos|\/colchones\/|protectores y sabanas/.test(categoryText)) return null;
  if (/sabana|funda|protector|cubrecama|almohada/.test(normalized)) return 'Accesorios de cama';
  if (/colchon|cama|box|base/.test(normalized)) return 'Camas y colchones';
  return null;
}

export function createWalmartNicaraguaScraper(options: WalmartNcScraperOptions = {}) {
  const pageSize = options.pageSize ?? 50;
  const maxProductsPerSearch = options.maxProductsPerSearch ?? 300;
  const searchTerms = options.searchTerms ?? ['cama', 'colchon', 'protector cama', 'sabana'];
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50
    || !Number.isSafeInteger(maxProductsPerSearch) || maxProductsPerSearch < pageSize) {
    throw new Error('Límites de Walmart Nicaragua inválidos.');
  }

  return async function scrapeWalmartNc(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
    const rows = new Map<string, CsvProduct>();
    for (const term of searchTerms) {
      for (let from = 0; from < maxProductsPerSearch; from += pageSize) {
        const response = await page.goto(walmartNcApiUrl(term, from, pageSize), {
          waitUntil: 'domcontentloaded', timeout: 45_000,
        }).catch(() => null);
        if (!response || !response.ok()) break;
        const raw = await page.locator('body').innerText({ timeout: 15_000 }).catch(() => '');
        let products: any[] = [];
        try {
          const parsed = JSON.parse(raw);
          products = Array.isArray(parsed) ? parsed : [];
        } catch {
          products = [];
        }
        if (!products.length) break;

        for (const product of products) {
          const item = Array.isArray(product.items) ? product.items[0] : undefined;
          const sellers = Array.isArray(item?.sellers) ? item.sellers : [];
          const seller = sellers.find((entry: any) => Number(entry?.commertialOffer?.Price) > 0) || sellers[0];
          const offer = seller?.commertialOffer || {};
          const name = cleanProductText(product.productName || product.productTitle || item?.nameComplete || item?.name);
          const category = walmartNcCategory(name, product.categories);
          if (!name || !category) continue;
          const candidateUrl = product.link
            || (product.linkText ? `https://${host}/${String(product.linkText).replace(/^\/+/, '')}/p` : '');
          let productUrl: string;
          try {
            productUrl = canonicalWalmartNcProductUrl(candidateUrl);
          } catch {
            continue;
          }
          const image = Array.isArray(item?.images) ? item.images[0] : undefined;
          const price = Number(offer.Price || 0);
          const listPrice = Number(offer.ListPrice || 0);
          const salePrice = formatNio(price);
          const regularPrice = formatNio(listPrice > 0 ? listPrice : price);
          rows.set(productUrl, {
            source_site: WALMART_NC.name,
            brand: cleanProductText(product.brand || 'Walmart'),
            line: term,
            category,
            product_name: name,
            availability: Number(offer.AvailableQuantity || 0) > 0 ? 'Disponible' : 'Listado en tienda online',
            regular_price: regularPrice,
            sale_price: salePrice,
            discount: listPrice > price && price > 0 ? `${Math.round((1 - price / listPrice) * 100)}%` : '',
            installment: '',
            product_url: productUrl,
            source_url: WALMART_NC.sources.colchonesAmpliados,
            headline: name,
            description: cleanProductText(product.description || product.metaTagDescription),
            warranty: '',
            benefits: '',
            image_url: cleanProductText(image?.imageUrl),
            image_alt: cleanProductText(image?.imageText || name),
            scraped_at: scrapedAt,
          });
        }
        if (products.length < pageSize) break;
      }
    }
    return [...rows.values()];
  };
}
