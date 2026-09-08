import type { Page } from 'playwright';
import { cleanProductText as cleanText, normalizeProductText as normalizeCatalogText, type CsvProduct } from '../../domain/product.js';

export const BEDS_DREAMS_SOURCE_URL = 'https://www.bedsndreams.com/';

export async function scrapeBedsDreams(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  void page;
  const collectionSources = [
    { handle: 'simmons', brand: 'Simmons' },
    { handle: 'indufoam', brand: 'Indufoam' },
    { handle: 'bases-electricas', brand: 'Bases Eléctricas' },
  ];
  const comfortSources = [
    { handle: 'confort-suave', line: 'Confort Suave' },
    { handle: 'confort-semi-firme', line: 'Confort Semi Firme' },
    { handle: 'confort-firme', line: 'Confort Firme' },
    { handle: 'confort-ortopedico', line: 'Confort Ortopédico' },
    { handle: 'confort-suave-indufoam', line: 'Confort Suave' },
    { handle: 'confort-semi-firme-indufoam', line: 'Confort Semi Firme' },
    { handle: 'confort-firme-indufoam', line: 'Confort Firme' },
    { handle: 'confort-ortopedico-indufoam', line: 'Confort Ortopédico' },
    { handle: 'confort-extra-firme', line: 'Confort Extra Firme' },
  ];

  const fetchShopifyCollection = async (handle: string): Promise<Array<Record<string, any>>> => {
    const url = new URL(`/collections/${handle}/products.json`, BEDS_DREAMS_SOURCE_URL);
    url.searchParams.set('limit', '250');
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; FACENCO-Catalog/1.0)',
      },
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      throw new Error(`Beds & Dreams coleccion ${handle} respondio HTTP ${response.status}.`);
    }
    const payload = await response.json() as { products?: Array<Record<string, any>> };
    return Array.isArray(payload.products) ? payload.products : [];
  };

  const comfortProducts = await Promise.all(
    comfortSources.map(async (source) => ({
      ...source,
      products: await fetchShopifyCollection(source.handle),
    })),
  );
  const comfortByProductId = new Map<string, Set<string>>();
  for (const source of comfortProducts) {
    for (const product of source.products) {
      const key = String(product.id ?? '');
      if (!key) continue;
      const lines = comfortByProductId.get(key) ?? new Set<string>();
      lines.add(source.line);
      comfortByProductId.set(key, lines);
    }
  }

  const inferComfort = (title: string, description: string, brand: string): string => {
    const text = normalizeCatalogText(`${title} ${description}`);
    if (brand === 'Bases Eléctricas') return 'Bases Eléctricas';
    if (/extra firm|extra firme/.test(text)) return 'Confort Extra Firme';
    if (/ortho|ortoped|back guard/.test(text)) return 'Confort Ortopédico';
    if (/medium|semi firm|semi firme/.test(text)) return 'Confort Semi Firme';
    if (/firm|firme/.test(text)) return 'Confort Firme';
    if (/plush|pillow top|soft|suave/.test(text)) return 'Confort Suave';
    return '';
  };
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

  const collectionProducts = await Promise.all(
    collectionSources.map(async (source) => ({
      ...source,
      products: await fetchShopifyCollection(source.handle),
    })),
  );
  const rowsByProductId = new Map<string, CsvProduct>();

  for (const source of collectionProducts) {
    for (const product of source.products) {
      const id = String(product.id ?? '');
      const title = cleanText(String(product.title ?? ''));
      if (!id || !title || !/(cama|colch[oó]n|colchon|base)/i.test(title)) continue;

      const variants = Array.isArray(product.variants) ? product.variants : [];
      const currentPrices = variants
        .map((variant: Record<string, unknown>) => Number(variant.price))
        .filter((value: number) => Number.isFinite(value) && value > 0);
      const comparePrices = variants
        .map((variant: Record<string, unknown>) => Number(variant.compare_at_price))
        .filter((value: number) => Number.isFinite(value) && value > 0);
      if (currentPrices.length === 0) continue;

      const hasDiscount = variants.some((variant: Record<string, unknown>) => {
        const current = Number(variant.price);
        const regular = Number(variant.compare_at_price);
        return Number.isFinite(current) && Number.isFinite(regular) && regular > current;
      });
      const explicitComfort = Array.from(comfortByProductId.get(id) ?? []);
      const description = cleanText(String(product.body_html ?? '').replace(/<[^>]+>/g, ' '));
      const line = explicitComfort.join(' / ') || inferComfort(title, description, source.brand);
      const image = Array.isArray(product.images) ? product.images[0] ?? {} : {};
      const productUrl = new URL(`/products/${String(product.handle ?? '')}`, BEDS_DREAMS_SOURCE_URL).toString();

      rowsByProductId.set(id, {
        source_site: 'Beds & Dreams',
        brand: source.brand,
        line,
        category: /base el[eé]ctrica/i.test(`${title} ${source.brand}`)
          ? 'Bases eléctricas'
          : /cama completa/i.test(title)
            ? 'Camas completas'
            : 'Colchones',
        product_name: title,
        availability: variants.some((variant: Record<string, unknown>) => variant.available !== false)
          ? 'Disponible'
          : 'Agotado',
        regular_price: formatPriceRange(comparePrices.length ? comparePrices : currentPrices),
        sale_price: hasDiscount ? formatPriceRange(currentPrices) : '',
        discount: hasDiscount ? 'Oferta' : '',
        installment: '',
        product_url: productUrl,
        source_url: BEDS_DREAMS_SOURCE_URL,
        headline: title,
        description,
        warranty: '',
        benefits: '',
        image_url: cleanText(String(image.src ?? '')),
        image_alt: title,
        scraped_at: scrapedAt,
      });
    }
  }

  const rows = Array.from(rowsByProductId.values());
  console.log(
    `Beds & Dreams API: Simmons=${collectionProducts[0].products.length}, Indufoam=${collectionProducts[1].products.length}, Bases Electricas=${collectionProducts[2].products.length}, total unico=${rows.length}.`,
  );
  return rows;
}
