import type { Page } from 'playwright';
import { normalizeProductText as normalizeCatalogText, type CsvProduct } from '../../domain/product.js';
import type { ProductSelectorConfig } from '../types.js';

export const SLEEP_GALLERY_SOURCE_URL = 'https://sleepgalleryca.com/gt/';
export const MATTRESS_SOURCE_URL = 'https://mattress.com.gt/';
export const SERTA_GT_SOURCE_URL = 'https://sertacentroamerica.com/guatemala/catalogo/';

export type CardStoreDependencies = {
  navigate: (page: Page, url: string) => Promise<void>;
  extractCards: (page: Page, sourceUrl: string, config: ProductSelectorConfig) => Promise<CsvProduct[]>;
  filterGuatemalaRows: (rows: CsvProduct[], sourceSite?: string) => CsvProduct[];
};

export function createGuatemalaCardStores(dependencies: CardStoreDependencies) {
  const goto = dependencies.navigate;
  const extractCardProducts = dependencies.extractCards;
  const filterGuatemalaQuetzalRows = dependencies.filterGuatemalaRows;

async function scrapeSleepGallery(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  await goto(page, SLEEP_GALLERY_SOURCE_URL);
  const rows = await extractCardProducts(page, SLEEP_GALLERY_SOURCE_URL, {
    sourceSite: 'Sleep Gallery Guatemala',
    brand: 'Sleep Gallery',
    cardSelector: 'article.sg-card',
    titleSelector: '.sg-card-title',
    categorySelector: '.sg-card-cat',
    lineSelector: '.sg-badge-comfort',
    anchorSelector: 'a.sg-card-btn, a.sg-card-img-wrap, a[href]',
    imageSelector: 'img.vtex-product-summary-2-x-image, img',
    regularPriceSelector: '.sg-price-old',
    salePriceSelector: '.sg-price-new',
    priceSelector: '.sg-card-price',
    discountSelector: '.sg-badge',
  });

  return rows.map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
}

const SERTA_GT_CATALOG_SECTIONS = [
  { line: 'Catálogo', url: SERTA_GT_SOURCE_URL },
  { line: 'Isupport', url: 'https://sertacentroamerica.com/guatemala/categoria-producto/isupport/' },
  { line: 'Perfect Sleeper', url: 'https://sertacentroamerica.com/guatemala/categoria-producto/perfect-sleeper/' },
  { line: 'Perfect Comfort', url: 'https://sertacentroamerica.com/guatemala/categoria-producto/perfect-comfort/' },
  { line: 'Smart Comfort', url: 'https://sertacentroamerica.com/guatemala/categoria-producto/smart-comfort/' },
  { line: 'Perfect Start - Cuna', url: 'https://sertacentroamerica.com/guatemala/producto/perfect-start-colchon-de-cuna/' },
  { line: 'Toppers para Colchón', url: 'https://sertacentroamerica.com/guatemala/toppers-para-colchon/' },
];

async function scrapeSertaGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  const rowsByKey = new Map<string, CsvProduct>();
  const allowedProductPattern = /(colch[oó]n|colchon|cama|base|canap[eé]|camastr[oó]n|cuna|topper)/i;

  for (const section of SERTA_GT_CATALOG_SECTIONS) {
    await goto(page, section.url);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);

    const rows = await extractCardProducts(page, section.url, {
      sourceSite: 'Serta Guatemala',
      brand: 'Serta',
      cardSelector: 'li.product, .products .product, .type-product',
      titleSelector: '.woocommerce-loop-product__title, .product_title, h1.product_title, h2',
      anchorSelector: 'a.woocommerce-LoopProduct-link, a[href*="/guatemala/producto/"]',
      imageSelector: 'img.attachment-woocommerce_thumbnail, .woocommerce-product-gallery img, img',
      regularPriceSelector: '.price del, del .woocommerce-Price-amount, del',
      salePriceSelector: '.price ins, ins .woocommerce-Price-amount, ins',
      priceSelector: '.price, .woocommerce-Price-amount',
      discountSelector: '.onsale',
    });

    for (const row of rows) {
      if (!allowedProductPattern.test(row.product_name)) {
        continue;
      }

      const productUrl = row.product_url || section.url;
      const key = normalizeCatalogText(productUrl || row.product_name);
      const existing = rowsByKey.get(key);
      const candidate: CsvProduct = {
        ...row,
        line: section.line === 'Catálogo' ? row.line : section.line,
        category: /cuna/i.test(row.product_name)
          ? 'Colchones de cuna'
          : /topper/i.test(row.product_name)
            ? 'Toppers para colchón'
            : 'Colchones y camas',
        source_url: SERTA_GT_SOURCE_URL,
        scraped_at: scrapedAt,
      };

      if (!existing) {
        rowsByKey.set(key, candidate);
      } else if (existing.line === '' || existing.line === 'Catálogo') {
        rowsByKey.set(key, {
          ...existing,
          line: candidate.line || existing.line,
          category: candidate.category || existing.category,
          regular_price: candidate.regular_price || existing.regular_price,
          sale_price: candidate.sale_price || existing.sale_price,
          discount: candidate.discount || existing.discount,
          image_url: candidate.image_url || existing.image_url,
          image_alt: candidate.image_alt || existing.image_alt,
        });
      }
    }
  }

  const rows = Array.from(rowsByKey.values());
  console.log(`Serta Guatemala: ${rows.length} productos unicos encontrados en las lineas de camas.`);
  return filterGuatemalaQuetzalRows(rows, 'Serta Guatemala');
}

async function scrapeMattress(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  await goto(page, MATTRESS_SOURCE_URL);
  const rows = await extractCardProducts(page, MATTRESS_SOURCE_URL, {
    sourceSite: 'Mattress Guatemala',
    brand: 'Mattress',
    cardSelector: 'li.product',
    titleSelector: '.woocommerce-loop-product__title',
    categorySelector: '.product-category, .posted_in',
    anchorSelector: 'a.woocommerce-LoopProduct-link, a[href]',
    imageSelector: 'img.vtex-product-summary-2-x-image, img',
    regularPriceSelector: 'del .woocommerce-Price-amount, del',
    salePriceSelector: 'ins .woocommerce-Price-amount, ins',
    priceSelector: '.price',
    discountSelector: '.onsale, .nm-shop-loop-product-title-action',
  });

  return rows.map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
}

  return { sleepGallery: scrapeSleepGallery, serta: scrapeSertaGt, mattress: scrapeMattress };
}
