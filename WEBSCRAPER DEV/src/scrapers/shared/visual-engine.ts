import type { Page } from 'playwright';
import type { CsvProduct } from '../../domain/product.js';
import type { ProductSelectorConfig } from '../types.js';

export type VisualScraperEngineDependencies = {
  navigate: (page: Page, url: string) => Promise<void>;
  filterGuatemalaRows: (rows: CsvProduct[], sourceSite?: string) => CsvProduct[];
  extractCards: (page: Page, sourceUrl: string, config: ProductSelectorConfig) => Promise<CsvProduct[]>;
};

export function createVisualScraperEngine(dependencies: VisualScraperEngineDependencies) {
  const goto = dependencies.navigate;
  const filterGuatemalaQuetzalRows = dependencies.filterGuatemalaRows;
  const extractCardProducts = dependencies.extractCards;

async function autoScrollCatalogPage(page: Page): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(900);
  }
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
}

async function scrapeGenericGuatemalaStore(
  page: Page,
  scrapedAt: string,
  sourceUrl: string,
  sourceSite: string,
  brand: string,
): Promise<CsvProduct[]> {
  await goto(page, sourceUrl);
  await autoScrollCatalogPage(page);
  const rows = await extractCardProducts(page, sourceUrl, {
    sourceSite,
    brand,
    cardSelector: [
      'li.product-item',
      '.product-item-info',
      '.product-card',
      '.product',
      '.vtex-product-summary-2-x-container',
      '.vtex-search-result-3-x-galleryItem',
      '[class*="galleryItem"]',
      '.vtex-search-result-3-x-galleryItem',
      '[class*="galleryItem"]',
      '[class*="vtex-product-summary"]',
      '[class*="product-summary"]',
      '[data-testid*="product"]',
      '[class*="ProductSummary"]',
      '[class*="ProductSummary"]',
      'article',
    ].join(', '),
    titleSelector: [
      '.product-item-link',
      '.product-name',
      '.product-title',
      '.product-card__name',
      '.vtex-product-summary-2-x-productBrand',
      '[class*="productBrand"]',
      '[class*="productName"]',
      '[class*="nameContainer"]',
      '[class*="nameContainer"]',
      '[data-testid="product-title"]',
      'h2',
      'h3',
      'a[title]',
    ].join(', '),
    categorySelector: '.category, .product-category, .breadcrumb, [class*="category"]',
    anchorSelector: 'a.vtex-product-summary-2-x-clearLink, a[href]',
    imageSelector: 'img.vtex-product-summary-2-x-image, img',
    regularPriceSelector: '.old-price, .was-price, del, .price-old, [class*="oldPrice"], [class*="listPrice"], [class*="ListPrice"], [class*="list-price"]',
    salePriceSelector: '.special-price, .sale-price, ins, .price-final_price, [class*="sellingPrice"], [class*="SellingPrice"], [class*="salePrice"], [class*="currencyContainer"]',
    priceSelector: '.price, .price-box, .product-price, [class*="sellingPrice"], [class*="SellingPrice"], [class*="currencyContainer"], [class*="price"], [class*="Price"], [data-testid*="price"]',
    discountSelector: '.discount, .badge, .label, .tag, [class*="discount"], [class*="promo"]',
    installmentSelector: '.installment, .cuotas, [class*="installment"], [class*="cuota"]',
  });

  return filterGuatemalaQuetzalRows(rows, sourceSite).map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
}

async function scrapeVisualProductGrid(
  page: Page,
  scrapedAt: string,
  sourceUrl: string,
  sourceSite: string,
  brandFallback: string
): Promise<CsvProduct[]> {
  await goto(page, sourceUrl);
  await autoScrollCatalogPage(page);
  await page.waitForTimeout(1500);

  const extracted = await page.evaluate((args) => {
    const clean = (value: string | null | undefined): string =>
      (value ?? '').replace(/\s+/g, ' ').trim();

    const absoluteUrl = (href: string | null | undefined): string => {
      if (!href || href === '#') return args.sourceUrl;
      try {
        return new URL(href, window.location.href).toString();
      } catch {
        return args.sourceUrl;
      }
    };

    const visible = (element: Element): boolean => {
      const html = element as HTMLElement;
      const rect = html.getBoundingClientRect();
      return rect.width > 20 && rect.height > 20;
    };

    const bedWords = /(cama|camas|colch[o\u00f3]n|colchon|box|base|cabecera|almohada|pillow|sleep|dream|restonic|simmons|serta|sealy|olympia|facenco|indufoam|comfort life|therapedic|siesta)/i;
    const ignoreWords = /(telefono|tel[e\u00e9]fono|whatsapp|carrito|login|cuenta|favoritos|menu|categorias|filtrar por|ordenar por|cloudflare|5xx-error)/i;
    const priceRegex = /Q\s*[0-9][0-9,]*(?:\.[0-9]{2})?/gi;

    const parsePrice = (value: string): number | null => {
      const match = value.match(/Q\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i);
      if (!match) return null;
      const parsed = Number(match[1].replace(/,/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    };

    const formatPrice = (value: number | null): string => {
      if (value === null) return '';
      return `Q${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const candidates = new Set<HTMLElement>();
    const cardSelectors = [
      'li.product',
      'article',
      '.product',
      '.product-card',
      '.product-item',
      '.woocommerce-LoopProduct-link',
      '[class*="product"]',
      '[class*="Product"]',
      '[class*="card"]',
      '[class*="Card"]'
    ];

    const addCandidate = (element: Element | null) => {
      if (!element) return;
      const html = element as HTMLElement;
      if (!visible(html)) return;
      const text = clean(html.innerText || html.textContent);
      if (!priceRegex.test(text)) {
        priceRegex.lastIndex = 0;
        return;
      }
      priceRegex.lastIndex = 0;
      if (!bedWords.test(text)) return;
      if (text.length > 3200) return;
      candidates.add(html);
    };

    for (const selector of cardSelectors) {
      document.querySelectorAll(selector).forEach(addCandidate);
    }

    const actions = Array.from(document.querySelectorAll('button, a, [role="button"]')).filter((element) => {
      const text = clean(element.textContent);
      return /(comprar|agregar|a[n\u00f1]adir|ver producto|cotizar)/i.test(text);
    });

    for (const action of actions) {
      let current: Element | null = action;
      let best: HTMLElement | null = null;

      for (let depth = 0; current && depth < 9; depth += 1) {
        const html = current as HTMLElement;
        const text = clean(html.innerText || html.textContent);
        const actionCount = (text.match(/(comprar|agregar|a[n\u00f1]adir|ver producto|cotizar)/gi) ?? []).length;

        if (depth > 0 && (actionCount > 1 || text.length > 2800)) {
          break;
        }

        if (priceRegex.test(text) && bedWords.test(text)) {
          best = html;
        }
        priceRegex.lastIndex = 0;
        current = current.parentElement;
      }

      addCandidate(best);
    }

    const titleSelectors = [
      '.woocommerce-loop-product__title',
      '.product-title',
      '.product-name',
      '[class*="title"]',
      '[class*="Title"]',
      '[class*="name"]',
      '[class*="Name"]',
      'h2',
      'h3',
      'h4',
      'a[title]'
    ];

    const pickTitle = (card: HTMLElement): string => {
      for (const selector of titleSelectors) {
        const found = card.querySelector(selector);
        const title = clean(found?.getAttribute('title') || found?.textContent);
        if (title && bedWords.test(title) && !ignoreWords.test(title) && title.length <= 180) {
          return title;
        }
      }

      const lines = clean(card.innerText || card.textContent)
        .split(/(?=Q\s*[0-9])|Comprar|Agregar|A\u00f1adir|Oferta|Desde:|Vendedor:/i)
        .map(clean)
        .filter(Boolean);

      const bestLine = lines
        .flatMap((line) => line.split(/\s{2,}/).map(clean))
        .filter((line) => bedWords.test(line) && !priceRegex.test(line) && !ignoreWords.test(line))
        .sort((a, b) => Math.abs(a.length - 55) - Math.abs(b.length - 55))[0];

      priceRegex.lastIndex = 0;
      return clean(bestLine);
    };

    const pickImage = (card: HTMLElement): { imageUrl: string; imageAlt: string } => {
      const img = card.querySelector('img') as HTMLImageElement | null;
      return {
        imageUrl: img?.src || img?.getAttribute('data-src') || img?.getAttribute('data-lazy-src') || '',
        imageAlt: clean(img?.alt)
      };
    };

    const pickUrl = (card: HTMLElement): string => {
      const anchors = Array.from(card.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const productAnchor = anchors.find((anchor) => {
        const href = anchor.getAttribute('href') ?? '';
        const text = clean(anchor.textContent || anchor.getAttribute('title'));
        return href && href !== '#' && !/cart|carrito|login|cuenta|favoritos/i.test(href) && (bedWords.test(text) || /producto|product|cama|colchon/i.test(href));
      }) ?? anchors.find((anchor) => (anchor.getAttribute('href') ?? '') !== '#');
      return absoluteUrl(productAnchor?.getAttribute('href'));
    };

    const rows: any[] = [];
    const seen = new Set<string>();

    for (const card of Array.from(candidates)) {
      const text = clean(card.innerText || card.textContent);
      if (ignoreWords.test(text) && !bedWords.test(text)) continue;

      const title = pickTitle(card);
      const priceMatches = Array.from(text.matchAll(priceRegex)).map((match) => match[0]);
      priceRegex.lastIndex = 0;
      const prices = priceMatches
        .map(parsePrice)
        .filter((price): price is number => price !== null && price > 0)
        .filter((price) => price >= 100 && price <= 100000);

      if (!title || prices.length === 0) continue;

      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const url = pickUrl(card);
      const key = `${title.toLowerCase()}|${url}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const image = pickImage(card);
      const category = /almohada|pillow/i.test(title)
        ? 'Almohadas'
        : /base|box|cabecera|cama/i.test(title)
          ? 'Camas y bases'
          : 'Colchones';

      rows.push({
        source_site: args.sourceSite,
        brand: args.brandFallback,
        line: '',
        category,
        product_name: title,
        availability: 'Listado en tienda online',
        regular_price: formatPrice(maxPrice),
        sale_price: minPrice < maxPrice ? formatPrice(minPrice) : '',
        discount: '',
        installment: '',
        product_url: url,
        source_url: args.sourceUrl,
        headline: title,
        description: '',
        warranty: '',
        benefits: '',
        image_url: image.imageUrl,
        image_alt: image.imageAlt || title,
        scraped_at: args.scrapedAt
      });
    }

    return rows;
  }, { sourceUrl, sourceSite, brandFallback, scrapedAt });

  console.log(`${sourceSite}: extractor visual encontro ${extracted.length} productos antes de filtros.`);

  return filterGuatemalaQuetzalRows(extracted as CsvProduct[], sourceSite).map((row) => ({
    ...row,
    scraped_at: scrapedAt,
  }));
}


async function scrapePagedVisualProductGrid(
  page: Page,
  scrapedAt: string,
  sourceUrl: string,
  sourceSite: string,
  brandFallback: string,
  maxPages = 3
): Promise<CsvProduct[]> {
  const rowsByKey = new Map<string, CsvProduct>();
  let currentUrl = sourceUrl;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    await goto(page, currentUrl);
    await autoScrollCatalogPage(page);
    await page.waitForTimeout(1800);

    const extracted = await page.evaluate((args) => {
      const clean = (value: string | null | undefined): string =>
        (value ?? '').replace(/\s+/g, ' ').trim();

      const absoluteUrl = (href: string | null | undefined): string => {
        if (!href || href === '#') return args.currentUrl;
        try {
          return new URL(href, window.location.href).toString();
        } catch {
          return args.currentUrl;
        }
      };

      const visible = (element: Element): boolean => {
        const html = element as HTMLElement;
        const rect = html.getBoundingClientRect();
        const style = window.getComputedStyle(html);
        return rect.width > 20 && rect.height > 20 && style.display !== 'none' && style.visibility !== 'hidden';
      };

      const bedWords = /(cama|camas|colch[o\u00f3]n|colchon|box|base|cabecera|almohada|pillow|sleep|dream|restonic|simmons|serta|sealy|olympia|facenco|indufoam|comfort life|therapedic|siesta|sue[n\u00f1]a|comfortlife)/i;
      const ignoreWords = /(telefono|tel[e\u00e9]fono|whatsapp|carrito|login|cuenta|favoritos|menu|categorias|filtrar por|ordenar por|cloudflare|5xx-error|rastrea|pedido|footer|newsletter|copyright)/i;
      const priceRegex = /Q\s*[0-9][0-9,]*(?:\.[0-9]{2})?/gi;

      const hasPrice = (text: string): boolean => {
        priceRegex.lastIndex = 0;
        const ok = priceRegex.test(text);
        priceRegex.lastIndex = 0;
        return ok;
      };

      const parsePrice = (value: string): number | null => {
        const match = value.match(/Q\s*([0-9][0-9,]*(?:\.[0-9]{2})?)/i);
        if (!match) return null;
        const parsed = Number(match[1].replace(/,/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
      };

      const formatPrice = (value: number | null): string => {
        if (value === null) return '';
        return `Q${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      };

      const imageHintsBed = (card: HTMLElement): boolean =>
        Array.from(card.querySelectorAll('img')).some((img) => {
          const image = img as HTMLImageElement;
          return bedWords.test(clean(image.alt || image.title || image.src));
        });

      const candidates = new Set<HTMLElement>();
      const cardSelectors = [
        'li.product',
        'ul.products > li',
        'article',
        '.product',
        '.product-card',
        '.product-item',
        '.woocommerce-LoopProduct-link',
        '[class*="producto"]',
        '[class*="Producto"]',
        '[class*="product"]',
        '[class*="Product"]',
        '[class*="card"]',
        '[class*="Card"]',
        '[class*="item"]',
        '[class*="Item"]',
        '[class*="grid"] > *',
        '[class*="products"] > *',
        '[class*="Products"] > *',
        '[class*="collection"] > *',
        'a[href*="/producto/"]',
        'a[href*="/product/"]'
      ];

      const addCandidate = (element: Element | null) => {
        if (!element) return;
        const html = element as HTMLElement;
        if (!visible(html)) return;
        const text = clean(html.innerText || html.textContent);
        if (!hasPrice(text)) return;
        if (!bedWords.test(text) && !imageHintsBed(html)) return;
        if (ignoreWords.test(text) && text.length > 1600) return;
        if (text.length > 3600) return;
        candidates.add(html);
      };

      for (const selector of cardSelectors) {
        document.querySelectorAll(selector).forEach(addCandidate);
      }

      const priceNodes = Array.from(document.querySelectorAll('body *')).filter((element) => {
        if (!visible(element)) return false;
        const text = clean((element as HTMLElement).innerText || element.textContent);
        return text.length > 0 && text.length <= 900 && hasPrice(text);
      });

      for (const node of priceNodes) {
        let current: Element | null = node;
        let best: HTMLElement | null = null;

        for (let depth = 0; current && depth < 10; depth += 1) {
          const html = current as HTMLElement;
          const text = clean(html.innerText || html.textContent);
          const priceCount = (text.match(priceRegex) ?? []).length;
          priceRegex.lastIndex = 0;
          const actionCount = (text.match(/(comprar|agregar|a[n\u00f1]adir|ver producto|cotizar)/gi) ?? []).length;
          const imageCount = html.querySelectorAll('img').length;

          if (depth > 0 && (actionCount > 1 || priceCount > 5 || imageCount > 3 || text.length > 3200)) {
            break;
          }

          if (hasPrice(text) && (bedWords.test(text) || imageHintsBed(html))) {
            best = html;
          }

          current = current.parentElement;
        }

        addCandidate(best);
      }

      const titleSelectors = [
        '.woocommerce-loop-product__title',
        '.product-title',
        '.product-name',
        '[class*="title"]',
        '[class*="Title"]',
        '[class*="name"]',
        '[class*="Name"]',
        'h1',
        'h2',
        'h3',
        'h4',
        'a[title]'
      ];

      const pickTitle = (card: HTMLElement): string => {
        for (const selector of titleSelectors) {
          const found = card.querySelector(selector);
          const title = clean(found?.getAttribute('title') || found?.textContent);
          if (title && bedWords.test(title) && !ignoreWords.test(title) && title.length <= 190) {
            return title;
          }
        }

        const imageTitle = Array.from(card.querySelectorAll('img'))
          .map((img) => clean((img as HTMLImageElement).alt || (img as HTMLImageElement).title))
          .find((title) => title && bedWords.test(title) && !ignoreWords.test(title) && title.length <= 190);
        if (imageTitle) return imageTitle;

        const rawLines = (card.innerText || card.textContent || '')
          .split(/\n+|Comprar|Agregar|A\u00f1adir|Oferta|Desde:|Vendedor:|Valido hasta/i)
          .map(clean)
          .filter(Boolean);

        const bestLine = rawLines
          .filter((line) => bedWords.test(line) && !hasPrice(line) && !ignoreWords.test(line) && line.length >= 4 && line.length <= 190)
          .sort((a, b) => Math.abs(a.length - 55) - Math.abs(b.length - 55))[0];

        return clean(bestLine);
      };

      const pickImage = (card: HTMLElement): { imageUrl: string; imageAlt: string } => {
        const images = Array.from(card.querySelectorAll('img')) as HTMLImageElement[];
        const img = images.find((image) => bedWords.test(clean(image.alt || image.title || image.src))) ?? images[0];
        return {
          imageUrl: img?.src || img?.getAttribute('data-src') || img?.getAttribute('data-lazy-src') || img?.getAttribute('data-original') || '',
          imageAlt: clean(img?.alt || img?.title)
        };
      };

      const pickUrl = (card: HTMLElement): string => {
        const anchors = Array.from(card.querySelectorAll('a[href]')) as HTMLAnchorElement[];
        const productAnchor = anchors.find((anchor) => {
          const href = anchor.getAttribute('href') ?? '';
          const text = clean(anchor.textContent || anchor.getAttribute('title'));
          return href && href !== '#' && !/cart|carrito|login|cuenta|favoritos|whatsapp/i.test(href) && (bedWords.test(text) || /producto|product|cama|colchon/i.test(href));
        }) ?? anchors.find((anchor) => (anchor.getAttribute('href') ?? '') !== '#');
        return absoluteUrl(productAnchor?.getAttribute('href'));
      };

      const rows: any[] = [];
      const seen = new Set<string>();

      for (const card of Array.from(candidates)) {
        const text = clean(card.innerText || card.textContent);
        if (ignoreWords.test(text) && !bedWords.test(text)) continue;

        const title = pickTitle(card);
        const priceMatches = Array.from(text.matchAll(priceRegex)).map((match) => match[0]);
        priceRegex.lastIndex = 0;
        const prices = priceMatches
          .map(parsePrice)
          .filter((price): price is number => price !== null && price > 0)
          .filter((price) => price >= 100 && price <= 100000);

        if (!title || prices.length === 0) continue;

        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const url = pickUrl(card);
        const key = `${title.toLowerCase()}|${url}|${minPrice}|${maxPrice}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const image = pickImage(card);
        const category = /almohada|pillow/i.test(title)
          ? 'Almohadas'
          : /base|box|cabecera|cama/i.test(title)
            ? 'Camas y bases'
            : 'Colchones';

        rows.push({
          source_site: args.sourceSite,
          brand: args.brandFallback,
          line: '',
          category,
          product_name: title,
          availability: /agotado|sin existencia|no disponible/i.test(text) ? 'Agotado' : 'Listado en tienda online',
          regular_price: formatPrice(maxPrice),
          sale_price: minPrice < maxPrice ? formatPrice(minPrice) : '',
          discount: '',
          installment: '',
          product_url: url,
          source_url: args.sourceUrl,
          headline: title,
          description: '',
          warranty: '',
          benefits: '',
          image_url: image.imageUrl,
          image_alt: image.imageAlt || title,
          scraped_at: args.scrapedAt
        });
      }

      const nextLinks = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
      const nextAnchor = nextLinks.find((anchor) => {
        const text = clean(anchor.textContent || anchor.getAttribute('aria-label') || anchor.className);
        const rel = clean(anchor.getAttribute('rel'));
        return /next|siguiente|proxima|pr[o\u00f3]xima/i.test(`${text} ${rel}`);
      });

      return {
        rows,
        nextUrl: absoluteUrl(nextAnchor?.getAttribute('href'))
      };
    }, { currentUrl, sourceUrl, sourceSite, brandFallback, scrapedAt });

    console.log(`${sourceSite}: pagina visual ${pageNumber} encontro ${extracted.rows.length} productos antes de filtros.`);

    for (const row of filterGuatemalaQuetzalRows(extracted.rows as CsvProduct[], sourceSite)) {
      const key = row.product_url || `${row.product_name}|${row.regular_price}|${row.sale_price}`;
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          ...row,
          source_url: sourceUrl,
          scraped_at: scrapedAt,
        });
      }
    }

    const nextUrl = extracted.nextUrl;
    if (!nextUrl || nextUrl === currentUrl || nextUrl === sourceUrl) {
      break;
    }

    currentUrl = nextUrl;
  }

  return Array.from(rowsByKey.values());
}

  return {
    scrapeGenericGuatemalaStore,
    scrapeVisualProductGrid,
    scrapePagedVisualProductGrid,
  };
}

export type VisualScraperEngine = ReturnType<typeof createVisualScraperEngine>;
