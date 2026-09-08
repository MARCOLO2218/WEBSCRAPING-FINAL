import type { Page } from 'playwright';
import { cleanProductText as cleanText, normalizeProductText as normalizeCatalogText, type CsvProduct } from '../../domain/product.js';

export const SUENA_CENTER_SOURCE_URL = 'https://gt.camasuena.com/categorias/camas';
export const SUENA_CENTER_ALGOLIA_APP_ID = 'LP9ZU0LM0S';
export const SUENA_CENTER_ALGOLIA_INDEX = 'Prod_Suena_Online_GT_V1';
export const SUENA_CENTER_ALGOLIA_SEARCH_KEY = '132d6bf8c576cc05ecfc9af0f6e46e2c';
export const AMERICANA_2000_SOURCE_URL = 'https://americana2000.com/categoria-producto/camas/?am2k_attr_product_brand=facenco%2Cultra%2Ccomfort-life%2Colympia%2Csealy';
export const AMERICANA_2000_API_URL = 'https://americana2000.com/wp-json/wc/store/v1/products?category=328&per_page=100';

export async function scrapeSuenaCenterGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  void page;
  const apiUrl = `https://${SUENA_CENTER_ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${SUENA_CENTER_ALGOLIA_INDEX}/query`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Algolia-Application-Id': SUENA_CENTER_ALGOLIA_APP_ID,
      'X-Algolia-API-Key': SUENA_CENTER_ALGOLIA_SEARCH_KEY,
    },
    body: JSON.stringify({ query: '', hitsPerPage: 1000 }),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    throw new Error(`Suena Center API respondio HTTP ${response.status}.`);
  }

  const payload = await response.json() as { hits?: Array<Record<string, any>> };
  const hits = Array.isArray(payload.hits) ? payload.hits : [];
  const formatPriceRange = (values: number[]): string => {
    if (values.length === 0) return '';
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const format = (value: number) => `Q${value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    return minimum === maximum ? format(minimum) : `${format(minimum)} - ${format(maximum)}`;
  };
  const normalizeBrand = (value: unknown): string => {
    const brand = normalizeCatalogText(String(value ?? ''));
    if (brand === 'suena' || brand === 'sueÃ±a') return 'Sueña';
    if (brand === 'indufoam') return 'Indufoam';
    if (brand === 'simmons') return 'Simmons';
    return cleanText(String(value ?? '')) || 'Sueña Center';
  };
  const normalizeComfort = (value: unknown): string => {
    const comfort = normalizeCatalogText(String(value ?? '')).replace(/\s+/g, ' ');
    if (comfort === 'suave' || comfort === 'semi suave') return 'Confort Suave';
    if (comfort === 'semi firme') return 'Confort Semi-Firme';
    if (comfort === 'extra firme') return 'Confort Extra-Firme';
    if (comfort === 'firme') return 'Confort Firme';
    return cleanText(String(value ?? ''));
  };

  const rows: CsvProduct[] = hits
    .filter((product) =>
      normalizeCatalogText(String(product.group_level_one_name ?? '')) === 'camas'
      && Number(product.is_visible_in_store ?? 0) === 1
      && ['suena', 'sueÃ±a', 'indufoam', 'simmons'].includes(normalizeCatalogText(String(product.brand_name ?? ''))),
    )
    .map((product) => {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const regularPrices = variants
        .map((variant: Record<string, unknown>) => Number(variant.retail_price))
        .filter((value: number) => Number.isFinite(value) && value > 0);
      const offerPrices = variants
        .map((variant: Record<string, unknown>) => Number(variant.offer_price || variant.final_price))
        .filter((value: number) => Number.isFinite(value) && value > 0);
      const hasOffer = variants.some((variant: Record<string, unknown>) =>
        Number(variant.offer_price) > 0 && Number(variant.offer_price) < Number(variant.retail_price),
      );
      const title = cleanText(String(product.name ?? product.label ?? ''));
      const slug = cleanText(String(product.slug ?? ''));
      const description = cleanText(String(product.description ?? '').replace(/<[^>]+>/g, ' '));
      const discount = Number(product.discount ?? 0);

      return {
        source_site: 'Suena Center Guatemala',
        brand: normalizeBrand(product.brand_name),
        line: normalizeComfort(product.comfort),
        category: 'Camas',
        product_name: title,
        availability: Number(product.available_balance ?? 0) > 0 ? 'Disponible' : 'Agotado',
        regular_price: formatPriceRange(regularPrices.length ? regularPrices : [Number(product.retail_price)]),
        sale_price: hasOffer
          ? formatPriceRange(offerPrices.length ? offerPrices : [Number(product.final_price)])
          : '',
        discount: discount > 0 ? `${Math.round(discount)}%` : '',
        installment: '',
        product_url: new URL(`/products/${slug}`, SUENA_CENTER_SOURCE_URL).toString(),
        source_url: SUENA_CENTER_SOURCE_URL,
        headline: title,
        description,
        warranty: cleanText(String(product.guarantee ?? '')),
        benefits: '',
        image_url: cleanText(String(product.image_url ?? '')),
        image_alt: title,
        scraped_at: scrapedAt,
      } satisfies CsvProduct;
    });

  console.log(`Suena Center Guatemala API: ${rows.length} camas visibles con marca y confort.`);
  return rows;
}


export async function scrapeAmericana2000Gt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  void page;
  const response = await fetch(AMERICANA_2000_API_URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; FACENCO-Catalog/1.0)',
    },
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    throw new Error(`Americana 2000 API respondio HTTP ${response.status}.`);
  }

  const products = await response.json() as Array<Record<string, any>>;
  const allowedBrands = new Set(['facenco', 'ultra', 'comfort life', 'olympia', 'sealy']);
  const cleanHtml = (value: unknown): string =>
    cleanText(String(value ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' '));
  const formatApiPrice = (value: unknown, minorUnit: number): string => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return '';
    return `Q${(amount / (10 ** minorUnit)).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const rows: CsvProduct[] = [];
  for (const product of products) {
    const brands = (Array.isArray(product.brands) ? product.brands : [])
      .map((brand: Record<string, unknown>) => cleanText(String(brand.name ?? '')))
      .filter((brand: string) => allowedBrands.has(normalizeCatalogText(brand)));
    if (brands.length === 0) continue;

    const prices = product.prices ?? {};
    if (String(prices.currency_code ?? '').toUpperCase() !== 'GTQ') continue;
    const minorUnit = Number(prices.currency_minor_unit ?? 2);
    const regularPrice = formatApiPrice(prices.regular_price, minorUnit);
    const currentPrice = formatApiPrice(prices.price, minorUnit);
    const salePrice = String(prices.sale_price ?? '') && prices.sale_price !== prices.regular_price
      ? formatApiPrice(prices.sale_price, minorUnit)
      : '';
    const categories = (Array.isArray(product.categories) ? product.categories : [])
      .map((category: Record<string, unknown>) => cleanText(String(category.name ?? '')))
      .filter(Boolean);
    const line = categories.find((category: string) => normalizeCatalogText(category) !== 'camas') ?? '';
    const image = Array.isArray(product.images) ? product.images[0] ?? {} : {};

    rows.push({
      source_site: 'Americana 2000 Guatemala',
      brand: brands.join(' / '),
      line,
      category: 'Camas',
      product_name: cleanText(String(product.name ?? '')),
      availability: product.is_in_stock === false ? 'Agotado' : 'Disponible',
      regular_price: regularPrice || currentPrice,
      sale_price: salePrice || (currentPrice !== regularPrice ? currentPrice : ''),
      discount: product.on_sale ? 'Oferta' : '',
      installment: '',
      product_url: cleanText(String(product.permalink ?? '')),
      source_url: AMERICANA_2000_SOURCE_URL,
      headline: cleanText(String(product.name ?? '')),
      description: cleanHtml(product.short_description || product.description),
      warranty: '',
      benefits: '',
      image_url: cleanText(String(image.src ?? '')),
      image_alt: cleanText(String(image.alt ?? product.name ?? '')),
      scraped_at: scrapedAt,
    });
  }

  console.log(`Americana 2000 Guatemala API: ${products.length} camas recibidas, ${rows.length} con las marcas seleccionadas.`);
  return rows;
}
