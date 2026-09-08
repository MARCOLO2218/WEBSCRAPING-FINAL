import type { Page } from 'playwright';
import { cleanProductText as cleanText, type CsvProduct } from '../../domain/product.js';
import type { ProductSelectorConfig } from '../types.js';

export const FURNITURE_CITY_SOURCE_URL = 'https://www.furniturecity.com.gt/mattress-colchones/';

export type FurnitureCityDependencies = {
  navigate: (page: Page, url: string) => Promise<void>;
  extractCards: (page: Page, sourceUrl: string, config: ProductSelectorConfig) => Promise<CsvProduct[]>;
};

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function createFurnitureCityGuatemalaScraper(dependencies: FurnitureCityDependencies) {
  const goto = dependencies.navigate;
  const extractCardProducts = dependencies.extractCards;

async function extractFurnitureCityCatalogUrls(page: Page): Promise<string[]> {
  return page.evaluate((sourceUrl) => {
    const absolute = (url: string) => {
      try {
        return new URL(url, sourceUrl).toString();
      } catch {
        return '';
      }
    };

    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .map((anchor) => absolute(anchor.getAttribute('href') ?? ''))
      .filter((url) => /\/product-category\/.*colchones/i.test(url) || /\/producto\//i.test(url));
  }, FURNITURE_CITY_SOURCE_URL);
}

async function scrapeFurnitureCity(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  await goto(page, FURNITURE_CITY_SOURCE_URL);
  const catalogUrls = uniqueValues([
    FURNITURE_CITY_SOURCE_URL,
    ...await extractFurnitureCityCatalogUrls(page),
  ]);
  const rowsByUrl = new Map<string, CsvProduct>();

  for (const catalogUrl of catalogUrls) {
    if (/\/producto\//i.test(catalogUrl)) {
      rowsByUrl.set(catalogUrl, {
        source_site: 'Furniture City Guatemala',
        brand: 'Furniture City',
        line: '',
        category: 'Colchones',
        product_name: cleanText(catalogUrl.split('/').filter(Boolean).pop()?.replace(/-/g, ' ')),
        availability: 'Listado en tienda online',
        regular_price: '',
        sale_price: '',
        discount: '',
        installment: '',
        product_url: catalogUrl,
        source_url: FURNITURE_CITY_SOURCE_URL,
        headline: '',
        description: '',
        warranty: '',
        benefits: '',
        image_url: '',
        image_alt: '',
        scraped_at: scrapedAt,
      });
      continue;
    }

    await goto(page, catalogUrl);
    const rows = await extractCardProducts(page, catalogUrl, {
      sourceSite: 'Furniture City Guatemala',
      brand: 'Furniture City',
      cardSelector: '.product-small.col.has-hover, li.product',
      titleSelector: '.woocommerce-loop-product__title, .product-title',
      categorySelector: '.product-cat',
      anchorSelector: '.woocommerce-LoopProduct-link, a[href]',
      imageSelector: 'img.vtex-product-summary-2-x-image, img',
      regularPriceSelector: 'del .woocommerce-Price-amount, del',
      salePriceSelector: 'ins .woocommerce-Price-amount, ins',
      priceSelector: '.price',
      discountSelector: '.onsale',
    });

    for (const row of rows) {
      rowsByUrl.set(row.product_url, {
        ...row,
        scraped_at: scrapedAt,
      });
    }
  }

  return Array.from(rowsByUrl.values());
}

  return scrapeFurnitureCity;
}
