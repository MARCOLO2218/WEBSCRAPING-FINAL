import type { Page } from 'playwright';
import type { CsvProduct } from '../domain/product.js';

export type StoreScraper = {
  name: string;
  run: (page: Page) => Promise<CsvProduct[]>;
};

export type TimestampedStoreScraper = (page: Page, scrapedAt: string) => Promise<CsvProduct[]>;

export type ProductSelectorConfig = {
  sourceSite: string;
  brand: string;
  cardSelector: string;
  titleSelector: string;
  categorySelector?: string;
  lineSelector?: string;
  anchorSelector?: string;
  imageSelector?: string;
  regularPriceSelector?: string;
  salePriceSelector?: string;
  priceSelector?: string;
  discountSelector?: string;
  installmentSelector?: string;
  currencyCode?: 'GTQ' | 'NIO';
};
