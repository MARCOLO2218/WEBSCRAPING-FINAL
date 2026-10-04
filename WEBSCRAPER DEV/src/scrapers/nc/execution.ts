import type { CsvProduct } from '../../domain/product.js';

export const NC_EXECUTION_STORES = {
  'la-curacao': { id: 'la-curacao-nc', name: 'La Curacao Nicaragua', host: 'www.lacuracaonline.com' },
  'el-gallo': { id: 'el-gallo-nc', name: 'El Gallo mas Gallo Nicaragua', host: 'www.elgallomasgallo.com.ni' },
  siman: { id: 'siman-nc', name: 'Siman Nicaragua', host: 'ni.siman.com' },
  walmart: { id: 'walmart-nc', name: 'Walmart Nicaragua', host: 'www.walmart.com.ni' },
  maxipali: { id: 'maxipali-nc', name: 'Maxi Pali Nicaragua', host: 'maxipali.com.ni' },
} as const;
export type NcStoreKey = keyof typeof NC_EXECUTION_STORES;
export type NcExecutionProduct = CsvProduct & {
  country: 'NC'; currency: 'NIO'; store_id: string; product_id: string;
  regular_price_value: number | null; sale_price_value: number | null;
};

function nioPrice(text: string): number | null {
  if (!text.trim()) return null;
  const match = text.trim().match(/^C\$\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)$/);
  const value = match ? Number(match[1].replace(/,/g, '')) : NaN;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Precio NIO inválido: ${text}`);
  return value;
}

export function normalizeNcProducts(store: NcStoreKey, rows: readonly (CsvProduct & { product_id?: string })[]): NcExecutionProduct[] {
  const definition = NC_EXECUTION_STORES[store];
  const products = new Map<string, NcExecutionProduct>();
  for (const row of rows) {
    const url = new URL(row.product_url);
    const source = new URL(row.source_url);
    for (const value of [url, source]) {
      if (value.protocol !== 'https:' || value.hostname !== definition.host || value.port || value.username || value.password
        || (store === 'la-curacao' && !value.pathname.startsWith('/nicaragua/'))) throw new Error('Procedencia NC inválida');
    }
    if (row.source_site !== definition.name || !row.product_name.trim()) throw new Error('Identidad de producto NC inválida');
    url.hash = ''; url.search = '';
    const regular = nioPrice(row.regular_price);
    const sale = nioPrice(row.sale_price);
    products.set(url.href, {
      ...row, product_url: url.href, product_name: row.product_name.trim(),
      country: 'NC', currency: 'NIO', store_id: definition.id,
      product_id: row.product_id?.trim() || url.href,
      regular_price_value: regular, sale_price_value: sale,
    });
  }
  return [...products.values()];
}

export type NcStoreOutput = {
  rows: (CsvProduct & { product_id?: string })[];
  coverage: 'verified_category' | 'bounded_sources';
  diagnostics?: unknown;
};

export async function executeNcReadOnly(
  requested: readonly string[],
  runners: Record<NcStoreKey, () => Promise<NcStoreOutput>>,
  onProgress?: (event: { store: string; status: string; count?: number }) => void,
) {
  const stores = requested.length ? [...new Set(requested)] : Object.keys(NC_EXECUTION_STORES);
  for (const store of stores) if (!(Object.hasOwn(NC_EXECUTION_STORES, store))) throw new Error(`Tienda NC desconocida: ${store}`);
  const results = [];
  for (const store of stores as NcStoreKey[]) {
    const started = Date.now();
    onProgress?.({ store, status: 'running' });
    try {
      const output = await runners[store]();
      const products = normalizeNcProducts(store, output.rows);
      results.push({ store, status: products.length ? 'ok' : 'empty', coverage: output.coverage,
        count: products.length, priced: products.filter(row => row.regular_price_value !== null || row.sale_price_value !== null).length,
        seconds: (Date.now() - started) / 1000, diagnostics: output.diagnostics, products });
    } catch (error) {
      results.push({ store, status: 'error', seconds: (Date.now() - started) / 1000,
        error: error instanceof Error ? error.message : String(error), products: [] });
    }
    const result = results.at(-1)!;
    onProgress?.({ store, status: result.status, count: result.products.length });
  }
  return { mode: 'read_only', country: 'NC', currency: 'NIO', databaseWrites: false,
    status: results.every(result => result.status === 'ok') ? 'ok' : 'partial', stores: results };
}
