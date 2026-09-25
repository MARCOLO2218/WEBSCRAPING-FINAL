import type { Page } from 'playwright';
import { cleanProductText } from '../../domain/product.js';

// Preparación SPEC-039. No registrado en workers ni persistencia GT.
const base = 'https://www.lacuracaonline.com';
export const LA_CURACAO_NC = {
  key: 'la-curacao-nc', name: 'La Curacao Nicaragua',
  country: 'NC', currency: 'NIO', operational: false,
  // Categoría superior: verificar cobertura separadamente de los tamaños de camas.
  categoryUrl: `${base}/nicaragua/c/muebles/camas-y-colchones`,
  categoryReferenceUrl: `${base}/nicaragua/c/muebles/camas-y-colchones?product_list_order=product_price_asc`,
  sources: {
    principal: `${base}/nicaragua/c/muebles/camas-y-colchones/camas`,
    individuales: `${base}/nicaragua/camas-individuales`,
    queen: `${base}/nicaragua/camas-queen`,
    king: `${base}/nicaragua/camas-king`,
    matrimoniales: `${base}/nicaragua/camas-matrimoniales`,
  },
} as const;

export type CuracaoNcSource = keyof typeof LA_CURACAO_NC.sources;
export type SourceCoverage = {
  source: CuracaoNcSource;
  // Identidades consistentes de producto (SKU o URL canónica), no títulos.
  productIds: readonly string[];
  // Cuando exista, productUrl permite enlazar un SKU publicado con otra fuente
  // que sólo publique URL. productIds y products conservan el mismo orden.
  products?: readonly { productId: string; productUrl: string }[];
  complete: boolean;
};

type ProductSet = {
  productIds: readonly string[];
  products?: readonly { productId: string; productUrl: string }[];
};

function comparisonIdentities(set: ProductSet): string[] {
  if (set.products && set.products.length !== set.productIds.length) {
    throw new Error('La lista de productos no coincide con las identidades declaradas.');
  }
  return set.productIds.map((rawId, index) => {
    const id = rawId.trim();
    if (!id) throw new Error('Identidad de producto vacía.');
    const product = set.products?.[index];
    if (!product) return id;
    if (product.productId.trim() !== id) {
      throw new Error('La identidad del producto no coincide con su posición.');
    }
    const rawUrl = product.productUrl.trim();
    if (!rawUrl) return id;
    let url: URL;
    try { url = new URL(rawUrl); } catch { throw new Error('URL canónica de producto inválida.'); }
    if (!isNicaraguaCuracaoUrl(url.href) || !url.pathname.endsWith('/p')) {
      throw new Error('URL canónica de producto ajena a La Curacao Nicaragua.');
    }
    url.search = '';
    url.hash = '';
    return url.href;
  });
}

/**
 * Parses one Nicaragua Córdoba price as displayed by La Curacao (C$).
 * Deliberately rejects unmarked values and text containing multiple prices so
 * callers must resolve regular vs. sale price from verified DOM fields first.
 */
export function parseCuracaoNcPrice(value: string | null | undefined): number | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  const match = text.match(/^C\$\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)$/i);
  if (!match) return null;
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

export function compareCuracaoNcCategory(
  category: ProductSet & { complete: boolean },
  observations: readonly SourceCoverage[],
) {
  const beds = compareCuracaoNcCoverage(observations);
  const categoryIds = new Set(comparisonIdentities(category));
  const bedIds = new Set(observations.flatMap(comparisonIdentities));
  const onlyCategory = [...categoryIds].filter(id => !bedIds.has(id)).sort();
  const onlyBeds = [...bedIds].filter(id => !categoryIds.has(id)).sort();
  const complete = category.complete && beds.complete;
  const sourcesById = new Map<string, Set<string>>();
  for (const id of categoryIds) sourcesById.set(id, new Set(['categoria']));
  for (const entry of beds.productSources) {
    const sources = sourcesById.get(entry.productId) ?? new Set<string>();
    for (const source of entry.sources) sources.add(source);
    sourcesById.set(entry.productId, sources);
  }
  return { complete, onlyCategory, onlyBeds,
    categoryCoversBeds: complete ? onlyBeds.length === 0 : null,
    equivalent: complete ? onlyCategory.length === 0 && onlyBeds.length === 0 : null,
    productSources: [...sourcesById].sort(([left], [right]) => left.localeCompare(right))
      .map(([productId, sources]) => ({
        productId,
        sources: [...sources].sort((left, right) => left.localeCompare(right)),
      })) };
}

export function isNicaraguaCuracaoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.lacuracaonline.com'
      && !url.username && !url.password && !url.port
      && url.pathname.startsWith('/nicaragua/');
  } catch { return false; }
}

export function compareCuracaoNcCoverage(observations: readonly SourceCoverage[]) {
  const sources = Object.keys(LA_CURACAO_NC.sources) as CuracaoNcSource[];
  const bySource = new Map<CuracaoNcSource, SourceCoverage>();
  for (const observation of observations) {
    if (!sources.includes(observation.source) || bySource.has(observation.source)) {
      throw new Error('Fuente desconocida o repetida.');
    }
    if (observation.productIds.some(id => !id.trim())) throw new Error('Identidad de producto vacía.');
    bySource.set(observation.source, observation);
  }
  const incompleteSources = sources.filter(source => bySource.get(source)?.complete !== true);
  const mainEntry = bySource.get('principal');
  const main = new Set(mainEntry ? comparisonIdentities(mainEntry) : []);
  const sizes = new Set(sources.filter(source => source !== 'principal')
    .flatMap(source => {
      const entry = bySource.get(source);
      return entry ? comparisonIdentities(entry) : [];
    }));
  const onlyMain = [...main].filter(id => !sizes.has(id)).sort();
  const onlySizes = [...sizes].filter(id => !main.has(id)).sort();
  const productSources = new Map<string, Set<CuracaoNcSource>>();
  for (const source of sources) {
    const entry = bySource.get(source);
    for (const productId of new Set(entry ? comparisonIdentities(entry) : [])) {
      const membership = productSources.get(productId) ?? new Set<CuracaoNcSource>();
      membership.add(source);
      productSources.set(productId, membership);
    }
  }
  return {
    complete: incompleteSources.length === 0,
    equivalent: incompleteSources.length ? null : onlyMain.length === 0 && onlySizes.length === 0,
    incompleteSources, onlyMain, onlySizes,
    shared: [...main].filter(id => sizes.has(id)).sort(),
    uniqueTotal: new Set([...main, ...sizes]).size,
    productSources: [...productSources].sort(([left], [right]) => left.localeCompare(right))
      .map(([productId, membership]) => ({
        productId,
        sources: sources.filter(source => membership.has(source)),
      })),
  };
}

export type CuracaoNcProductCandidate = {
  /** Stable SKU or canonical product URL resolved by the site adapter. */
  productId: string;
  productName: string;
  productUrl: string;
  sourceUrl: string;
  regularPrice?: string | null;
  salePrice?: string | null;
  discount?: string | null;
  installment?: string | null;
  availability?: string | null;
  brand?: string | null;
  category?: string | null;
  firmness?: string | null;
  plazas?: string | null;
  color?: string | null;
  material?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
};

/** Country-aware candidate kept separate from the legacy Guatemala CSV model. */
export type CuracaoNcProduct = {
  storeId: typeof LA_CURACAO_NC.key;
  country: typeof LA_CURACAO_NC.country;
  currency: typeof LA_CURACAO_NC.currency;
  productId: string;
  productName: string;
  productUrl: string;
  sourceUrl: string;
  regularPriceText: string;
  regularPrice: number | null;
  salePriceText: string;
  salePrice: number | null;
  discount: string;
  installment: string;
  availability: string;
  brand: string;
  category: string;
  firmness: string;
  plazas: string;
  color: string;
  material: string;
  imageUrl: string;
  imageAlt: string;
};

const productSourcePaths = new Set([
  ...Object.values(LA_CURACAO_NC.sources),
  LA_CURACAO_NC.categoryUrl,
].map((value) => {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}));

function isAllowedSourceUrl(value: string): boolean {
  if (!isNicaraguaCuracaoUrl(value)) return false;
  const url = new URL(value);
  return productSourcePaths.has(`${url.origin}${url.pathname}`);
}

function priceFields(value: string | null | undefined, field: string): { text: string; amount: number | null } {
  const text = cleanProductText(value);
  if (!text) return { text: '', amount: null };
  const amount = parseCuracaoNcPrice(text);
  if (amount === null) throw new Error(`${field} debe ser un único importe C$.`);
  return { text, amount };
}

/** Validate and normalize NC data without converting it to legacy CsvProduct. */
export function createCuracaoNcProduct(candidate: CuracaoNcProductCandidate): CuracaoNcProduct {
  const productId = cleanProductText(candidate.productId);
  const productName = cleanProductText(candidate.productName);
  const productUrl = cleanProductText(candidate.productUrl);
  const sourceUrl = cleanProductText(candidate.sourceUrl);
  if (!productId) throw new Error('La identidad del producto NC es obligatoria.');
  if (!productName) throw new Error('El nombre del producto NC es obligatorio.');
  if (!isNicaraguaCuracaoUrl(productUrl)) throw new Error('La URL de producto debe pertenecer a Nicaragua.');
  if (!isAllowedSourceUrl(sourceUrl)) throw new Error('La procedencia no pertenece a una fuente registrada de La Curacao NC.');

  const regular = priceFields(candidate.regularPrice, 'Precio regular');
  const sale = priceFields(candidate.salePrice, 'Precio oferta');
  let imageUrl = cleanProductText(candidate.imageUrl);
  if (imageUrl) {
    try {
      const parsedImageUrl = new URL(imageUrl, sourceUrl);
      if (!['https:', 'http:'].includes(parsedImageUrl.protocol)) throw new Error('protocolo');
      imageUrl = parsedImageUrl.toString();
    } catch {
      throw new Error('La URL de imagen no es válida.');
    }
  }

  return {
    storeId: LA_CURACAO_NC.key,
    country: LA_CURACAO_NC.country,
    currency: LA_CURACAO_NC.currency,
    productId,
    productName,
    productUrl,
    sourceUrl,
    regularPriceText: regular.text,
    regularPrice: regular.amount,
    salePriceText: sale.text,
    salePrice: sale.amount,
    discount: cleanProductText(candidate.discount),
    installment: cleanProductText(candidate.installment),
    availability: cleanProductText(candidate.availability),
    brand: cleanProductText(candidate.brand),
    category: cleanProductText(candidate.category),
    firmness: cleanProductText(candidate.firmness),
    plazas: cleanProductText(candidate.plazas),
    color: cleanProductText(candidate.color),
    material: cleanProductText(candidate.material),
    imageUrl,
    imageAlt: cleanProductText(candidate.imageAlt),
  };
}

export type CuracaoNcPage<T extends { productId: string }> = {
  items: readonly T[];
  /** Null only when the page reader verified that no next page exists. */
  nextUrl: string | null;
  /** False when the page's product extraction was partial or uncertain. */
  complete: boolean;
  /** Total anunciado por el DOM; opcional para lectores sin contador verificado. */
  declaredTotal?: number | null;
};

export type CuracaoNcPaginationResult<T> = {
  items: T[];
  pagesVisited: string[];
  productPages: Array<{ productId: string; pages: string[] }>;
  duplicateProducts: number;
  complete: boolean;
  failedUrl: string | null;
  reason: 'finished' | 'partial_page' | 'empty_page' | 'read_error' | 'invalid_next_url' | 'cycle' | 'max_pages' | 'total_changed' | 'count_mismatch';
};

function pageKey(value: string): string {
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}

/**
 * A fail-closed page collector. A store adapter supplies page contents and the
 * verified next-page URL; this function handles route validation, loops,
 * incomplete pages, the safety limit and identity deduplication.
 */
export async function collectCuracaoNcPages<T extends { productId: string }>(
  startUrl: string,
  readPage: (url: string) => Promise<CuracaoNcPage<T>>,
  maxPages: number,
): Promise<CuracaoNcPaginationResult<T>> {
  if (!isNicaraguaCuracaoUrl(startUrl)) throw new Error('URL inicial fuera de La Curacao Nicaragua.');
  if (!Number.isInteger(maxPages) || maxPages < 1) throw new Error('maxPages debe ser un entero positivo.');

  const visited = new Set<string>();
  const pagesVisited: string[] = [];
  const byId = new Map<string, T>();
  const pagesByProduct = new Map<string, string[]>();
  let duplicateProducts = 0;
  let expectedTotal: number | undefined;
  let url = new URL(startUrl).toString();
  const finish = (
    complete: boolean,
    reason: CuracaoNcPaginationResult<T>['reason'],
    failedUrl: string | null = null,
  ) => ({
    items: [...byId.values()],
    pagesVisited,
    productPages: [...pagesByProduct].map(([productId, pages]) => ({ productId, pages })),
    duplicateProducts,
    complete,
    failedUrl,
    reason,
  });

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const key = pageKey(url);
    if (visited.has(key)) {
      return finish(false, 'cycle');
    }
    visited.add(key);
    pagesVisited.push(url);

    let page: CuracaoNcPage<T>;
    try {
      page = await readPage(url);
    } catch {
      return finish(false, 'read_error', url);
    }
    if (!page.complete) {
      return finish(false, 'partial_page');
    }
    if (page.declaredTotal !== undefined && page.declaredTotal !== null) {
      if (!Number.isSafeInteger(page.declaredTotal) || page.declaredTotal < 1) {
        return finish(false, 'count_mismatch', url);
      }
      if (expectedTotal !== undefined && expectedTotal !== page.declaredTotal) {
        return finish(false, 'total_changed', url);
      }
      expectedTotal = page.declaredTotal;
    } else if (expectedTotal !== undefined) {
      return finish(false, 'count_mismatch', url);
    }
    for (const item of page.items) {
      const productId = item.productId.trim();
      if (!productId) throw new Error('Identidad de producto vacía durante la paginación.');
      if (byId.has(productId)) duplicateProducts += 1;
      else byId.set(productId, item);
      const pages = pagesByProduct.get(productId) ?? [];
      if (pages.at(-1) !== url) pages.push(url);
      pagesByProduct.set(productId, pages);
    }
    if (page.nextUrl === null) {
      if (expectedTotal !== undefined && byId.size !== expectedTotal) {
        return finish(false, 'count_mismatch', url);
      }
      return page.items.length === 0
        ? finish(false, 'empty_page', url)
        : finish(true, 'finished');
    }
    if (!isNicaraguaCuracaoUrl(page.nextUrl)) {
      return finish(false, 'invalid_next_url');
    }
    const nextKey = pageKey(page.nextUrl);
    if (visited.has(nextKey)) {
      return finish(false, 'cycle');
    }
    if (page.items.length === 0) {
      return finish(false, 'empty_page', url);
    }
    if (pageNumber === maxPages - 1) {
      return finish(false, 'max_pages');
    }
    url = new URL(page.nextUrl).toString();
  }

  return finish(false, 'max_pages');
}

export type CuracaoNcDomPage = CuracaoNcPage<CuracaoNcProduct> & {
  issues: string[];
  warnings: string[];
  cardCount: number;
  pageNumber: number;
  pageSize: number | null;
  declaredTotal: number | null;
  filters: string[];
};

const listingSourcePaths = new Set([
  LA_CURACAO_NC.categoryUrl, ...Object.values(LA_CURACAO_NC.sources),
].map(value => new URL(value).pathname));

export function normalizeCuracaoNcListingUrl(value: string): URL {
  if (!isNicaraguaCuracaoUrl(value)) throw new Error('Fuente fuera de Nicaragua.');
  const url = new URL(value);
  if (!listingSourcePaths.has(url.pathname)) throw new Error('Fuente NC no registrada.');
  // Un filtro de marca/tamaño no prueba la cobertura del listado completo.
  for (const key of url.searchParams.keys()) {
    if (!['p', 'product_list_order'].includes(key) || url.searchParams.getAll(key).length !== 1) {
      throw new Error('Parámetros de listado no validados.');
    }
  }
  url.hash = '';
  if (url.searchParams.get('p') === '1') url.searchParams.delete('p');
  url.searchParams.sort();
  return url;
}

function positiveInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/** Lee un DOM ya cargado. No navega, hace clic, ejecuta scripts del sitio ni persiste. */
export async function readCuracaoNcDom(
  page: Page,
  sourceUrl: string,
  options: { savedHtml?: boolean } = {},
): Promise<CuracaoNcDomPage> {
  const source = normalizeCuracaoNcListingUrl(sourceUrl);
  if (!options.savedHtml && normalizeCuracaoNcListingUrl(page.url()).href !== source.href) {
    throw new Error('La página cargada no corresponde a la fuente solicitada.');
  }
  const pageNumber = positiveInteger(source.searchParams.get('p') ?? '1');
  if (!pageNumber) throw new Error('Número de página inválido.');

  const raw = await page.evaluate(() => {
    const text = (node: Element | null) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const grids = [...document.querySelectorAll('.products-grid > .product-items, .mgz-grid.mgz-product-items')];
    const cards = grids.flatMap(grid => [...grid.querySelectorAll('.product-item-info')]);
    const offers: Array<{ url: string; currency: string; price: string; availability: string }> = [];
    let invalidJson = false;
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const data = JSON.parse(script.textContent ?? ''); // Datos, nunca ejecutar el script.
        for (const product of Array.isArray(data) ? data : [data]) {
          if (product?.['@type'] !== 'Product' || typeof product.url !== 'string') continue;
          for (const offer of Array.isArray(product.offers) ? product.offers : []) {
            offers.push({ url: product.url, currency: String(offer?.priceCurrency ?? ''),
              price: String(offer?.price ?? ''), availability: String(offer?.availability ?? '') });
          }
        }
      } catch { invalidJson = true; }
    }
    return {
      grids: grids.length,
      offers, invalidJson,
      filters: [...document.querySelectorAll('.filter-options-title')].map(text),
      toolbars: [...document.querySelectorAll('.toolbar-products')].map(toolbar => ({
        numbers: [...toolbar.querySelectorAll('.toolbar-amount .toolbar-number')].map(text),
        sizes: [...toolbar.querySelectorAll('[data-role="limiter"].selected')]
          .map(e => e.getAttribute('data-value') ?? ''),
        current: [...toolbar.querySelectorAll('.pages-items .current .page > span:not(.label)')].map(text),
        next: [...toolbar.querySelectorAll('.pages-item-next a.next')].map(e => e.getAttribute('href') ?? ''),
      })),
      cards: cards.map(card => ({
        names: [...card.querySelectorAll('a.product-item-link')].map(e => ({ text: text(e), url: e.getAttribute('href') ?? '' })),
        skus: [...card.querySelectorAll('form[data-product-sku]')].map(e => e.getAttribute('data-product-sku')?.trim() ?? ''),
        prices: [...card.querySelectorAll('.price-box [data-price-type]')].map(e => ({
          type: e.getAttribute('data-price-type'), amount: e.getAttribute('data-price-amount'),
          text: text(e.querySelector('.price')),
          special: Boolean(e.closest('.special-price')), old: Boolean(e.closest('.old-price')),
        })),
        discount: text(card.querySelector('.special-price .discount')),
        image: card.querySelector('img.product-image-photo')?.getAttribute('src') ?? '',
        imageAlt: card.querySelector('img.product-image-photo')?.getAttribute('alt') ?? '',
      })),
    };
  });

  const issues: string[] = [];
  const warnings = new Set<string>();
  const items: CuracaoNcProduct[] = [];
  const skus = new Set<string>();
  const urls = new Set<string>();
  if (raw.invalidJson) warnings.add('jsonld_invalido');
  if (raw.grids !== 1 || raw.cards.length === 0) issues.push('listado_ausente_o_ambiguo');
  for (const [index, card] of raw.cards.entries()) {
    try {
      if (card.names.length !== 1 || card.skus.length > 1) throw new Error('identidad_ausente_o_ambigua');
      const productUrl = new URL(card.names[0].url, source);
      if (!isNicaraguaCuracaoUrl(productUrl.href) || !productUrl.pathname.endsWith('/p') || productUrl.search) {
        throw new Error('url_producto_invalida');
      }
      productUrl.hash = '';
      const productId = card.skus[0] || productUrl.href;
      if (!card.skus[0]) warnings.add('identidad_por_url_canonica_sin_sku');
      if (skus.has(productId) || urls.has(productUrl.href)) throw new Error('producto_duplicado_en_pagina');
      const final = card.prices.filter(p => p.type === 'finalPrice');
      const old = card.prices.filter(p => p.type === 'oldPrice');
      if (final.length !== 1 || old.length > 1 || card.prices.length !== final.length + old.length) {
        throw new Error('precios_ausentes_o_ambiguos');
      }
      for (const price of card.prices) {
        const amount = parseCuracaoNcPrice(price.text);
        if (amount === null || !price.amount || !/^\d+(?:\.\d+)?$/.test(price.amount)
          || amount !== Number(price.amount)) throw new Error('precio_texto_atributo_inconsistente');
      }
      if (Boolean(old.length) !== final[0].special || (old.length && (!old[0].old
        || Number(old[0].amount) < Number(final[0].amount)))) throw new Error('oferta_inconsistente');

      const offers = raw.offers.filter(offer => offer.url === productUrl.href);
      let availability = '';
      if (offers.length) {
        if (offers.length !== 1 || offers[0].currency !== 'NIO' || !/^\d+(?:\.\d+)?$/.test(offers[0].price)
          || Number(offers[0].price) !== Number(final[0].amount)) throw new Error('oferta_jsonld_inconsistente');
        if (/^https:\/\/schema\.org\/[A-Za-z]+$/.test(offers[0].availability)) availability = offers[0].availability;
      }

      let imageUrl = '';
      if (card.image) {
        // Guardar página reescribe src a *_files. No inventar una URL pública.
        if ((options.savedHtml && !/^https?:\/\//i.test(card.image)) || /_files[\/\\]/i.test(card.image)) {
          warnings.add('imagenes_locales_sin_url_publica');
        } else {
          const image = new URL(card.image, source);
          if (!['https:', 'http:'].includes(image.protocol) || image.username || image.password) {
            warnings.add('imagen_no_publica');
          } else imageUrl = image.href;
        }
      }
      items.push(createCuracaoNcProduct({
        productId, productName: card.names[0].text,
        productUrl: productUrl.href, sourceUrl: source.href,
        regularPrice: old.length ? old[0].text : final[0].text,
        salePrice: old.length ? final[0].text : '', discount: card.discount,
        imageUrl, imageAlt: card.imageAlt, availability,
        // Marca, cuotas y atributos de ficha no aparecen en las tarjetas.
      }));
      skus.add(productId);
      urls.add(productUrl.href);
    } catch (error) {
      issues.push(`tarjeta_${index + 1}:${error instanceof Error ? error.message : 'invalida'}`);
    }
  }

  const toolbar = raw.toolbars[0];
  const declaredTotal = positiveInteger(toolbar?.numbers[1]);
  const displayed = positiveInteger(toolbar?.numbers[0]);
  const pageSize = positiveInteger(toolbar?.sizes[0]);
  let nextUrl: string | null = null;
  if (!toolbar || raw.toolbars.some(value => JSON.stringify(value) !== JSON.stringify(toolbar))) {
    issues.push('controles_paginacion_ausentes_o_discrepantes');
  }
  if (!toolbar || toolbar.numbers.length !== 2 || toolbar.sizes.length !== 1 || !declaredTotal || !displayed || !pageSize) {
    issues.push('conteos_paginacion_no_verificados');
  } else {
    const lastPage = Math.ceil(declaredTotal / pageSize);
    // Algunas páginas publican menos tarjetas que el tamaño seleccionado; el
    // contador observado avanza por los elementos realmente mostrados.
    const displayedThrough = Math.min((pageNumber - 1) * pageSize + raw.cards.length, declaredTotal);
    if (pageNumber > lastPage || raw.cards.length > pageSize || displayed !== displayedThrough) {
      issues.push('conteo_tarjetas_inconsistente');
    }
    if (!(lastPage === 1 && toolbar.current.length === 0)
      && (toolbar.current.length !== 1 || positiveInteger(toolbar.current[0]) !== pageNumber)) {
      issues.push('pagina_actual_inconsistente');
    }
    if (pageNumber < lastPage) {
      if (toolbar.next.length !== 1) issues.push('siguiente_ausente_o_ambiguo');
      else {
        try {
          const next = normalizeCuracaoNcListingUrl(new URL(toolbar.next[0], source).href);
          const expected = new URL(source);
          expected.searchParams.set('p', String(pageNumber + 1));
          expected.searchParams.sort();
          if (next.href !== expected.href) throw new Error('siguiente_fuera_de_secuencia');
          nextUrl = next.href;
        } catch { issues.push('enlace_siguiente_invalido'); }
      }
    } else if (toolbar.next.length) issues.push('siguiente_tras_ultima_pagina');
  }
  return {
    items, nextUrl, complete: issues.length === 0, issues, warnings: [...warnings],
    cardCount: raw.cards.length, pageNumber, pageSize, declaredTotal, filters: raw.filters,
  };
}

export type CuracaoNcProductDomResult = {
  product: CuracaoNcProduct | null;
  complete: boolean;
  issues: string[];
  warnings: string[];
  canonicalUrl: string | null;
};

function normalizedProductUrl(value: string): URL {
  if (!isNicaraguaCuracaoUrl(value)) throw new Error('La URL de producto debe pertenecer a Nicaragua.');
  const url = new URL(value);
  if (!url.pathname.endsWith('/p') || url.search || url.hash) throw new Error('URL de producto no validada.');
  return url;
}

function normalizedSourceUrl(value: string): URL {
  return normalizeCuracaoNcListingUrl(value);
}

/** Lee una ficha ya cargada o guardada. No navega, ejecuta scripts ni persiste. */
export async function readCuracaoNcProductDom(
  page: Page,
  productUrl: string,
  sourceUrl: string,
  options: { savedHtml?: boolean } = {},
): Promise<CuracaoNcProductDomResult> {
  const expectedUrl = normalizedProductUrl(productUrl);
  const source = normalizedSourceUrl(sourceUrl);
  if (!options.savedHtml) {
    try {
      if (normalizedProductUrl(page.url()).href !== expectedUrl.href) throw new Error();
    } catch {
      throw new Error('La página cargada no corresponde al producto solicitado.');
    }
  }

  const raw = await page.evaluate(() => {
    const text = (node: Element | null) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const products: Array<{ url: string; name: string; brand: string; price: string; offers: Array<{
      url: string; currency: string; price: string; availability: string;
    }> }> = [];
    let invalidJson = false;
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(script.textContent ?? '');
        for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
          if (item?.['@type'] !== 'Product' || typeof item.url !== 'string') continue;
          const offers = (Array.isArray(item.offers) ? item.offers : item.offers ? [item.offers] : [])
            .map((offer: Record<string, unknown>) => ({
              url: String(offer?.url ?? item.url), currency: String(offer?.priceCurrency ?? ''),
              price: String(offer?.price ?? ''), availability: String(offer?.availability ?? ''),
            }));
          products.push({ url: item.url, name: String(item.name ?? ''),
            brand: String(typeof item.brand === 'string' ? item.brand : item.brand?.name ?? ''),
            price: String(item.price ?? ''), offers });
        }
      } catch { invalidJson = true; }
    }
    const main = document.querySelector('.product-info-main');
    const galleryImages = document.querySelectorAll('.fotorama__stage img');
    const mainImages = [...(galleryImages.length ? galleryImages : document.querySelectorAll('.gallery-placeholder__image'))];
    const rows = [...document.querySelectorAll('table.additional-attributes tr')].map(row => ({
      label: text(row.querySelector('th, td:first-child')),
      value: text(row.querySelector('td:last-child')),
    }));
    const installmentNode = document.querySelector('.product-info-main .zri__infoPrefix');
    const installment = text(installmentNode?.parentElement ?? null);
    return {
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
      headings: [...document.querySelectorAll('.container-primary-info-pdp h1.page-title')].map(text),
      skus: [...document.querySelectorAll('.product-info-main form[data-product-sku]')]
        .map(form => form.getAttribute('data-product-sku')?.trim() ?? ''),
      prices: [...document.querySelectorAll('.product-info-main .price-box [data-price-type]')].map(node => ({
        type: node.getAttribute('data-price-type') ?? '', text: text(node.querySelector('.price')),
        amount: node.getAttribute('data-price-amount') ?? '',
        special: Boolean(node.closest('.special-price')), old: Boolean(node.closest('.old-price')),
      })),
      discounts: [...document.querySelectorAll('.product-info-main .discount')].map(text),
      brands: [...document.querySelectorAll('.container-primary-info-pdp .product-item-brand-title')].map(text),
      rows, images: mainImages.map(image => ({ src: image.getAttribute('src') ?? '', alt: image.getAttribute('alt') ?? '' })),
      products, invalidJson, installment,
      mainFound: Boolean(main),
    };
  });

  const issues: string[] = [];
  const warnings = new Set<string>();
  let product: CuracaoNcProduct | null = null;
  let canonicalUrl: string | null = null;
  try {
    if (!raw.mainFound || raw.headings.length !== 1 || !raw.headings[0]) throw new Error('ficha_ausente_o_ambigua');
    if (raw.skus.length !== 1 || !raw.skus[0]) throw new Error('sku_ausente_o_ambiguo');
    if (raw.canonical) {
      try {
        const canonical = normalizedProductUrl(new URL(raw.canonical, expectedUrl).href);
        canonicalUrl = canonical.href;
        if (canonical.href !== expectedUrl.href) throw new Error();
      } catch { throw new Error('canonical_no_coincide'); }
    } else throw new Error('canonical_ausente');

    const final = raw.prices.filter(price => price.type === 'finalPrice');
    const old = raw.prices.filter(price => price.type === 'oldPrice');
    if (final.length !== 1 || old.length > 1 || raw.prices.length !== final.length + old.length) {
      throw new Error('precios_ausentes_o_ambiguos');
    }
    for (const price of raw.prices) {
      const amount = parseCuracaoNcPrice(price.text);
      if (amount === null || !/^\d+(?:\.\d+)?$/.test(price.amount) || amount !== Number(price.amount)) {
        throw new Error('precio_texto_atributo_inconsistente');
      }
    }
    if (Boolean(old.length) !== final[0].special || (old.length && (!old[0].old
      || Number(old[0].amount) < Number(final[0].amount)))) throw new Error('oferta_dom_inconsistente');

    const matchingProducts = raw.products.filter(item => normalizedProductUrl(new URL(item.url, expectedUrl).href).href === expectedUrl.href);
    if (raw.invalidJson) warnings.add('jsonld_invalido');
    if (matchingProducts.length !== 1) throw new Error('producto_jsonld_ausente_o_ambiguo');
    const jsonProduct = matchingProducts[0];
    if (jsonProduct.name && jsonProduct.name !== raw.headings[0]) throw new Error('nombre_jsonld_inconsistente');
    if (jsonProduct.price && (!/^\d+(?:\.\d+)?$/.test(jsonProduct.price)
      || Number(jsonProduct.price) !== Number((old.length ? old[0] : final[0]).amount))) {
      throw new Error('precio_referencia_jsonld_inconsistente');
    }
    const offers = jsonProduct.offers.filter(offer => new URL(offer.url, expectedUrl).href === expectedUrl.href);
    if (offers.length !== 1 || offers[0].currency !== 'NIO' || !/^\d+(?:\.\d+)?$/.test(offers[0].price)
      || Number(offers[0].price) !== Number(final[0].amount)) throw new Error('oferta_jsonld_inconsistente');
    const availability = /^https:\/\/schema\.org\/[A-Za-z]+$/.test(offers[0].availability) ? offers[0].availability : '';

    const rowMap = new Map<string, string>();
    for (const row of raw.rows) {
      const key = row.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      if (['marca', 'plazas', 'color', 'material', 'nivel de firmeza', 'firmeza', 'tipo de producto'].includes(key)) {
        if (rowMap.has(key) && rowMap.get(key) !== row.value) throw new Error(`atributo_${key.replace(/\s/g, '_')}_ambiguo`);
        rowMap.set(key, row.value);
      }
    }
    const brands = [...raw.brands, rowMap.get('marca') ?? '', jsonProduct.brand].filter(Boolean);
    if (new Set(brands).size > 1) throw new Error('marca_inconsistente');
    const sku = raw.skus[0];
    const sourceSku = expectedUrl.pathname.match(/-(\d+)\/p$/)?.[1];
    if (sourceSku && sourceSku !== sku) throw new Error('sku_url_inconsistente');

    let imageUrl = '';
    if (raw.images.length !== 1) warnings.add('imagen_principal_ausente_o_ambigua');
    else if (raw.images[0].src) {
      const src = raw.images[0].src;
      if (/\.\/?[^/]*_files[\\/]/i.test(src) || (options.savedHtml && !/^https?:\/\//i.test(src))) {
        warnings.add('imagen_local_sin_url_publica');
      } else {
        const image = new URL(src, expectedUrl);
        if (!['https:', 'http:'].includes(image.protocol) || image.username || image.password) warnings.add('imagen_no_publica');
        else imageUrl = image.href;
      }
    }
    let installment = '';
    if (raw.installment) {
      const match = raw.installment.match(/hasta\s+(\d+)\s+cuotas?\s+de\s*(C\$\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)/i);
      if (match) installment = raw.installment.replace(/de\s*(C\$)/i, 'de $1');
      else warnings.add('cuotas_no_verificables');
    }

    product = createCuracaoNcProduct({
      productId: sku, productName: raw.headings[0], productUrl: expectedUrl.href, sourceUrl: source.href,
      regularPrice: old.length ? old[0].text : final[0].text,
      salePrice: old.length ? final[0].text : '', discount: raw.discounts.length === 1 ? raw.discounts[0] : '',
      installment, availability, brand: brands[0] ?? '', category: rowMap.get('tipo de producto') ?? '',
      firmness: rowMap.get('nivel de firmeza') ?? rowMap.get('firmeza') ?? '', plazas: rowMap.get('plazas') ?? '',
      color: rowMap.get('color') ?? '', material: rowMap.get('material') ?? '', imageUrl,
      imageAlt: raw.images.length === 1 ? raw.images[0].alt : '',
    });
  } catch (error) {
    issues.push(error instanceof Error ? error.message : 'ficha_invalida');
  }
  return { product, complete: issues.length === 0 && product !== null, issues, warnings: [...warnings], canonicalUrl };
}

export type CuracaoNcSavedPage = {
  url: string;
  sha256: string;
  page: CuracaoNcDomPage;
};

/** Contrasta la URL grabada por el navegador cuando existe; no ejecuta el HTML. */
export function checkCuracaoNcSavedUrl(html: string, sourceUrl: string): boolean {
  const expected = normalizeCuracaoNcListingUrl(sourceUrl).href;
  const saved = html.match(/<!--\s*saved from url=\(\d+\)([^\r\n]*?)\s*-->/i);
  if (!saved) return false; // Fixture reducido u otro método de guardado: procedencia manual.
  if (normalizeCuracaoNcListingUrl(saved[1].trim()).href !== expected) {
    throw new Error('La URL grabada en el HTML no coincide con la URL declarada.');
  }
  return true;
}

/** Combina exclusivamente capturas aportadas. No navega ni certifica el sitio vivo. */
export async function reviewCuracaoNcSavedPages(startUrl: string, samples: readonly CuracaoNcSavedPage[]) {
  const start = normalizeCuracaoNcListingUrl(startUrl);
  if (start.searchParams.has('p')) throw new Error('La revisión debe iniciar en página 1.');
  const byUrl = new Map<string, CuracaoNcSavedPage>();
  for (const sample of samples) {
    const url = normalizeCuracaoNcListingUrl(sample.url);
    const scope = new URL(url);
    scope.searchParams.delete('p');
    if (scope.href !== start.href) throw new Error('Las capturas deben pertenecer a la misma fuente y orden.');
    if (byUrl.has(url.href)) throw new Error('URL de captura repetida.');
    if (!/^[a-f0-9]{64}$/.test(sample.sha256)) throw new Error('Huella SHA-256 inválida.');
    byUrl.set(url.href, sample);
  }

  const inspected = new Set<string>();
  const skuUrls = new Map<string, string>();
  const urlSkus = new Map<string, string>();
  const identityConflicts: Array<{ url: string; productId: string; productUrl: string }> = [];
  let missingSavedUrl: string | null = null;
  const collected = await collectCuracaoNcPages(start.href, async requested => {
    const key = normalizeCuracaoNcListingUrl(requested).href;
    const sample = byUrl.get(key);
    if (!sample) {
      missingSavedUrl = key;
      throw new Error('Falta la captura requerida.');
    }
    inspected.add(key);
    const result = sample.page;
    const expectedNumber = Number(new URL(key).searchParams.get('p') ?? 1);
    if (result.pageNumber !== expectedNumber || !result.declaredTotal
      || result.items.some(item => normalizeCuracaoNcListingUrl(item.sourceUrl).href !== key)) {
      return { ...result, complete: false };
    }
    if (!result.complete) return result;
    for (const item of result.items) {
      if ((skuUrls.has(item.productId) && skuUrls.get(item.productId) !== item.productUrl)
        || (urlSkus.has(item.productUrl) && urlSkus.get(item.productUrl) !== item.productId)) {
        identityConflicts.push({ url: key, productId: item.productId, productUrl: item.productUrl });
      }
      skuUrls.set(item.productId, item.productUrl);
      urlSkus.set(item.productUrl, item.productId);
    }
    return identityConflicts.length ? { ...result, complete: false } : result;
  }, Math.max(1, samples.length + 1));

  const unvisitedSavedUrls = [...byUrl.keys()].filter(url => !inspected.has(url));
  const complete = collected.complete && unvisitedSavedUrls.length === 0;
  const reason = missingSavedUrl ? 'missing_saved_page'
    : identityConflicts.length ? 'identity_conflict'
      : collected.complete && unvisitedSavedUrls.length ? 'unused_saved_pages' : collected.reason;
  return {
    ...collected, complete, reason,
    mode: 'saved_pages_offline' as const,
    sourceUrl: start.href,
    sourceCoverageComplete: complete,
    declaredTotal: byUrl.get(start.href)?.page.declaredTotal ?? null,
    missingSavedUrl, unvisitedSavedUrls, identityConflicts,
    evidence: [...byUrl].map(([url, sample]) => ({
      url, sha256: sample.sha256, inspected: inspected.has(url),
      pageNumber: sample.page.pageNumber, cardCount: sample.page.cardCount,
      extractedCount: sample.page.items.length, complete: sample.page.complete,
      issues: sample.page.issues, warnings: sample.page.warnings,
    })),
  };
}
