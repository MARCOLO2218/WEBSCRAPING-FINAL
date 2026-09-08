import type { Page } from 'playwright';
import {
  cleanProductText as cleanText,
  type CsvProduct,
  type ProductDetails,
  type ScrapedCatalogProduct as CatalogProduct,
} from '../../domain/product.js';

export const FACENCO_SOURCE_URL = 'https://camasfacenco.com/';

export type FacencoGuatemalaDependencies = {
  navigate: (page: Page, url: string) => Promise<void>;
};

function toAbsoluteUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

export function createFacencoGuatemalaScraper(dependencies: FacencoGuatemalaDependencies) {
  const goto = dependencies.navigate;

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function inferFacencoLine(text: string, url: string): string {
  const value = cleanText(text || url);
  const fromText = value.match(/\blinea\s+([a-z0-9\s-]+)/i)?.[1] ?? '';
  const fromUrl = url.match(/linea-([^/?#]+)/i)?.[1] ?? '';
  const rawLine = fromText || fromUrl;

  return rawLine
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function extractFacencoCatalogUrls(page: Page, sourceUrl: string): Promise<string[]> {
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
      .filter((url) => {
        if (!url.startsWith(sourceUrl)) {
          return false;
        }

        return /\/linea-|\/producto|\/colchon|\/cama/i.test(new URL(url).pathname);
      });
  }, sourceUrl);
}

async function extractFacencoCatalogProducts(page: Page, sourceUrl: string): Promise<CatalogProduct[]> {
  return page.evaluate((sourceUrl) => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const absolute = (url: string) => {
      try {
        return new URL(url, sourceUrl).toString();
      } catch {
        return url;
      }
    };
    const nameFromUrl = (url: string) => {
      try {
        const slug = new URL(url, sourceUrl).pathname.replace(/^\/|\/$/g, '').split('/').pop() ?? '';
        return slug
          .replace(/-\d+$/g, '')
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (letter) => letter.toUpperCase());
      } catch {
        return '';
      }
    };
    const productHeadings = Array.from(document.querySelectorAll('h2'))
      .map((heading) => clean(heading.textContent))
      .filter((text) => {
        const lowerText = text.toLowerCase();
        return text
          && lowerText !== 'enlaces'
          && lowerText !== 'facenco'
          && !lowerText.startsWith('direcci')
          && !lowerText.includes('trabaja con nosotros');
      });

    const linkScript = Array.from(document.scripts)
      .map((script) => script.textContent ?? '')
      .find((text) => text.includes('et_link_options_data'));

    const match = linkScript?.match(/et_link_options_data\s*=\s*(\[[\s\S]*?\]);/);
    const linkData = match ? JSON.parse(match[1]) as Array<{ class: string; url: string }> : [];

    const products = linkData
      .map((item, index) => {
        const container = document.querySelector(`.${CSS.escape(item.class)}`);
        const heading = clean(container?.querySelector('h1,h2,h3')?.textContent);
        const image = container?.querySelector('img');
        const imageSrc = image?.getAttribute('src') || image?.getAttribute('data-src') || '';
        const imageAlt = clean(image?.getAttribute('alt'));
        const productUrl = absolute(item.url);
        const visibleHeading = productHeadings.length > linkData.length
          ? productHeadings.at(index + productHeadings.length - linkData.length) ?? ''
          : '';
        const fallbackName = productHeadings.length <= linkData.length ? nameFromUrl(productUrl) : heading;

        return {
          productName: visibleHeading || fallbackName || heading || imageAlt || nameFromUrl(productUrl),
          productUrl,
          sourceUrl,
          line: '',
          imageUrl: imageSrc ? absolute(imageSrc) : '',
          imageAlt,
        };
      })
      .filter((product) => product.productName && product.productUrl);

    if (products.length > 0) {
      return products;
    }

    return Array.from(document.querySelectorAll('h2'))
      .map((heading) => {
        const text = clean(heading.textContent);
        const container = heading.closest('.et_pb_column, .et_pb_module, section, article, div');
        const anchor = container?.querySelector<HTMLAnchorElement>('a[href]');
        const image = container?.querySelector('img');
        const imageSrc = image?.getAttribute('src') || image?.getAttribute('data-src') || '';

        return {
          productName: text,
          productUrl: anchor?.href ? absolute(anchor.href) : '',
          sourceUrl,
          line: '',
          imageUrl: imageSrc ? absolute(imageSrc) : '',
          imageAlt: clean(image?.getAttribute('alt')),
        };
      })
      .filter((product) => product.productName && product.productUrl);
  }, sourceUrl);
}

async function extractProductDetails(page: Page): Promise<ProductDetails> {
  return page.evaluate(() => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const ignored = /^(enlaces|facenco|otros beneficios|regresar|direcci[oÃ³]n|trabaja con nosotros)$/i;
    const main = document.querySelector('main, article, #main-content') ?? document.body;
    const headings = Array.from(main.querySelectorAll('h1,h2,h3'))
      .map((node) => clean(node.textContent))
      .filter((text) => text && !ignored.test(text));

    const paragraphs = Array.from(main.querySelectorAll('p'))
      .map((node) => clean(node.textContent))
      .filter((text) => text.length > 45 && !/tel\s*\(/i.test(text));

    const imageAlts = Array.from(main.querySelectorAll('img'))
      .map((image) => clean(image.getAttribute('alt')))
      .filter(Boolean);

    const bodyText = clean(main.textContent);
    const warrantyFromText = bodyText.match(/\b\d+\s*aÃ±os?\s+de\s+garant[iÃ­]a\b/i)?.[0] ?? '';
    const warrantyFromImage = imageAlts.find((alt) => /garant[iÃ­]a/i.test(alt)) ?? '';

    const benefitPairs = Array.from(main.querySelectorAll('h2,h3'))
      .map((heading) => {
        const title = clean(heading.textContent);
        if (!title || ignored.test(title) || /energy/i.test(title)) {
          return '';
        }

        let sibling = heading.parentElement?.nextElementSibling ?? heading.nextElementSibling;
        let description = '';

        for (let i = 0; sibling && i < 4; i += 1) {
          const text = clean(sibling.textContent);
          if (sibling.matches('p') && text.length > 20) {
            description = text;
            break;
          }
          sibling = sibling.nextElementSibling;
        }

        return description ? `${title}: ${description}` : title;
      })
      .filter(Boolean);

    const headline = headings.slice(0, 2).join(' - ');
    const description = paragraphs[0] ?? '';
    const benefits = Array.from(new Set(benefitPairs)).join(' | ');

    return {
      headline,
      description,
      warranty: warrantyFromText || warrantyFromImage,
      benefits,
    };
  });
}

async function scrapeFacenco(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  await goto(page, FACENCO_SOURCE_URL);
  const discoveredCatalogUrls = await extractFacencoCatalogUrls(page, FACENCO_SOURCE_URL);
  const catalogUrls = uniqueValues(
    discoveredCatalogUrls.length > 0 ? discoveredCatalogUrls : [FACENCO_SOURCE_URL],
  );
  const catalogProductsByKey = new Map<string, CatalogProduct>();

  for (const catalogUrl of catalogUrls) {
    await goto(page, catalogUrl);
    const pageTitle = await page.title();
    const line = inferFacencoLine(pageTitle, catalogUrl);
    const products = await extractFacencoCatalogProducts(page, catalogUrl);

    for (const product of products) {
      const productKey = `${catalogUrl}|${product.productName}|${product.productUrl}`;
      catalogProductsByKey.set(productKey, {
        ...product,
        sourceUrl: catalogUrl,
        line: product.line || line,
      });
    }
  }

  const catalogProducts = Array.from(catalogProductsByKey.values());
  const rows: CsvProduct[] = [];

  for (const product of catalogProducts) {
    await goto(page, product.productUrl);
    const details = await extractProductDetails(page);

    rows.push({
      source_site: 'FACENCO',
      brand: 'FACENCO',
      line: product.line,
      category: 'Colchones',
      product_name: cleanText(product.productName),
      availability: 'Listado en catálogo',
      regular_price: '',
      sale_price: '',
      discount: '',
      installment: '',
      product_url: toAbsoluteUrl(product.productUrl, product.sourceUrl),
      source_url: product.sourceUrl,
      headline: details.headline,
      description: details.description,
      warranty: details.warranty,
      benefits: details.benefits,
      image_url: product.imageUrl,
      image_alt: product.imageAlt,
      scraped_at: scrapedAt,
    });
  }

  return rows;
}

  return scrapeFacenco;
}
