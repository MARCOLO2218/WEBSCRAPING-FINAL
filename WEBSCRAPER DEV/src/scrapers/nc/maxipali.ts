import type { Page } from 'playwright';
import type { CsvProduct } from '../../domain/product.js';

const host = 'maxipali.com.ni';

export const MAXIPALI_NC = {
  key: 'maxipali-nc',
  name: 'Maxi Pali Nicaragua',
  country: 'NC',
  currency: 'NIO',
  operational: false,
  sources: {
    camas: `https://${host}/busquedas?query=cama`,
    colchones: `https://${host}/busquedas?query=colchon`,
  },
  expected: { camas: 1, colchones: 3, accesorios: 2 },
  products: {
    cama: `https://${host}/precio-bajo-siempre-pali-y-maxi-pali-nicaragua/hogar-y-electronica/decoracion-y-muebles/cama-super-descanso-2-pillow-mat-740115040065`,
    cubrecamaImperial: `https://${host}/precio-bajo-siempre-pali-y-maxi-pali-nicaragua/hogar-y-electronica/jardineria-y-exteriores/cubrecama-imperial-estampada-740616800386`,
    cubrecamaMatrimonial: `https://${host}/precio-bajo-siempre-pali-y-maxi-pali-nicaragua/hogar-y-electronica/jardineria-y-exteriores/cubrecama-matrimonial-estampada-740616800387`,
    colchonInflador: `https://${host}/precio-bajo-siempre-pali-y-maxi-pali-nicaragua/hogar-y-electronica/jardineria-y-exteriores/colchon-matrimonial-ozark-t-c-inflador-692038860638`,
    colchonMatrimonial: `https://${host}/precio-bajo-siempre-pali-y-maxi-pali-nicaragua/hogar-y-electronica/jardineria-y-exteriores/colchon-matrimonial-ozark-t-191x137x22cm-692038862020`,
    colchonQueen: `https://${host}/precio-bajo-siempre-pali-y-maxi-pali-nicaragua/hogar-y-electronica/jardineria-y-exteriores/colchon-queen-ozark-trail-con-inflador-692038863858`,
  },
} as const;

export type MaxipaliNcKind = 'cama' | 'colchon' | 'accesorio';

export function isMaxipaliNcUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host
      && !url.username && !url.password && !url.port;
  } catch {
    return false;
  }
}

export function maxipaliNcProductId(value: string): string {
  if (!isMaxipaliNcUrl(value)) throw new Error('Producto fuera de Maxi Pali Nicaragua.');
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  const match = url.pathname.match(/-(\d{12,14})\/?$/);
  if (!match) throw new Error('Producto Maxi Pali sin identificador publicado.');
  return match[1];
}

export function classifyMaxipaliNcProduct(name: string): MaxipaliNcKind | null {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (!normalized || /limpia\s*colchon|camara/.test(normalized)) return null;
  if (/cubrecama/.test(normalized)) return 'accesorio';
  if (/colchon/.test(normalized)) return 'colchon';
  if (/\bcama\b/.test(normalized)) return 'cama';
  return null;
}

export function canonicalMaxipaliNcProductUrl(value: string): string {
  maxipaliNcProductId(value);
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

export function dedupeMaxipaliNcProductUrls(values: readonly string[]): string[] {
  const byId = new Map<string, string>();
  for (const value of values) {
    const canonical = canonicalMaxipaliNcProductUrl(value);
    byId.set(maxipaliNcProductId(canonical), canonical);
  }
  return [...byId.values()].sort();
}

export type MaxipaliNcScraperDependencies = {
  navigate: (page: Page, url: string) => Promise<void>;
  extractProduct: (page: Page, productUrl: string, scrapedAt: string) => Promise<CsvProduct | null>;
};

export function createMaxipaliNicaraguaScraper(dependencies: MaxipaliNcScraperDependencies) {
  return async function scrapeMaxipaliNc(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
    const rows = new Map<string, CsvProduct>();
    for (const productUrl of Object.values(MAXIPALI_NC.products)) {
      await dependencies.navigate(page, productUrl);
      const row = await dependencies.extractProduct(page, productUrl, scrapedAt);
      if (!row) continue;
      let canonical: string;
      try {
        canonical = canonicalMaxipaliNcProductUrl(row.product_url || productUrl);
      } catch {
        continue;
      }
      rows.set(maxipaliNcProductId(canonical), {
        ...row,
        source_site: MAXIPALI_NC.name,
        product_url: canonical,
        source_url: productUrl,
        scraped_at: scrapedAt,
      });
    }
    return [...rows.values()];
  };
}
