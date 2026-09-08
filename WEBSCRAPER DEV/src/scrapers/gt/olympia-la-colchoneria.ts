import type { Page } from 'playwright';
import type { CsvProduct } from '../../domain/product.js';

export const OLYMPIA_SOURCE_URL = 'https://camasolympiaonline.com/gt/';
export const LA_COLCHONERIA_SOURCE_URL = 'https://lacolchoneria.com.gt/';

export type OlympiaLaColchoneriaDependencies = {
  navigate: (page: Page, url: string) => Promise<void>;
};

export function createOlympiaLaColchoneriaGuatemalaScrapers(
  dependencies: OlympiaLaColchoneriaDependencies,
) {
  const goto = dependencies.navigate;

async function extractOlympiaProducts(page: Page): Promise<CsvProduct[]> {
  return page.evaluate((sourceUrl) => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const absolute = (url: string) => {
      try {
        return new URL(url, sourceUrl).toString();
      } catch {
        return url;
      }
    };

    return Array.from(document.querySelectorAll<HTMLElement>('.ol-products-grid article.ol-card'))
      .map((card) => {
        const title = clean(card.querySelector('.ol-card-title')?.textContent);
        const category = clean(card.querySelector('.ol-card-cat')?.textContent);
        const discount = clean(card.querySelector('.ol-badge')?.textContent);
        const regularPrice = clean(card.querySelector('.ol-price-old')?.textContent);
        const salePrice = clean(card.querySelector('.ol-price-new')?.textContent)
          || clean(card.querySelector('.ol-card-price')?.textContent);
        const installment = clean(card.querySelector('.ol-cuotas-box')?.textContent);
        const anchor = card.querySelector<HTMLAnchorElement>('a.ol-card-btn, a.ol-card-img-wrap, a[href]');
        const image = card.querySelector<HTMLImageElement>('img');
        const imageUrl = image?.currentSrc || image?.src || image?.getAttribute('src') || '';
        const imageAlt = clean(image?.getAttribute('alt'));

        return {
          source_site: 'Camas Olympia Online GT',
          brand: 'Olympia',
          line: '',
          category,
          product_name: title || imageAlt,
          availability: 'Listado en tienda online',
          regular_price: regularPrice,
          sale_price: salePrice,
          discount,
          installment,
          product_url: anchor?.href ? absolute(anchor.href) : '',
          source_url: sourceUrl,
          headline: '',
          description: '',
          warranty: '',
          benefits: '',
          image_url: imageUrl ? absolute(imageUrl) : '',
          image_alt: imageAlt,
          scraped_at: '',
        };
      })
      .filter((product) => product.product_name && product.product_url);
  }, OLYMPIA_SOURCE_URL);
}

async function scrapeOlympia(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  await goto(page, OLYMPIA_SOURCE_URL);
  const rows = await extractOlympiaProducts(page);

  return rows.map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
}

async function extractLaColchoneriaProducts(page: Page): Promise<CsvProduct[]> {
  return page.evaluate((sourceUrl) => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const absolute = (url: string) => {
      try {
        return new URL(url, sourceUrl).toString();
      } catch {
        return url;
      }
    };
    const productCategory = (name: string, sectionTitle: string) => {
      if (sectionTitle) {
        return sectionTitle;
      }
      if (/colch[oó]n|colchon/i.test(name)) {
        return 'Colchones';
      }
      if (/^cama\b/i.test(name)) {
        return 'Camas';
      }
      if (/almohada/i.test(name)) {
        return 'Almohadas';
      }
      if (/protector|s[aá]bana|sabana|duvet|edred[oó]n|cubrecama/i.test(name)) {
        return 'Ropa de cama';
      }
      if (/sill[oó]n|sofa|sof[aá]|camastron|camastr[oó]n/i.test(name)) {
        return 'Muebles';
      }
      return '';
    };
    const sectionHeading = (card: Element) => {
      const section = card.closest('section, .shopify-section, [id^="shopify-section"]');
      const heading = section?.querySelector('h1,h2,h3,.section-title,.title');
      return clean(heading?.textContent)
        .replace(/^#+\s*/, '')
        .replace(/\s+\d+\s*$/, '');
    };
    const imageUrl = (image: HTMLImageElement | null) => {
      if (!image) {
        return '';
      }
      const template = image.getAttribute('data-src');
      if (template) {
        return template.replace('{width}', '720');
      }
      return image.currentSrc || image.src || image.getAttribute('src') || '';
    };
    const moneyAmounts = (value: string) => value.match(/Q\s?[\d,]+(?:\.\d{2})?/g) ?? [];

    const rows = Array.from(document.querySelectorAll<HTMLElement>('.product-card.js-product-card'))
      .map((card) => {
        const nameAnchor = card.querySelector<HTMLAnchorElement>('.product-card__name[href]');
        const image = card.querySelector<HTMLImageElement>('img');
        const productName = clean(nameAnchor?.textContent || image?.getAttribute('alt'));
        const priceText = clean(card.querySelector('.product-card__price')?.textContent);
        const amounts = moneyAmounts(priceText);
        const salePrice = clean(card.querySelector('.product-card__price strong')?.textContent) || amounts[0] || '';
        const regularPrice = clean(card.querySelector('.product-card__regular-price')?.textContent) || amounts[1] || '';
        const discount = clean(card.querySelector('.product-tag-sale, .product-label')?.textContent);
        const installment = clean(card.querySelector('.badge-finance')?.textContent);
        const size = clean(card.querySelector('[id^="size_slot_"]')?.textContent);
        const sectionTitle = sectionHeading(card);
        const url = nameAnchor?.href || card.querySelector<HTMLAnchorElement>('a[href]')?.href || '';
        const img = imageUrl(image);

        return {
          source_site: 'La Colchonería Guatemala',
          brand: 'La Colchonería',
          line: size,
          category: productCategory(productName, sectionTitle),
          product_name: productName,
          availability: 'Listado en tienda online',
          regular_price: regularPrice,
          sale_price: salePrice,
          discount,
          installment,
          product_url: url ? absolute(url) : '',
          source_url: sourceUrl,
          headline: '',
          description: '',
          warranty: '',
          benefits: '',
          image_url: img ? absolute(img) : '',
          image_alt: clean(image?.getAttribute('alt')),
          scraped_at: '',
        };
      })
      .filter((product) => product.product_name && product.product_url);

    const unique = new Map<string, CsvProduct>();
    for (const row of rows) {
      if (!unique.has(row.product_url)) {
        unique.set(row.product_url, row);
      }
    }

    return Array.from(unique.values());
  }, LA_COLCHONERIA_SOURCE_URL);
}

async function scrapeLaColchoneria(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  await goto(page, LA_COLCHONERIA_SOURCE_URL);
  const rows = await extractLaColchoneriaProducts(page);

  return rows.map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
}

  return {
    olympia: scrapeOlympia,
    laColchoneria: scrapeLaColchoneria,
  };
}
