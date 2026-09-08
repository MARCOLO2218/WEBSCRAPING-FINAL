import type { Page } from 'playwright';
import { cleanProductText as cleanText, normalizeProductText as normalizeCatalogText, type CsvProduct } from '../../domain/product.js';

export const WALMART_GT_SOURCE_URL = 'https://www.walmart.com.gt/cama?_q=cama&fuzzy=0&initialMap=accesscontrollist,ft&initialQuery=walmartgtwm4414/cama&map=brand,brand,brand,brand,brand,brand,brand,brand,brand,brand,ft&operator=and&page=1&query=/belezza/camas-florida/facenco/indufoam/kangaroo/lucca/olympia/sealy/sienna/simmons/cama&searchState';

export type WalmartScraperDependencies = {
  filterGuatemalaRows: (rows: CsvProduct[], sourceSite?: string) => CsvProduct[];
};

export function createWalmartGuatemalaScraper(dependencies: WalmartScraperDependencies) {
  const filterGuatemalaQuetzalRows = dependencies.filterGuatemalaRows;

async function scrapeWalmartGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  const rowsByUrl = new Map<string, CsvProduct>();
  const pageSize = 50;
  const maxProductsPerSearch = 300;
  const searchTerms = ['cama', 'colchon', 'almohada', 'base cama', 'protector cama'];

  const formatQ = (value: unknown): string => {
    const numberValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numberValue) || numberValue <= 0) return '';
    return 'Q ' + numberValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const categoryFromName = (name: string): string => {
    const lower = normalizeCatalogText(name);
    if (lower.includes('almohada')) return 'Almohadas';
    if (lower.includes('protector') || lower.includes('cobertor') || lower.includes('sabana') || lower.includes('funda')) return 'Complementos de cama';
    if (lower.includes('base') || lower.includes('cabecera') || lower.includes('cama')) return 'Camas y bases';
    if (lower.includes('colchon')) return 'Colchones';
    return 'Camas y colchones';
  };

  for (const term of searchTerms) {
    for (let from = 0; from < maxProductsPerSearch; from += pageSize) {
      const to = from + pageSize - 1;
      const apiUrl = 'https://www.walmart.com.gt/api/catalog_system/pub/products/search/' + encodeURIComponent(term) + '?_from=' + from + '&_to=' + to;
      console.log('Walmart Guatemala API: leyendo "' + term + '" productos ' + from + '-' + to + '...');

      const response = await page.goto(apiUrl, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
      if (!response || !response.ok()) {
        console.log('Walmart Guatemala API: respuesta no disponible para "' + term + '" rango ' + from + '-' + to);
        break;
      }

      const raw = await page.locator('body').innerText({ timeout: 15000 }).catch(() => '');
      let products: any[] = [];
      try {
        const parsed = JSON.parse(raw);
        products = Array.isArray(parsed) ? parsed : [];
      } catch {
        products = [];
      }

      if (products.length === 0) {
        console.log('Walmart Guatemala API: sin productos para "' + term + '" rango ' + from + '-' + to);
        break;
      }

      for (const product of products) {
        const item = Array.isArray(product.items) ? product.items[0] : undefined;
        const sellers = Array.isArray(item?.sellers) ? item.sellers : [];
        const seller = sellers.find((entry: any) => entry?.commertialOffer?.Price) || sellers[0];
        const offer = seller?.commertialOffer || {};
        const price = Number(offer.Price || 0);
        const listPrice = Number(offer.ListPrice || 0);
        const productName = cleanText(product.productName || product.productTitle || product.productReference || item?.nameComplete || item?.name);
        if (!productName) continue;

        const productUrl = product.link || (product.linkText ? 'https://www.walmart.com.gt/' + product.linkText + '/p' : WALMART_GT_SOURCE_URL);
        const image = Array.isArray(item?.images) && item.images[0] ? item.images[0] : {};
        const salePrice = formatQ(price);
        const regularPrice = listPrice && listPrice !== price ? formatQ(listPrice) : salePrice;
        const availability = Number(offer.AvailableQuantity || 0) > 0 ? 'Disponible' : 'Listado en tienda online';

        rowsByUrl.set(productUrl, {
          source_site: 'Walmart Guatemala',
          brand: cleanText(product.brand || 'Walmart'),
          line: term,
          category: categoryFromName(productName),
          product_name: productName,
          availability,
          regular_price: regularPrice,
          sale_price: salePrice,
          discount: '',
          installment: '',
          product_url: productUrl,
          source_url: WALMART_GT_SOURCE_URL,
          headline: productName,
          description: cleanText(product.description || product.metaTagDescription),
          warranty: '',
          benefits: '',
          image_url: cleanText(image.imageUrl),
          image_alt: cleanText(image.imageText || productName),
          scraped_at: scrapedAt,
        });
      }

      if (products.length < pageSize) break;
    }
  }

  const rows = Array.from(rowsByUrl.values());
  console.log('Walmart Guatemala API: encontrados antes de filtro=' + rows.length);
  return filterGuatemalaQuetzalRows(rows, 'Walmart Guatemala');
}

  return scrapeWalmartGt;
}
