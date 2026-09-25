import { chromium } from 'playwright';
import { createElGalloNicaraguaScraper } from '../dist/scrapers/nc/el-gallo.js';
import { createSimanNicaraguaScraper } from '../dist/scrapers/nc/siman.js';
import { createWalmartNicaraguaScraper } from '../dist/scrapers/nc/walmart.js';
import { createMaxipaliNicaraguaScraper } from '../dist/scrapers/nc/maxipali.js';

const allowed = new Set(['el-gallo', 'siman', 'walmart', 'maxipali']);
const requested = process.argv.slice(2).filter((value) => !value.startsWith('-'));
const stores = requested.length ? requested : [...allowed];
if (stores.some((store) => !allowed.has(store))) {
  throw new Error(`Tienda inválida. Use: ${[...allowed].join(', ')}`);
}

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const pageObservations = new Map();
const navigate = async (page, url) => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.getByRole('button', { name: /^aceptar$/i }).click({ timeout: 3_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500);
};

const extractCards = async (page, sourceUrl, config) => {
  const result = await page.evaluate(({ sourceUrl, config }) => {
  const cleanText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const text = (card, selector) => cleanText(selector ? card.querySelector(selector)?.textContent : '');
  const absolute = (value) => {
    try { return new URL(value, location.href).toString(); } catch { return ''; }
  };
  const rows = [...document.querySelectorAll(config.cardSelector)].map((card) => {
    const anchor = card.querySelector(config.anchorSelector || 'a[href]');
    const image = card.querySelector(config.imageSelector || 'img');
    const title = text(card, config.titleSelector);
    return {
      source_site: config.sourceSite,
      brand: config.brand,
      line: '',
      category: 'Camas y colchones',
      product_name: title,
      availability: /agotado|no disponible/i.test(card.textContent || '') ? 'Agotado' : 'Listado en tienda online',
      regular_price: text(card, config.regularPriceSelector),
      sale_price: text(card, config.salePriceSelector || config.priceSelector),
      discount: text(card, config.discountSelector),
      installment: text(card, config.installmentSelector),
      product_url: absolute(anchor?.getAttribute('href')),
      source_url: sourceUrl,
      headline: title,
      description: '', warranty: '', benefits: '',
      image_url: absolute(image?.getAttribute('src') || image?.getAttribute('data-src')),
      image_alt: cleanText(image?.getAttribute('alt') || title),
      scraped_at: '',
    };
  }).filter((row) => row.product_name && row.product_url);
  const bodyText = String(document.body?.innerText || '').replace(/\s+/g, ' ').trim();
  const visibleCountHints = [...new Set(
    (bodyText.match(/.{0,35}\b\d+\s+(?:resultados?|productos?)\b.{0,35}/gi) || []).map((value) => value.trim()),
  )].slice(0, 3);
  return { rows, visibleCountHints };
  }, { sourceUrl, config });
  pageObservations.set(sourceUrl, result.visibleCountHints);
  return result.rows;
};

const extractMaxipaliProduct = async (page, productUrl, scrapedAt) => page.evaluate(({ productUrl, scrapedAt }) => {
  const cleanText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const title = cleanText(document.title || document.querySelector('h1')?.textContent);
  const image = document.querySelector('main img, .product img, img');
  return title ? {
    source_site: 'Maxi Pali Nicaragua', brand: 'Maxi Pali', line: '', category: 'Camas y colchones',
    product_name: title, availability: 'Publicado sin precio', regular_price: '', sale_price: '',
    discount: '', installment: '', product_url: productUrl, source_url: productUrl,
    headline: title, description: '', warranty: '', benefits: '',
    image_url: image?.src || '', image_alt: cleanText(image?.alt || title), scraped_at: scrapedAt,
  } : null;
}, { productUrl, scrapedAt });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: 'es-NI' });
const scrapedAt = new Date().toISOString();
const runners = {
  'el-gallo': createElGalloNicaraguaScraper({ navigate, extractCards }),
  siman: createSimanNicaraguaScraper({ navigate, extractCards }),
  walmart: createWalmartNicaraguaScraper(),
  maxipali: createMaxipaliNicaraguaScraper({ navigate, extractProduct: extractMaxipaliProduct }),
};

const report = { status: 'piloto', databaseWrites: false, scrapedAt, stores: {} };
try {
  for (const store of stores) {
    const started = Date.now();
    const pageResults = [];
    runners['el-gallo'] = createElGalloNicaraguaScraper({ navigate, extractCards,
      onPageResult: (source, pageNumber, count, sourceUrl) => pageResults.push({
        source, page: pageNumber, extracted: count,
        visibleCountHints: pageObservations.get(sourceUrl) || [],
      }) });
    runners.siman = createSimanNicaraguaScraper({ navigate, extractCards,
      onPageResult: (source, pageNumber, stats) => pageResults.push({ source, page: pageNumber, ...stats }) });
    try {
      const rows = await runners[store](page, scrapedAt);
      const diagnostic = rows.length === 0 ? await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        body: String(document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 500),
        links: document.querySelectorAll('a[href]').length,
        images: document.querySelectorAll('img').length,
        selectors: Object.fromEntries([
          '.product-item', '.item.product', '[class*="product-item"]',
          '.vtex-search-result-3-x-galleryItem', '[class*="galleryItem"]', '[class*="product-summary"]',
          'li.item', '.ais-hits--item', '.product-item-info', 'article',
          '.button-buy', '.result-wrapper', '.result', '.hit', '[class*="result"]',
          'a[href*="/p"]', 'a[href*="/product"]', '[class*="productCard"]', '[class*="ProductCard"]',
          'a[href$="/p"]',
          '[class*="siman-algolia-react-4-x-product"]',
        ].map((selector) => [selector, document.querySelectorAll(selector).length])),
        itemSample: [...document.querySelectorAll('li.item')].slice(0, 2).map((item) => ({
          className: item.className,
          text: String(item.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240),
          href: item.querySelector('a[href]')?.getAttribute('href') || '',
          html: item.innerHTML.slice(0, 500),
        })),
        buySample: [...document.querySelectorAll('.button-buy')].slice(0, 2).map((button) => {
          const parent = button.parentElement?.parentElement;
          return { className: parent?.className || '', text: String(parent?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 300), html: parent?.innerHTML.slice(0, 700) || '' };
        }),
        productLinkSample: [...document.querySelectorAll('a[href$="/p"]')].slice(0, 3).map((anchor) => ({
          href: anchor.getAttribute('href') || '',
          text: String(anchor.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180),
          className: anchor.className,
          parentClass: anchor.parentElement?.className || '',
          html: anchor.outerHTML.slice(0, 700),
        })),
        imageSample: [...document.querySelectorAll('img')].filter((image) => image.width > 120 && image.height > 100).slice(0, 4).map((image) => ({
          alt: image.alt || '', src: image.src.slice(0, 240),
          parentClass: image.parentElement?.className || '',
          grandParentClass: image.parentElement?.parentElement?.className || '',
          ancestors: (() => { const values = []; let node = image.parentElement; for (let i = 0; node && i < 7; i += 1, node = node.parentElement) values.push(node.className); return values; })(),
        })),
        hitSample: [...document.querySelectorAll('.siman-algolia-react-4-x-hitItem')].slice(0, 2).map((hit) => ({
          text: String(hit.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 450),
          html: hit.innerHTML.slice(0, 1800),
          classes: [...hit.querySelectorAll('[class]')].map((node) => ({
            className: node.className,
            text: String(node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140),
          })).filter((item) => /brand|name|price|summary|product/i.test(String(item.className))).slice(0, 25),
        })),
      })) : undefined;
      const pricedRows = rows.filter((row) => clean(row.regular_price) || clean(row.sale_price));
      report.stores[store] = {
        status: 'ok', count: rows.length,
        priced: pricedRows.length,
        seconds: Number(((Date.now() - started) / 1000).toFixed(2)),
        sample: rows.slice(0, 3).map((row) => ({ name: row.product_name, price: row.sale_price || row.regular_price, url: row.product_url })),
        ...(store === 'walmart' ? {
          byCategory: Object.fromEntries(rows.reduce((counts, row) => {
            const category = clean(row.category) || 'Sin categoría';
            counts.set(category, (counts.get(category) || 0) + 1);
            return counts;
          }, new Map())),
          unpricedSamples: rows.filter((row) => !clean(row.regular_price) && !clean(row.sale_price))
            .slice(0, 12).map((row) => ({
              name: row.product_name, category: row.category, availability: row.availability, url: row.product_url,
            })),
        } : {}),
        ...(pageResults.length ? { pages: pageResults } : {}),
        ...(diagnostic ? { diagnostic } : {}),
      };
    } catch (error) {
      report.stores[store] = { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
if (Object.values(report.stores).some((entry) => entry.status !== 'ok')) process.exitCode = 1;
