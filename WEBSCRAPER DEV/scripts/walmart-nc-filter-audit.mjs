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

function canonicalProductUrl(value) {
  try {
    const url = new URL(value, `https://${host}`);
    if (url.protocol !== 'https:' || url.hostname !== host || !/\/p\/?$/.test(url.pathname)) return null;
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch { return null; }
}

function decodeGraphqlVariables(responseUrl) {
  const url = new URL(responseUrl);
  const extensions = JSON.parse(url.searchParams.get('extensions') || '{}');
  return JSON.parse(Buffer.from(extensions.variables || '', 'base64').toString('utf8'));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: 'es-NI' });
const report = { status: 'read_only_audit', databaseWrites: false, pagesLimit: maxPages, sources: {} };

try {
  for (const [sourceName, baseUrl] of Object.entries(sources)) {
    const products = new Map();
    const pageRows = [];
    let totalHint = null;
    let graphqlRecordCount = 0;
    let stopReason = 'pages_limit';

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const url = new URL(baseUrl);
      if (pageNumber === 1) url.searchParams.delete('page');
      else url.searchParams.set('page', String(pageNumber));

      let response;
      let graphqlResponse;
      try {
        let capturedGraphql = null;
        const pendingGraphql = page.waitForResponse((candidate) => (
          candidate.url().includes('/_v/segment/graphql/')
          && candidate.url().includes('operationName=productSearchV3')
        ), { timeout: 12_000 }).then((candidate) => {
          capturedGraphql = candidate;
          return candidate;
        }).catch(() => null);
        response = await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
        for (let attempt = 0; attempt < 16 && !capturedGraphql; attempt += 1) {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await page.waitForTimeout(350);
        }
        graphqlResponse = capturedGraphql || await pendingGraphql;
      } catch (error) {
        pageRows.push({ page: pageNumber, error: error instanceof Error ? error.message : String(error) });
        stopReason = 'navigation_error';
        break;
      }

      if (graphqlResponse?.ok()) {
        if (sourceName === 'camas_sin_filtros') {
          let variables;
          let extensions;
          let seed;
          try {
            const graphqlUrl = new URL(graphqlResponse.url());
            extensions = JSON.parse(graphqlUrl.searchParams.get('extensions') || '{}');
            variables = JSON.parse(Buffer.from(extensions.variables || '', 'base64').toString('utf8'));
            const seedResponse = await page.context().request.get(graphqlResponse.url(), { timeout: 45_000 });
            if (!seedResponse.ok()) throw new Error(`HTTP ${seedResponse.status()} al releer la consulta GraphQL.`);
            seed = await seedResponse.json();
          } catch (error) {
            pageRows.push({ page: 1, error: `No se pudo preparar la paginación GraphQL: ${error instanceof Error ? error.message : String(error)}` });
            stopReason = 'graphql_parse_error';
            break;
          }

          const reportedTotal = seed?.data?.productSearch?.recordsFiltered;
          const pageSize = variables.to - variables.from + 1;
          if (!Number.isSafeInteger(reportedTotal) || !Number.isSafeInteger(pageSize) || pageSize < 1) {
            pageRows.push({ page: 1, error: 'GraphQL no reportó total o rango utilizable.' });
            stopReason = 'graphql_shape_error';
            break;
          }

          totalHint = reportedTotal;
          const graphqlUrl = new URL(graphqlResponse.url());
          for (let graphqlPage = 0; graphqlPage < maxPages; graphqlPage += 1) {
            const from = graphqlPage * pageSize;
            if (from >= reportedTotal) { stopReason = 'reported_total_reached'; break; }
            const to = Math.min(from + pageSize - 1, reportedTotal - 1);
            const pageVariables = { ...variables, from, to };
            const pageExtensions = {
              ...extensions,
              variables: Buffer.from(JSON.stringify(pageVariables)).toString('base64'),
            };
            const pageUrl = new URL(graphqlUrl);
            pageUrl.searchParams.set('extensions', JSON.stringify(pageExtensions));

            let pageResponse;
            let productSearch;
            try {
              pageResponse = await page.context().request.get(pageUrl.toString(), { timeout: 45_000 });
              const payload = await pageResponse.json();
              productSearch = payload?.data?.productSearch;
            } catch (error) {
              pageRows.push({ page: graphqlPage + 1, requestFrom: from, requestTo: to,
                error: `No se pudo leer rango GraphQL: ${error instanceof Error ? error.message : String(error)}` });
              stopReason = 'graphql_parse_error';
              break;
            }

            if (!pageResponse.ok() || !productSearch || !Array.isArray(productSearch.products)) {
              pageRows.push({ page: graphqlPage + 1, requestFrom: from, requestTo: to,
                graphqlStatus: pageResponse.status(), error: 'Respuesta GraphQL sin lista de productos.' });
              stopReason = 'graphql_shape_error';
              break;
            }

            const pageProducts = productSearch.products;
            graphqlRecordCount += pageProducts.length;
            const pageUnique = new Set();
            for (const product of pageProducts) {
              const productUrl = canonicalProductUrl(product.link);
              if (!productUrl) continue;
              pageUnique.add(productUrl);
              if (!products.has(productUrl)) products.set(productUrl, {
                url: productUrl,
                productName: product.productName || '',
                brand: product.brand || '',
                categories: product.categories || [],
              });
            }
            const newUnique = [...pageUnique].filter((productUrl) => products.get(productUrl)?.firstSeenPage === undefined).length;
            for (const productUrl of pageUnique) products.get(productUrl).firstSeenPage = graphqlPage + 1;
            pageRows.push({
              page: graphqlPage + 1,
              source: 'productSearchV3',
              requestFrom: from,
              requestTo: to,
              productCount: pageProducts.length,
              uniqueOnPage: pageUnique.size,
              newUnique,
              recordsFiltered: productSearch.recordsFiltered,
              ...(graphqlPage === 0 ? {
                fullText: variables.fullText,
                selectedFacets: variables.selectedFacets || [],
              } : {}),
              graphqlStatus: pageResponse.status(),
            });

            if (!pageProducts.length) { stopReason = 'empty_graphql_page'; break; }
            if (graphqlRecordCount >= reportedTotal) { stopReason = 'reported_total_reached'; break; }
          }
          break;
        }

        let variables;
        let productSearch;
        try {
          variables = decodeGraphqlVariables(graphqlResponse.url());
          const replayResponse = await page.context().request.get(graphqlResponse.url(), { timeout: 45_000 });
          if (!replayResponse.ok()) throw new Error(`HTTP ${replayResponse.status()} al releer productSearchV3.`);
          const payload = await replayResponse.json();
          productSearch = payload?.data?.productSearch;
        } catch (error) {
          pageRows.push({ page: pageNumber, error: `No se pudo leer productSearchV3: ${error instanceof Error ? error.message : String(error)}` });
          stopReason = 'graphql_parse_error';
          break;
        }

        if (!productSearch || !Array.isArray(productSearch.products)) {
          pageRows.push({ page: pageNumber, graphqlStatus: graphqlResponse.status(), error: 'productSearchV3 no incluyó productos.' });
          stopReason = 'graphql_shape_error';
          break;
        }

        graphqlRecordCount += productSearch.products.length;
        const pageUnique = new Set();
        for (const product of productSearch.products) {
          const productUrl = canonicalProductUrl(product.link);
          if (!productUrl) continue;
          pageUnique.add(productUrl);
          if (!products.has(productUrl)) products.set(productUrl, {
            url: productUrl,
            productName: product.productName || '',
            brand: product.brand || '',
            categories: product.categories || [],
          });
        }
        const newUnique = [...pageUnique].filter((productUrl) => products.get(productUrl)?.firstSeenPage === undefined).length;
        for (const productUrl of pageUnique) {
          const product = products.get(productUrl);
          if (product.firstSeenPage === undefined) product.firstSeenPage = pageNumber;
        }
        totalHint = Number.isFinite(productSearch.recordsFiltered) ? productSearch.recordsFiltered : totalHint;
        pageRows.push({
          page: pageNumber,
          source: 'productSearchV3',
          requestFrom: variables.from,
          requestTo: variables.to,
          productCount: productSearch.products.length,
          uniqueOnPage: pageUnique.size,
          newUnique,
          recordsFiltered: productSearch.recordsFiltered,
          ...(pageNumber === 1 ? {
            fullText: variables.fullText,
            selectedFacets: variables.selectedFacets || [],
          } : {}),
          graphqlStatus: graphqlResponse.status(),
        });

        if (!productSearch.products.length) { stopReason = 'empty_graphql_page'; break; }
        if (newUnique === 0) { stopReason = 'page_repeated'; break; }
        if (Number.isFinite(totalHint) && graphqlRecordCount >= totalHint) { stopReason = 'reported_total_reached'; break; }
        continue;
      }

      await page.waitForTimeout(1_500);

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
        const productUrl = canonicalProductUrl(product.href);
        if (!productUrl) continue;
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

    const mode = pageRows[0]?.source || 'dom_fallback';
    report.sources[sourceName] = {
      startUrl: baseUrl,
      extractionMode: mode,
      pagesVisited: pageRows.length,
      graphqlRecordCount,
      totalUniqueProducts: products.size,
      duplicateProductOccurrences: Math.max(0, graphqlRecordCount - products.size),
      visibleTotalHint: totalHint,
      coverageAssessment: mode === 'productSearchV3'
        ? (graphqlRecordCount === totalHint ? 'matches_graphql_total' : 'does_not_match_graphql_total')
        : 'unverified_dom_only',
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
  const overlaps = [...all.entries()].filter(([, foundIn]) => foundIn.length > 1);
  const sourcePairIntersections = new Map();
  for (const [, foundIn] of overlaps) {
    for (let left = 0; left < foundIn.length; left += 1) {
      for (let right = left + 1; right < foundIn.length; right += 1) {
        const pair = [foundIn[left], foundIn[right]].sort().join(' <> ');
        sourcePairIntersections.set(pair, (sourcePairIntersections.get(pair) || 0) + 1);
      }
    }
  }
  report.combined = {
    sumOfPerSourceUnique: Object.values(report.sources).reduce((sum, source) => sum + source.totalUniqueProducts, 0),
    deduplicatedUniqueProducts: all.size,
    productsFoundInMultipleSources: overlaps.length,
    sourcePairIntersections: Object.fromEntries([...sourcePairIntersections.entries()].sort(([a], [b]) => a.localeCompare(b))),
    overlapSample: overlaps.slice(0, 20).map(([url, sourcesForProduct]) => ({ url, sources: sourcesForProduct })),
  };
} finally {
  await browser.close();
}

console.log(JSON.stringify(report, null, 2));
