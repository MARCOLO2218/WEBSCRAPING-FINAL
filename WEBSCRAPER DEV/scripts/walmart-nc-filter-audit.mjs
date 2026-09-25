import { chromium } from 'playwright';

const host = 'www.walmart.com.ni';
const sources = {
  camas_sin_filtros: `https://${host}/camas?map=ft`,
  colchones_categoria_blancos_marcas_seleccionadas: `https://${host}/camas?_q=camas&fuzzy=0&initialMap=accesscontrollist,ft&initialQuery=walmartniwm774/camas&map=category-1,category-2,category-3,brand,brand,brand,brand,brand,brand,brand,brand,brand,ft&operator=and&query=/articulos-para-el-hogar/colchones-y-blancos/colchones/american-dream/disney-minnie/hotel-style/king-koil/mainstays/mainstays-kids/masterbed/olympia/we-bare-bears/camas&searchState`,
  colchones_sin_categoria_padre_kingkoil_masterbed_olympia: `https://${host}/camas?_q=camas&fuzzy=0&initialMap=accesscontrollist,ft&initialQuery=walmartniwm774/camas&map=category-1,category-3,brand,brand,brand,ft&operator=and&query=/articulos-para-el-hogar/colchones/king-koil/masterbed/olympia/camas&searchState`,
  colchones_blancos_marcas_seleccionadas: `https://${host}/camas?_q=camas&fuzzy=0&initialMap=accesscontrollist,ft&initialQuery=walmartniwm774/camas&map=category-2,brand,brand,brand,brand,brand,brand,brand,brand,ft&operator=and&query=/colchones-y-blancos/disney-minnie/hotel-style/king-koil/mainstays/mainstays-kids/masterbed/olympia/we-bare-bears/camas&searchState`,
  accesorios_protectores_sabanas: `https://${host}/camas?_q=camas&fuzzy=0&initialMap=accesscontrollist,ft&initialQuery=walmartniwm774/camas&map=category-1,category-2,category-3,brand,brand,brand,brand,brand,brand,ft&operator=and&query=/articulos-para-el-hogar/colchones-y-blancos/protectores-y-sabanas/american-dream/disney-minnie/hotel-style/mainstays/mainstays-kids/we-bare-bears/camas&searchState`,
};

const maxPages = Number(process.env.WALMART_NC_AUDIT_MAX_PAGES || 20);
if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) {
  throw new Error('WALMART_NC_AUDIT_MAX_PAGES debe estar entre 1 y 100.');
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: 'es-NI' });
const report = { status: 'read_only_audit', databaseWrites: false, pagesLimit: maxPages, sources: {} };

try {
  for (const [sourceName, baseUrl] of Object.entries(sources)) {
    const products = new Map();
    const pageRows = [];
    let totalHint = null;
    let stopReason = 'pages_limit';

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const url = new URL(baseUrl);
      if (pageNumber === 1) url.searchParams.delete('page');
      else url.searchParams.set('page', String(pageNumber));

      let response;
      try {
        response = await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
        await page.waitForTimeout(1_500);
      } catch (error) {
        pageRows.push({ page: pageNumber, error: error instanceof Error ? error.message : String(error) });
        stopReason = 'navigation_error';
        break;
      }

      const observed = await page.evaluate(() => {
        const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
        const isProductUrl = (value) => {
          try {
            const url = new URL(value, location.href);
            return url.hostname === 'www.walmart.com.ni' && /\/p\/?$/.test(url.pathname);
          } catch { return false; }
        };
        const links = [...document.querySelectorAll('a[href]')]
          .map((anchor) => ({
            href: anchor.href,
            text: clean(anchor.innerText || anchor.textContent),
            parentText: clean(anchor.closest('article, .product-item, [class*="product-item"], [class*="productCard"], [class*="ProductCard"], [class*="galleryItem"]')?.innerText),
          }))
          .filter((item) => isProductUrl(item.href));
        const body = clean(document.body?.innerText);
        const counts = [...body.matchAll(/\b([\d,]+)\s+productos?\b/gi)]
          .map((match) => Number(match[1].replace(/,/g, ''))).filter(Number.isFinite);
        const next = [...document.querySelectorAll('a[rel="next"], a[aria-label*="iguiente" i], a[title*="iguiente" i]')]
          .map((anchor) => anchor.href).find(Boolean) || '';
        const facetText = [...document.querySelectorAll('input[type="checkbox"]:checked')]
          .map((input) => clean(input.closest('label')?.innerText || input.parentElement?.innerText || input.value))
          .filter(Boolean).slice(0, 40);
        return {
          title: document.title,
          currentUrl: location.href,
          links,
          productLikeLinks: [...document.querySelectorAll('a[href]')]
            .filter((anchor) => /\/p(?:[/?#]|$)/.test(anchor.href)).slice(0, 12)
            .map((anchor) => ({ href: anchor.href, text: clean(anchor.innerText || anchor.textContent) })),
          totalHint: counts[0] ?? null,
          next,
          facetText,
          bodyStart: body.slice(0, 500),
        };
      });

      if (!response?.ok()) {
        pageRows.push({ page: pageNumber, httpStatus: response?.status() ?? null, productLinks: 0 });
        stopReason = 'http_error';
        break;
      }

      if (observed.totalHint !== null) totalHint = observed.totalHint;
      const pageUnique = new Set();
      for (const product of observed.links) {
        const canonical = new URL(product.href);
        canonical.search = '';
        canonical.hash = '';
        canonical.pathname = canonical.pathname.replace(/\/+$/, '');
        const productUrl = canonical.toString();
        pageUnique.add(productUrl);
        if (!products.has(productUrl)) products.set(productUrl, { url: productUrl, linkText: product.text, cardText: product.parentText });
      }
      const newUnique = [...pageUnique].filter((productUrl) => products.get(productUrl)?.firstSeenPage === undefined).length;
      pageRows.push({
        page: pageNumber,
        productLinks: observed.links.length,
        uniqueOnPage: pageUnique.size,
        newUnique,
        ...(pageNumber === 1 ? {
          title: observed.title,
          currentUrl: observed.currentUrl,
          totalHint,
          selectedFacetsVisible: observed.facetText,
          candidateProductLinks: observed.productLikeLinks,
          bodyStart: observed.bodyStart,
        } : {}),
        nextLink: observed.next || null,
        httpStatus: response.status(),
      });
      for (const productUrl of pageUnique) {
        const product = products.get(productUrl);
        if (product.firstSeenPage === undefined) product.firstSeenPage = pageNumber;
      }

      if (!observed.links.length) { stopReason = 'no_product_links'; break; }
      if (pageNumber > 1 && newUnique === 0) { stopReason = 'page_repeated'; break; }
    }

    report.sources[sourceName] = {
      startUrl: baseUrl,
      pagesVisited: pageRows.length,
      totalUniqueProducts: products.size,
      visibleTotalHint: totalHint,
      stopReason,
      pages: pageRows,
      sample: [...products.values()].slice(0, 5),
      productUrls: [...products.keys()].sort(),
    };
  }

  const all = new Map();
  for (const [sourceName, source] of Object.entries(report.sources)) {
    for (const productUrl of source.productUrls) {
      if (!all.has(productUrl)) all.set(productUrl, []);
      all.get(productUrl).push(sourceName);
    }
  }
  report.combined = {
    sumOfPerSourceUnique: Object.values(report.sources).reduce((sum, source) => sum + source.totalUniqueProducts, 0),
    deduplicatedUniqueProducts: all.size,
    productsFoundInMultipleSources: [...all.entries()].filter(([, foundIn]) => foundIn.length > 1)
      .map(([url, foundIn]) => ({ url, sources: foundIn })),
  };
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
