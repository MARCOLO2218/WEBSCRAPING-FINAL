import type { Page } from 'playwright';
import type { CsvProduct } from './domain/product.js';
import type { ProductSelectorConfig } from './scrapers/types.js';

export async function goto(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
}

export async function extractCardProducts(
  page: Page,
  sourceUrl: string,
  config: ProductSelectorConfig,
): Promise<CsvProduct[]> {
  return page.evaluate(({ sourceUrl, config }) => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const absolute = (url: string) => {
      try {
        return new URL(url, sourceUrl).toString();
      } catch {
        return url;
      }
    };
    const firstText = (root: Element, selector?: string) => selector ? clean(root.querySelector(selector)?.textContent) : '';
    const firstTextBySelectorOrder = (root: Element, selectors?: string) => {
      for (const selector of (selectors ?? '').split(',').map((part) => part.trim()).filter(Boolean)) {
        const value = firstText(root, selector);
        if (value) return value;
      }
      return '';
    };
    const productCategory = (name: string, fallback: string) => {
      if (fallback) return fallback;
      if (/colch[oó]n|colchon|mattress/i.test(name)) return 'Colchones';
      if (/cama|base|box spring/i.test(name)) return 'Camas';
      if (/almohada|pillow/i.test(name)) return 'Almohadas';
      if (/protector|funda|s[aá]bana|frazada|edred[oó]n|comforter/i.test(name)) return 'Ropa de cama';
      return '';
    };
    const imageUrl = (image: HTMLImageElement | null) => {
      if (!image) return '';
      const srcset = image.getAttribute('data-srcset') || image.getAttribute('srcset') || '';
      const srcsetFirst = srcset.split(',').map((item) => item.trim().split(/\s+/)[0]).find(Boolean) ?? '';
      const src = image.currentSrc || image.src || image.getAttribute('data-src') || image.getAttribute('src') || srcsetFirst;
      return src && !src.startsWith('data:') ? absolute(src) : '';
    };
    const buildRow = (root: Element, title: string, anchor: HTMLAnchorElement | null, image: HTMLImageElement | null): CsvProduct => {
      const rootText = clean(root.textContent);
      const currencyRegex = /(?:Q|GTQ)\s*[\d,]+(?:\.\d+)?(?:\s*-\s*(?:Q|GTQ)?\s*[\d,]+(?:\.\d+)?)?/i;
      const category = productCategory(title, firstText(root, config.categorySelector));
      const regularPrice = firstTextBySelectorOrder(root, config.regularPriceSelector);
      const salePrice = firstTextBySelectorOrder(root, config.salePriceSelector)
        || firstTextBySelectorOrder(root, config.priceSelector)
        || clean(rootText.match(currencyRegex)?.[0]);

      return {
        source_site: config.sourceSite,
        brand: config.brand,
        line: firstText(root, config.lineSelector),
        category,
        product_name: title,
        availability: 'Listado en tienda online',
        regular_price: regularPrice,
        sale_price: salePrice,
        discount: firstText(root, config.discountSelector),
        installment: firstText(root, config.installmentSelector),
        product_url: anchor?.href ? absolute(anchor.href) : '',
        source_url: sourceUrl,
        headline: '',
        description: '',
        warranty: '',
        benefits: '',
        image_url: imageUrl(image),
        image_alt: clean(image?.getAttribute('alt')),
        scraped_at: '',
      };
    };

    const cardRows = Array.from(document.querySelectorAll<HTMLElement>(config.cardSelector))
      .map((card) => {
        const title = firstTextBySelectorOrder(card, config.titleSelector)
          || clean(card.getAttribute('aria-label'))
          || clean(card.querySelector<HTMLAnchorElement>('a[title]')?.getAttribute('title'))
          || clean(card.querySelector<HTMLImageElement>('img[alt]')?.getAttribute('alt'));
        return buildRow(card, title, card.querySelector<HTMLAnchorElement>(config.anchorSelector ?? 'a[href]'), card.querySelector<HTMLImageElement>(config.imageSelector ?? 'img'));
      })
      .filter((row) => row.product_name && row.product_url);
    const linkRows = config.includeLinkFallback === false ? [] : Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .map((anchor) => {
        const container = anchor.closest('article, li, [class*="product"], [class*="Product"], [data-testid*="product"], [data-testid*="Product"], div') ?? anchor;
        const image = container.querySelector<HTMLImageElement>('img') ?? anchor.querySelector<HTMLImageElement>('img');
        const title = clean(anchor.getAttribute('title')) || clean(anchor.textContent) || clean(image?.getAttribute('alt'))
          || clean(container.querySelector('h1,h2,h3,h4,[class*="name"],[class*="Name"],[class*="title"],[class*="Title"]')?.textContent);
        return buildRow(container, title, anchor, image);
      })
      .filter((row) => row.product_name && row.product_url);
    const unique = new Map<string, CsvProduct>();
    for (const row of [...cardRows, ...linkRows]) {
      const key = row.product_url || `${row.source_site}|${row.product_name}`;
      if (!unique.has(key)) unique.set(key, row);
    }
    return Array.from(unique.values());
  }, { sourceUrl, config });
}
