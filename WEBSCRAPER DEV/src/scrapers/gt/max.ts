import type { Page } from 'playwright';
import type { CsvProduct } from '../../domain/product.js';

export type MaxScraperDependencies = {
  navigate: (page: Page, url: string) => Promise<void>;
  filterGuatemalaRows: (rows: CsvProduct[], sourceSite?: string) => CsvProduct[];
};

export function createMaxGuatemalaScraper(dependencies: MaxScraperDependencies) {
  const goto = dependencies.navigate;
  const filterGuatemalaQuetzalRows = dependencies.filterGuatemalaRows;

// MAX Guatemala: extractor especializado para tarjetas con boton Agregar.
const MAX_GT_SEARCH_URLS = [
  'https://www.max.com.gt/search?q=camas',
  'https://www.max.com.gt/search?q=colchon',
  'https://www.max.com.gt/search?q=colchones',
  'https://www.max.com.gt/search?q=base%20cama',
  'https://www.max.com.gt/search?q=almohada',
];

function maxUrlWithPage(baseUrl: string, pageNumber: number): string {
  if (pageNumber <= 1) return baseUrl;
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${pageNumber}`;
}

async function prepareMaxPage(page: Page, sourceUrl: string): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('country', 'GT');
      localStorage.setItem('countryCode', 'GT');
      localStorage.setItem('currency', 'GTQ');
      localStorage.setItem('location', JSON.stringify({ country: 'GT', department: 'Guatemala', municipality: 'Guatemala' }));
    } catch {
      // La pagina puede bloquear localStorage en algunos contextos.
    }
  }).catch(() => undefined);

  await page.context().addCookies([
    { name: 'country', value: 'GT', domain: '.max.com.gt', path: '/' },
    { name: 'currency', value: 'GTQ', domain: '.max.com.gt', path: '/' },
  ]).catch(() => undefined);

  await goto(page, sourceUrl);
  await page.waitForTimeout(3500);
}

async function autoScrollMaxCatalogPage(page: Page): Promise<void> {
  let previousSignal = 0;
  let stableChecks = 0;

  for (let i = 0; i < 26 && stableChecks < 5; i += 1) {
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(900);

    const currentSignal = await page.evaluate(() => {
      const text = document.body?.innerText ?? '';
      const addCount = (text.match(/Agregar/gi) ?? []).length;
      const priceCount = (text.match(/Q\s*\d/gi) ?? []).length;
      return addCount + priceCount;
    }).catch(() => 0);

    if (currentSignal <= previousSignal) {
      stableChecks += 1;
    } else {
      stableChecks = 0;
      previousSignal = currentSignal;
    }
  }

  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => undefined);
}

async function extractMaxProductsFromPage(page: Page, sourceUrl: string, scrapedAt: string): Promise<CsvProduct[]> {
  const rows = await page.evaluate(({ sourceUrl, scrapedAt }) => {
    type MaxDomProduct = {
      name: string;
      brand: string;
      regularPrice: string;
      salePrice: string;
      discount: string;
      productUrl: string;
      imageUrl: string;
      imageAlt: string;
    };

    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const absolute = (url: string) => {
      try {
        return new URL(url, sourceUrl).toString();
      } catch {
        return url;
      }
    };
    const moneyNumber = (value: string) => {
      const parsed = Number(value.replace(/Q|GTQ/gi, '').replace(/\s/g, '').replace(/,/g, '').replace(/[^\d.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    };
    const formatQ = (value: number) => `Q ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const knownBrands = [
      'Comfort Life', 'Olympia', 'Facenco', 'Therapedic', 'Serta', 'Belezza', 'Capriva',
      'La Bodegona del Mueble', 'Muebles Fiesta', 'Facomsa', 'Tuco', 'Hilker',
      'Simmons', 'Indufoam', 'Camas restonic', 'Restonic', 'Kangaroo', 'Lucca',
      'Sealy', 'Sienna', 'Siesta', 'Nap&Co', 'Hyde Lane', 'Providencia',
      'Furniture City', 'My Baby Mattress', 'Dreamy', 'Genial Baby', 'Libsa',
      'Panzerglass', 'Utopia Bedding', 'Ebo', 'Bbluv', 'White Home',
    ];
    const bedWords = /(cama|camas|colch[oÃ³]n|colchon|colchones|mattress|base|box|almohada|pillow|cabecera|respaldo|s[aÃ¡]bana|sabana|protector|edred[oÃ³]n|comforter|duvet|restonic|olympia|simmons|indufoam|facenco|sealy|serta|kangaroo|therapedic|comfort life)/i;
    const ignoreLine = /(agregar|vendedor:|v[Ã¡a]lido|patrocinado|rebaja|oferta|categorias|categorÃ­as|rastrea|mi cuenta|carrito|resultados para|ordenar:|marca$|marketplace|tiendas|cat[Ã¡a]logo|tu ubicaci[oÃ³]n|puntos max|viajes max|bodas max)/i;
    const normalizeMaxPriceText = (value: string) => {
      return value
        .replace(/Q\s*\n\s*([0-9][0-9,.]*)\.\s*\n\s*([0-9]{2})/g, 'Q$1.$2')
        .replace(/Q\s*([0-9][0-9,.]*)\.\s+([0-9]{2})(?!\d)/g, 'Q$1.$2')
        .replace(/Q\s*\n\s*([0-9][0-9,.]*(?:\.[0-9]{2})?)/g, 'Q$1');
    };

    const buildProductFromText = (textValue: string, card?: HTMLElement): MaxDomProduct | null => {
      const text = normalizeMaxPriceText(textValue);
      const compactText = clean(text);
      if (!/Q\s*\d|GTQ/i.test(compactText) || !bedWords.test(compactText)) return null;

      const rawLines = text
        .split(/\n/)
        .map(clean)
        .filter(Boolean);
      const lines = rawLines.length > 1
        ? rawLines
        : compactText.split(/ {2,}/).map(clean).filter(Boolean);

      const moneyMatches = compactText.match(/Q\s*[0-9][0-9,.]*(?:\.[0-9]{2})?/gi) ?? [];
      const moneyValues = moneyMatches
        .map((price) => ({ text: clean(price), value: moneyNumber(price) }))
        .filter((price): price is { text: string; value: number } => price.value !== null && price.value > 0);

      if (moneyValues.length === 0) return null;

      const sortedPrices = [...moneyValues].sort((a, b) => a.value - b.value);
      const salePrice = sortedPrices.length > 1 ? formatQ(sortedPrices[0].value) : '';
      const regularPrice = formatQ(sortedPrices[sortedPrices.length - 1].value);
      const discount = clean(compactText.match(/-\s*\d+%/)?.[0]);
      const brand = knownBrands.find((brandName) =>
        lines.some((line) => line.toLowerCase() === brandName.toLowerCase() || line.toLowerCase().includes(brandName.toLowerCase())),
      ) ?? 'MAX';

      const productLine = lines.find((line) =>
        bedWords.test(line)
        && !ignoreLine.test(line)
        && !/Q\s*\d|GTQ|\d+%/.test(line)
        && line.toLowerCase() !== brand.toLowerCase()
        && line.length >= 8,
      );

      const image = card?.querySelector<HTMLImageElement>('img') ?? null;
      const anchor = card
        ? Array.from(card.querySelectorAll<HTMLAnchorElement>('a[href]'))
          .find((item) => {
            const href = item.getAttribute('href') ?? '';
            return href && !href.startsWith('#') && !/login|cuenta|carrito|checkout/i.test(href);
          })
        : null;
      const srcset = image?.getAttribute('srcset') || image?.getAttribute('data-srcset') || '';
      const srcsetFirst = srcset.split(',').map((item) => item.trim().split(/\s+/)[0]).find(Boolean) ?? '';
      const imageSrc = image?.currentSrc || image?.src || image?.getAttribute('data-src') || image?.getAttribute('src') || srcsetFirst || '';
      const imageAlt = clean(image?.getAttribute('alt'));
      const name = productLine || imageAlt;

      if (!name || !bedWords.test(`${name} ${imageAlt}`)) return null;

      return {
        name,
        brand,
        regularPrice,
        salePrice,
        discount,
        productUrl: anchor?.href ? absolute(anchor.href) : `${sourceUrl}#${encodeURIComponent(name)}`,
        imageUrl: imageSrc && !imageSrc.startsWith('data:') ? absolute(imageSrc) : '',
        imageAlt,
      };
    };

    const pickCard = (button: Element): HTMLElement | null => {
      let current: Element | null = button;
      let best: HTMLElement | null = null;
      for (let depth = 0; current && depth < 8; depth += 1) {
        const element = current as HTMLElement;
        const text = clean(element.innerText || element.textContent);
        const addCount = (text.match(/Agregar/gi) ?? []).length;

        if (addCount > 1) {
          break;
        }

        if (/Q\s*\d|GTQ/i.test(text) && bedWords.test(text)) {
          best = element;
        }
        current = current.parentElement;
      }
      return best;
    };

    const results: MaxDomProduct[] = [];
    const buttons = Array.from(document.querySelectorAll('button, a'))
      .filter((element) => isVisible(element) && /agregar/i.test(clean(element.textContent)));

    for (const button of buttons) {
      const card = pickCard(button);
      if (!card) continue;
      const product = buildProductFromText(card.innerText || card.textContent || '', card);
      if (product) results.push(product);
    }

    if (results.length === 0) {
      const bodyText = document.body?.innerText ?? '';
      const parts = normalizeMaxPriceText(bodyText).split(/\bAgregar\b/i);
      for (const part of parts) {
        const product = buildProductFromText(part);
        if (product) results.push(product);
      }
    }

    return results.map((row): CsvProduct => ({
      source_site: 'MAX Guatemala',
      brand: row.brand || 'MAX',
      line: row.brand || 'MAX',
      category: /almohada|pillow/i.test(row.name) ? 'Almohadas' : /base|cama/i.test(row.name) ? 'Camas y bases' : 'Colchones',
      product_name: row.name,
      availability: 'Listado en tienda online',
      regular_price: row.regularPrice,
      sale_price: row.salePrice,
      discount: row.discount,
      installment: '',
      product_url: row.productUrl,
      source_url: sourceUrl,
      headline: row.name,
      description: '',
      warranty: '',
      benefits: '',
      image_url: row.imageUrl,
      image_alt: row.imageAlt || row.name,
      scraped_at: scrapedAt,
    }));
  }, { sourceUrl, scrapedAt });

  const unique = new Map<string, CsvProduct>();
  for (const row of rows) {
    const key = row.product_url || `${row.product_name}|${row.regular_price}|${row.sale_price}`;
    if (!unique.has(key)) {
      unique.set(key, row);
    }
  }

  return Array.from(unique.values());
}

async function scrapeMaxGtDetailed(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  const rowsByKey = new Map<string, CsvProduct>();
    // MAX usa scroll infinito; el parametro page repite resultados y vuelve lenta la corrida.
  const maxPagesPerSearch = 1;

  for (const searchUrl of MAX_GT_SEARCH_URLS) {
    let emptyPages = 0;

    for (let pageNumber = 1; pageNumber <= maxPagesPerSearch && emptyPages < 2; pageNumber += 1) {
      const sourceUrl = maxUrlWithPage(searchUrl, pageNumber);
      console.log(`MAX Guatemala: leyendo ${sourceUrl}...`);

      await prepareMaxPage(page, sourceUrl);
      await autoScrollMaxCatalogPage(page);

      const pageRows = await extractMaxProductsFromPage(page, sourceUrl, scrapedAt);
      const diagnostic = await page.evaluate(() => {
        const text = document.body?.innerText ?? '';
        return {
          textLength: text.length,
          agregar: (text.match(/Agregar/gi) ?? []).length,
          q: (text.match(/Q\s*\d/gi) ?? []).length,
        };
      }).catch(() => ({ textLength: 0, agregar: 0, q: 0 }));
      console.log(`MAX Guatemala: pagina ${pageNumber} de "${searchUrl}" genero ${pageRows.length} candidatos. Diagnostico texto=${diagnostic.textLength}, agregar=${diagnostic.agregar}, precios_Q=${diagnostic.q}.`);

      if (pageRows.length === 0) {
        emptyPages += 1;
        continue;
      }

      emptyPages = 0;
      for (const row of pageRows) {
        const key = row.product_url || `${row.product_name}|${row.regular_price}|${row.sale_price}`;
        if (!rowsByKey.has(key)) {
          rowsByKey.set(key, row);
        }
      }
    }
  }

  const rows = Array.from(rowsByKey.values());
  console.log(`MAX Guatemala: candidatos unicos antes de filtros=${rows.length}`);

  return filterGuatemalaQuetzalRows(rows, 'MAX Guatemala').map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
}
// FIN MAX Guatemala extractor especializado.



async function scrapeMaxGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  return scrapeMaxGtDetailed(page, scrapedAt);
}

  return scrapeMaxGt;
}
