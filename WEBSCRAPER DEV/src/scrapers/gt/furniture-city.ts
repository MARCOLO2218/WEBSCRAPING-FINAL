import type { Page } from 'playwright';
import type { CsvProduct } from '../../domain/product.js';
import type { ProductSelectorConfig } from '../types.js';

export const FURNITURE_CITY_SOURCE_URL = 'https://www.furniturecity.com.gt/product-category/Descanso/';

export type FurnitureCityDependencies = {
  navigate: (page: Page, url: string) => Promise<void>;
  extractCards: (page: Page, sourceUrl: string, config: ProductSelectorConfig) => Promise<CsvProduct[]>;
};

export function createFurnitureCityGuatemalaScraper(dependencies: FurnitureCityDependencies) {
  const goto = dependencies.navigate;
  const extractCardProducts = dependencies.extractCards;

async function scrapeFurnitureCity(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  await goto(page, FURNITURE_CITY_SOURCE_URL);
  const rows = await extractCardProducts(page, FURNITURE_CITY_SOURCE_URL, {
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

  return rows.map((row) => ({ ...row, scraped_at: scrapedAt }));
}

  return scrapeFurnitureCity;
}
