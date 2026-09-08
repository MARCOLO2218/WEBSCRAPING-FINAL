import type { Page } from 'playwright';
import type { CsvProduct } from '../../domain/product.js';
import type { VisualScraperEngine } from '../shared/visual-engine.js';

export const SIMAN_GT_SOURCE_URL = 'https://gt.siman.com/search?_q=camas&refinements=W3siYXR0cmlidXRlIjoicXVlcnkiLCJyZWZpbmVtZW50cyI6W3siYXR0cmlidXRlIjoicXVlcnkiLCJ2YWx1ZSI6ImNhbWFzIn1dfV0';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createSimanGuatemalaScraper(engine: VisualScraperEngine) {
  const scrapeGenericGuatemalaStore = engine.scrapeGenericGuatemalaStore;

function simanUrlWithPage(baseUrl: string, pageNumber: number): string {
  if (pageNumber <= 1) return baseUrl;
  const url = new URL(baseUrl);
  url.searchParams.set('page', String(pageNumber));
  return url.toString();
}

async function scrapeSimanGt(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  const rowsByKey = new Map<string, CsvProduct>();
  const maxPages = 8;
  const pageTimeoutMs = 90_000;

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const pageUrl = simanUrlWithPage(SIMAN_GT_SOURCE_URL, pageNumber);
    console.log('Siman Guatemala: leyendo pagina ' + pageNumber + ' de ' + maxPages + '...');

    let pageTimeoutHandle: NodeJS.Timeout | undefined;
    let pageRows: CsvProduct[];
    try {
      const pageTimeout = new Promise<never>((_, reject) => {
        pageTimeoutHandle = setTimeout(() => {
          reject(new Error(`Siman Guatemala: pagina ${pageNumber} excedio 90 segundos.`));
        }, pageTimeoutMs);
      });
      pageRows = await Promise.race([
        scrapeGenericGuatemalaStore(
          page,
          scrapedAt,
          pageUrl,
          'Siman Guatemala',
          'Siman',
        ),
        pageTimeout,
      ]);
    } catch (error) {
      if (rowsByKey.size === 0) throw error;
      console.log(
        `ADVERTENCIA: Siman Guatemala conservara ${rowsByKey.size} productos parciales `
        + `porque la pagina ${pageNumber} no termino: ${errorMessage(error)}`,
      );
      break;
    } finally {
      if (pageTimeoutHandle) clearTimeout(pageTimeoutHandle);
    }

    console.log('Siman Guatemala: pagina ' + pageNumber + ' genero ' + pageRows.length + ' productos utiles.');

    for (const row of pageRows) {
      const key = (row.product_url || (row.product_name + '|' + row.sale_price + '|' + row.regular_price)).toLowerCase();
      if (key && !rowsByKey.has(key)) {
        rowsByKey.set(key, row);
      }
    }

    if (pageNumber > 1 && pageRows.length === 0) {
      console.log('Siman Guatemala: pagina ' + pageNumber + ' no devolvio productos utiles. Se detiene paginacion.');
      break;
    }
  }

  const rows = Array.from(rowsByKey.values());
  console.log('Siman Guatemala: total unico despues de paginar=' + rows.length);
  return rows;
}

  return scrapeSimanGt;
}
