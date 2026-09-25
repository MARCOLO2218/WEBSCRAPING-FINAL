import { chromium, type Page } from 'playwright';
import ExcelJS from 'exceljs';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { getStoreRegistrationDifferences } from './config/store-catalog.js';
import { buildStoreQualityWarning, getStoreRetryMinimum } from './config/store-rules.js';
import {
  cleanProductText as cleanText,
  normalizeProductText as normalizeCatalogText,
  parseGtqPriceRange as parsePriceRange,
  type CsvProduct,
} from './domain/product.js';
import { saveProductsToPostgres } from './persistence/postgres.js';
import { createGuatemalaScraperRegistry } from './scrapers/gt/registry.js';
import { scrapeAmericana2000Gt, scrapeSuenaCenterGt } from './scrapers/gt/api-stores.js';
import { createGuatemalaPagedVisualStores } from './scrapers/gt/paged-visual-stores.js';
import { createMaxGuatemalaScraper } from './scrapers/gt/max.js';
import { createWalmartGuatemalaScraper } from './scrapers/gt/walmart.js';
import { createSimanGuatemalaScraper } from './scrapers/gt/siman.js';
import { createGuatemalaCardStores } from './scrapers/gt/card-stores.js';
import { scrapeBedsDreams } from './scrapers/gt/beds-dreams.js';
import { createFurnitureCityGuatemalaScraper } from './scrapers/gt/furniture-city.js';
import { createOlympiaLaColchoneriaGuatemalaScrapers } from './scrapers/gt/olympia-la-colchoneria.js';
import { createFacencoGuatemalaScraper } from './scrapers/gt/facenco.js';
import { createGuatemalaVisualStores } from './scrapers/gt/visual-stores.js';
import { createVisualScraperEngine } from './scrapers/shared/visual-engine.js';
import type { ProductSelectorConfig, StoreScraper } from './scrapers/types.js';

const envFile = existsSync('.env') ? '.env' : undefined;
if (envFile) {
  loadEnv({ path: envFile });
}

// URLs de origen.
// Si solo cambia la URL de una tienda ya existente, modifica estas constantes.
// Si agregas una tienda nueva, tambien debes crear su funcion scrape... y llamarla en main().
// Cambia aqui la carpeta o el nombre de los archivos generados.
const OUTPUT_FILE = resolve('output/comparacion_colchones.csv');
const OUTPUT_XLSX_FILE = resolve('output/comparacion_colchones.xlsx');

const columns: Array<keyof CsvProduct> = [
  'source_site',
  'brand',
  'line',
  'category',
  'product_name',
  'availability',
  'regular_price',
  'sale_price',
  'discount',
  'installment',
  'product_url',
  'source_url',
  'headline',
  'description',
  'warranty',
  'benefits',
  'image_url',
  'image_alt',
  'scraped_at',
];

const columnHeaders: Record<keyof CsvProduct, string> = {
  source_site: 'Sitio fuente',
  brand: 'Marca',
  line: 'Linea',
  category: 'Categoria',
  product_name: 'Producto',
  availability: 'Disponibilidad',
  regular_price: 'Precio regular',
  sale_price: 'Precio oferta',
  discount: 'Descuento',
  installment: 'Cuotas',
  product_url: 'URL producto',
  source_url: 'URL fuente',
  headline: 'Titulo',
  description: 'Descripcion',
  warranty: 'Garantia',
  benefits: 'Beneficios',
  image_url: 'URL imagen',
  image_alt: 'Texto imagen',
  scraped_at: 'Fecha scraping',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function userFriendlyStoreError(storeName: string, technicalMessage: string): string {
  if (/ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_TIMED_OUT/i.test(technicalMessage)) {
    return `${storeName}: el sitio cerro la conexion o no respondio. Intentar mas tarde.`;
  }

  if (/Timeout|timed out|waiting until/i.test(technicalMessage)) {
    return `${storeName}: el sitio tardo demasiado en responder. Intentar mas tarde.`;
  }

  if (/interrupted by another navigation/i.test(technicalMessage)) {
    return `${storeName}: la navegacion fue interrumpida. Se recomienda reintentar.`;
  }

  return `${storeName}: no se genero informacion. Puede haber cambiado la pagina o estar bloqueando temporalmente.`;
}

function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function toCsv(rows: CsvProduct[]): string {
  const header = columns.map((column) => csvEscape(columnHeaders[column])).join(',');
  const body = rows
    .map((row) => columns.map((column) => csvEscape(row[column])).join(','))
    .join('\n');

  return `\uFEFF${header}\n${body}\n`;
}

async function writeExcel(rows: CsvProduct[], outputFile: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Scraper de camas';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Productos', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = columns.map((column) => ({
    header: columnHeaders[column],
    key: column,
    width: Math.min(Math.max(columnHeaders[column].length + 4, 16), 45),
  }));

  for (const row of rows) {
    worksheet.addRow(row);
  }

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF107C41' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
      cell.alignment = {
        vertical: 'top',
        wrapText: rowNumber === 1 || ['description', 'benefits', 'headline'].includes(String(cell.col)),
      };
    });
  });

  worksheet.getColumn('product_name').width = 32;
  worksheet.getColumn('product_url').width = 48;
  worksheet.getColumn('source_url').width = 42;
  worksheet.getColumn('headline').width = 42;
  worksheet.getColumn('description').width = 60;
  worksheet.getColumn('benefits').width = 48;
  worksheet.getColumn('image_url').width = 48;
  worksheet.getColumn('scraped_at').width = 26;

  await workbook.xlsx.writeFile(outputFile);
}

async function goto(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined);
}

async function extractCardProducts(
  page: Page,
  sourceUrl: string,
  config: ProductSelectorConfig,
): Promise<CsvProduct[]> {
  return page.evaluate(({ sourceUrl, config }) => {
    const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
    const absolute = (url: string) => {
      try {
        return new URL(url, sourceUrl).toString();
      } catch {
        return url;
      }
    };
    const firstText = (root: Element, selector?: string) => {
      if (!selector) {
        return '';
      }
      return clean(root.querySelector(selector)?.textContent);
    };
    const productCategory = (name: string, fallback: string) => {
      if (fallback) {
        return fallback;
      }
      if (/colch[oÃ³]n|colchon|mattress/i.test(name)) {
        return 'Colchones';
      }
      if (/cama|base|box spring/i.test(name)) {
        return 'Camas';
      }
      if (/almohada|pillow/i.test(name)) {
        return 'Almohadas';
      }
      if (/protector|funda|s[aÃ¡]bana|frazada|edred[oÃ³]n|comforter/i.test(name)) {
        return 'Ropa de cama';
      }
      return '';
    };
    const imageUrl = (image: HTMLImageElement | null) => {
      if (!image) {
        return '';
      }
      const srcset = image.getAttribute('data-srcset') || image.getAttribute('srcset') || '';
      const srcsetFirst = srcset.split(',').map((item) => item.trim().split(/\s+/)[0]).find(Boolean) ?? '';
      const src = image.currentSrc || image.src || image.getAttribute('data-src') || image.getAttribute('src') || srcsetFirst;
      return src && !src.startsWith('data:') ? absolute(src) : '';
    };
    const buildRow = (root: Element, title: string, anchor: HTMLAnchorElement | null, image: HTMLImageElement | null): CsvProduct => {
      const rootText = clean(root.textContent);
      const currencyRegex = config.currencyCode === 'NIO'
        ? /C\$\s*[\d,]+(?:\.\d+)?(?:\s*-\s*C\$?\s*[\d,]+(?:\.\d+)?)?/i
        : /(?:Q|GTQ)\s*[\d,]+(?:\.\d+)?(?:\s*-\s*(?:Q|GTQ)?\s*[\d,]+(?:\.\d+)?)?/i;
      const category = productCategory(title, firstText(root, config.categorySelector));
      const regularPrice = firstText(root, config.regularPriceSelector);
      const salePrice = firstText(root, config.salePriceSelector)
        || firstText(root, config.priceSelector)
        || clean(rootText.match(currencyRegex)?.[0]);
      const discount = firstText(root, config.discountSelector);
      const installment = firstText(root, config.installmentSelector);
      const line = firstText(root, config.lineSelector);

      return {
        source_site: config.sourceSite,
        brand: config.brand,
        line,
        category,
        product_name: title,
        availability: 'Listado en tienda online',
        regular_price: regularPrice,
        sale_price: salePrice,
        discount,
        installment,
        product_url: anchor?.href ? absolute(anchor.href) : '',
        source_url: sourceUrl,
        headline: '',
        description: '',
        warranty: '',
        benefits: '',
        image_url: imageUrl(image),
        image_alt: clean(image?.getAttribute('alt')),
        scraped_at: '',
      };
    };

    const cardRows = Array.from(document.querySelectorAll<HTMLElement>(config.cardSelector))
      .map((card) => {
        const title = firstText(card, config.titleSelector)
          || clean(card.getAttribute('aria-label'))
          || clean(card.querySelector<HTMLAnchorElement>('a[title]')?.getAttribute('title'))
          || clean(card.querySelector<HTMLImageElement>('img[alt]')?.getAttribute('alt'));
        const anchor = card.querySelector<HTMLAnchorElement>(config.anchorSelector ?? 'a[href]');
        const image = card.querySelector<HTMLImageElement>(config.imageSelector ?? 'img');
        return buildRow(card, title, anchor, image);
      })
      .filter((product) => product.product_name && product.product_url);

    const linkRows = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
      .map((anchor) => {
        const container = anchor.closest('article, li, [class*="product"], [class*="Product"], [data-testid*="product"], [data-testid*="Product"], div') ?? anchor;
        const image = container.querySelector<HTMLImageElement>('img') ?? anchor.querySelector<HTMLImageElement>('img');
        const title = clean(anchor.getAttribute('title'))
          || clean(anchor.textContent)
          || clean(image?.getAttribute('alt'))
          || clean(container.querySelector('h1,h2,h3,h4,[class*="name"],[class*="Name"],[class*="title"],[class*="Title"]')?.textContent);
        return buildRow(container, title, anchor, image);
      })
      .filter((product) => product.product_name && product.product_url);

    const unique = new Map<string, CsvProduct>();
    for (const row of [...cardRows, ...linkRows]) {
      const key = row.product_url || `${row.source_site}|${row.product_name}`;
      if (!unique.has(key)) {
        unique.set(key, row);
      }
    }

    return Array.from(unique.values());
  }, { sourceUrl, config });
}

// Filtro comercial FACENCO.
// Aqui puedes ajustar que productos interesan para el catalogo comparativo.
const BED_PRODUCT_INCLUDE_WORDS = [
  'colchon', 'colchÃ³n', 'mattress', 'cama', 'bed', 'base', 'box spring', 'boxspring',
  'almohada', 'protector', 'funda', 'sabana', 'sÃ¡bana', 'cobertor',
  'edredon', 'edredÃ³n', 'duvet', 'frazada', 'comforter', 'cabecera', 'respaldo',
  'sofa cama', 'sofÃ¡ cama', 'sillon cama', 'sillÃ³n cama', 'futon', 'futÃ³n',
  'litera', 'dormitorio', 'recamara', 'recÃ¡mara', 'celaje', 'celajes',
];

const BED_PRODUCT_STRONG_INCLUDE_WORDS = [
  'colchon', 'colchÃ³n', 'mattress', 'cama', 'base', 'box spring', 'boxspring',
  'almohada', 'protector', 'sabana', 'sÃ¡bana', 'cobertor', 'edredon', 'edredÃ³n',
  'duvet', 'frazada', 'cabecera', 'respaldo', 'sofa cama', 'sofÃ¡ cama',
  'sillon cama', 'sillÃ³n cama', 'futon', 'futÃ³n', 'litera',
];

const BED_PRODUCT_EXCLUDE_WORDS = [
  'laptop', 'notebook', 'computadora', 'pc gamer', 'monitor', 'teclado', 'mouse',
  'celular', 'telefono', 'telÃ©fono', 'smartphone', 'tablet', 'ipad', 'iphone',
  'samsung', 'galaxy', 'xiaomi', 'huawei', 'motorola', 'honor', 'realme', 'infinix',
  'televisor', 'tv ', 'smart tv', 'pantalla', 'proyector', 'camara', 'cÃ¡mara',
  'refrigeradora', 'refrigerador', 'lavadora', 'secadora', 'estufa', 'cocina',
  'microondas', 'licuadora', 'freidora', 'cafetera', 'batidora', 'audio', 'bocina',
  'parlante', 'audifono', 'audÃ­fono', 'consola', 'playstation', 'xbox', 'nintendo',
  'impresora', 'router', 'ups', 'bicicleta', 'moto', 'llanta', 'juguete',
  'maybelline', 'maquillaje', 'labial', 'rimel', 'rÃ­mel', 'mascara', 'mÃ¡scara',
  'face studio', 'sun kisser', 'rubor', 'base liquida', 'base lÃ­quida', 'cosmetico',
  'cosmÃ©tico', 'perfume', 'crema facial', 'shampoo', 'acondicionador',
  'paw patrol', 'figura de accion', 'figura de acciÃ³n', 'helicoptero', 'helicÃ³ptero',
  'rescue', 'search', 'muÃ±eca', 'muneca', 'carro juguete', 'lego', 'barbie',
];

function isObviousCatalogNoise(row: CsvProduct): boolean {
  const text = normalizeCatalogText([
    row.product_name,
    row.headline,
    row.product_url,
  ].filter(Boolean).join(' '));

  return (
    text.includes('saltar al contenido') ||
    text.includes('skip to content') ||
    /#main($|[/?#&])/.test(row.product_url || '')
  );
}
function isLikelyCatalogNoise(row: CsvProduct): boolean {
  const title = normalizeCatalogText(row.product_name);
  const source = normalizeCatalogText(`${row.source_site} ${row.brand} ${row.source_url}`);

  const trustedBedStores = [
    'facenco',
    'olympia',
    'colchoneria',
    'sleep gallery',
    'mattress',
    'beds & dreams',
    'furniture city',
    'la curacao',
    'max guatemala',
    'elektra guatemala',
    'walmart guatemala',
    'cemaco guatemala',
    'siman guatemala',
    'dormisueÃ±os guatemala',
    'dormisueÃ±os',
  ];

  const isTrustedBedStore = trustedBedStores.some((store) => source.includes(store));
  if (isTrustedBedStore) {
    return false;
  }

  const hasStrongWord = BED_PRODUCT_STRONG_INCLUDE_WORDS.some((word) =>
    title.includes(normalizeCatalogText(word)),
  );

  if (hasStrongWord) {
    return false;
  }

  return true;
}

function hasRelevantBedProduct(row: CsvProduct): boolean {
  const productText = normalizeCatalogText([
    row.product_name,
    row.category,
    row.line,
    row.headline,
    row.description,
    row.image_alt,
  ].filter(Boolean).join(' '));

  const urlText = normalizeCatalogText([
    row.product_url,
    row.source_url,
  ].filter(Boolean).join(' '));

  const sourceText = normalizeCatalogText([
    row.source_site,
    row.brand,
  ].filter(Boolean).join(' '));

  const fullText = `${productText} ${urlText} ${sourceText}`.trim();
  if (!fullText) {
    return false;
  }

  if (isObviousCatalogNoise(row)) {
    return false;
  }

  const hardExcludeText = productText || fullText;
  if (BED_PRODUCT_EXCLUDE_WORDS.some((word) => hardExcludeText.includes(normalizeCatalogText(word)))) {
    return false;
  }

  const hasProductKeyword = BED_PRODUCT_INCLUDE_WORDS.some((word) => productText.includes(normalizeCatalogText(word)));
  const hasUrlKeyword = BED_PRODUCT_STRONG_INCLUDE_WORDS.some((word) => urlText.includes(normalizeCatalogText(word)));
  const trustedStore = [
    'facenco',
    'olympia',
    'colchoneria',
    'sleep gallery',
    'mattress',
    'beds & dreams',
    'furniture city',
    'la curacao',
    'max guatemala',
    'elektra guatemala',
    'walmart guatemala',
    'cemaco guatemala',
    'siman guatemala',
    'dormisueÃ±os guatemala',
    'dormisueÃ±os',
  ].some((store) => sourceText.includes(store));

  if (hasProductKeyword) {
    return true;
  }

  if (trustedStore && hasUrlKeyword) {
    return true;
  }

  return false;
}

function csvFilterText(row: CsvProduct, ...keys: string[]): string {
  const record = row as unknown as Record<string, unknown>;
  return keys
    .map((key) => record[key])
    .filter((value): value is string | number => {
      if (typeof value === 'number') return Number.isFinite(value);
      return typeof value === 'string' && value.trim().length > 0;
    })
    .map((value) => String(value))
    .join(' ');
}


function makeFinalCatalogFilterKey(row: CsvProduct): string {
  return normalizeCatalogText([
    csvFilterText(row, 'source_site', 'sitio_fuente', 'sourceSite', 'storeName', 'tienda'),
    csvFilterText(row, 'product_name', 'producto', 'productName', 'titulo', 'title', 'headline'),
    csvFilterText(row, 'product_url', 'url_producto', 'productUrl', 'url'),
    csvFilterText(row, 'regular_price', 'precio_regular', 'regularPrice', 'precioRegular'),
    csvFilterText(row, 'sale_price', 'precio_oferta', 'salePrice', 'precioOferta'),
  ].filter(Boolean).join('|'));
}
function getPriceValidationText(row: CsvProduct): string {
  return csvFilterText(
    row,
    'regular_price',
    'sale_price',
    'precio_regular',
    'precio_oferta',
    'precioRegular',
    'precioOferta',
    'regularPrice',
    'salePrice',
    'product_name',
    'producto',
    'productName',
    'titulo',
    'title',
    'headline',
    'descripcion',
    'description',
    'beneficios',
    'benefits',
    'rawText'
  );
}



function hasQuetzalPrice(row: CsvProduct): boolean {
  const text = getPriceValidationText(row);
  return /(?:^|[^A-Za-z])Q\s?\d|GTQ|Quetzal/i.test(text);
}




function filterGuatemalaQuetzalRows(rows: CsvProduct[], sourceSite = 'Tienda'): CsvProduct[] {
  const withQuetzal = rows.filter((row) => hasQuetzalPrice(row));
  const withBedProduct = rows.filter((row) => hasRelevantBedProduct(row));
  const kept = rows.filter((row) => hasQuetzalPrice(row) && hasRelevantBedProduct(row));

  console.log(
    `Diagnostico ${sourceSite}: encontrados=${rows.length}, con_precio_Q=${withQuetzal.length}, relacionados_cama=${withBedProduct.length}, guardados=${kept.length}`,
  );

  if (rows.length > 0 && kept.length === 0) {
    const sample = rows
      .slice(0, 5)
      .map((row) => cleanText(`${row.product_name} | precio: ${row.sale_price || row.regular_price || 'sin precio'} | url: ${row.product_url}`))
      .join(' || ');
    console.log(`Muestra descartada ${sourceSite}: ${sample}`);
  }

  return kept;
}

const {
  scrapeGenericGuatemalaStore,
  scrapeVisualProductGrid,
  scrapePagedVisualProductGrid,
} = createVisualScraperEngine({
  navigate: goto,
  filterGuatemalaRows: filterGuatemalaQuetzalRows,
  extractCards: extractCardProducts,
});

const guatemalaVisualStores = createGuatemalaVisualStores({
  scrapeGenericGuatemalaStore,
  scrapeVisualProductGrid,
  scrapePagedVisualProductGrid,
});
const guatemalaPagedVisualStores = createGuatemalaPagedVisualStores({
  scrapeGenericGuatemalaStore,
  scrapeVisualProductGrid,
  scrapePagedVisualProductGrid,
});
const scrapeMaxGt = createMaxGuatemalaScraper({
  navigate: goto,
  filterGuatemalaRows: filterGuatemalaQuetzalRows,
});
const scrapeWalmartGt = createWalmartGuatemalaScraper({
  filterGuatemalaRows: filterGuatemalaQuetzalRows,
});
const scrapeSimanGt = createSimanGuatemalaScraper({
  scrapeGenericGuatemalaStore,
  scrapeVisualProductGrid,
  scrapePagedVisualProductGrid,
});
const guatemalaCardStores = createGuatemalaCardStores({
  navigate: goto,
  extractCards: extractCardProducts,
  filterGuatemalaRows: filterGuatemalaQuetzalRows,
});
const scrapeFurnitureCity = createFurnitureCityGuatemalaScraper({
  navigate: goto,
  extractCards: extractCardProducts,
});
const olympiaLaColchoneria = createOlympiaLaColchoneriaGuatemalaScrapers({
  navigate: goto,
});
const scrapeFacencoGt = createFacencoGuatemalaScraper({
  navigate: goto,
});

function hasDollarPrice(row: CsvProduct): boolean {
  const text = normalizeCatalogText(getPriceValidationText(row));
  return /(?:^|[\s(])US\$|(?:^|[\s(])\$ ?\d|d[oÃ³]lar|usd/i.test(text);
}




function isFacencoRow(row: CsvProduct): boolean {
  return normalizeCatalogText(row.source_site) === 'facenco' || normalizeCatalogText(row.brand) === 'facenco';
}
const FINAL_QUETZAL_PRICE_PATTERN = /(?:Q|GTQ)\s*\d/i;
const FINAL_DOLLAR_PRICE_PATTERN = /\b(usd|us\$|d[oÃ³]lar(?:es)?|dollars?)\b|\$\s*\d/i;
function shouldKeepCatalogRow(row: CsvProduct): boolean {
  return getCatalogFilterReason(row) === '';
}




function filterFinalCatalogRows(rows: CsvProduct[]): CsvProduct[] {
  const result: CsvProduct[] = [];
  const rejectedByStore = new Map<string, { count: number; samples: string[] }>();
  const seen = new Set<string>();

  for (const row of rows) {
    const reason = getCatalogFilterReason(row);
    if (reason) {
      const store = csvFilterText(
        row,
        'source_site',
        'sitio_fuente',
        'sourceSite',
        'sourceName',
        'storeName',
        'tienda',
        'store',
        'site',
      ) || 'Sin tienda';
      const info = rejectedByStore.get(store) ?? { count: 0, samples: [] };
      info.count += 1;
      if (info.samples.length < 3) {
        const product = csvFilterText(
          row,
          'product_name',
          'producto',
          'productName',
          'titulo',
          'title',
          'headline',
          'name',
        ) || 'Sin producto';
        const price = csvFilterText(
          row,
          'sale_price',
          'regular_price',
          'precio_oferta',
          'precio_regular',
          'precioOferta',
          'precioRegular',
          'salePrice',
          'regularPrice',
          'offerPrice',
          'price',
          'priceText',
        ) || 'sin precio';
        info.samples.push(`${product} | precio: ${price} | motivo: ${reason}`);
      }
      rejectedByStore.set(store, info);
      continue;
    }

    const key = makeFinalDedupKey(row);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(row);
  }

  if (rejectedByStore.size > 0) {
    console.log('Productos descartados por filtro final:');
    for (const [store, info] of rejectedByStore.entries()) {
      console.log(`- ${store}: ${info.count} descartados`);
      for (const sample of info.samples) console.log(`  ejemplo: ${sample}`);
    }
  }

  return result;
}





function getSelectedStoreNames(): string[] {
  const arg = process.argv.find((item) => item.startsWith('--stores='));
  if (!arg) return [];
  return arg
    .replace('--stores=', '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
// INICIO FIX FILTRO FINAL POR TIENDA
const FINAL_BED_PRODUCT_PATTERN = /(cama|camas|colchon|colch[oÃ³]n|colchones|mattress|box\s*spring|base|bases|cabecera|cabeceras|almohada|almohadas|protector|protectores|funda|fundas|s[aÃ¡]bana|sabanas|s[aÃ¡]banas|edred[oÃ³]n|edredones|cobertor|cobertores|duvet|set\s+de\s+cama|dormitorio|litera|literas|camarote|sofa\s*cama|sof[aÃ¡]\s*cama|rec[aÃ¡]mara|sleep|dream|restonic|simmons|serta|sealy|olympia|indufoam|facenco|comfort\s*life|therapedic|belezza|lucca|sienna|kangaroo|beautyrest|beautysleep|back\s*care|backcare)/i;
const FINAL_NON_BED_PRODUCT_PATTERN = /(celular|telefono|tel[eÃ©]fono|smartphone|iphone|samsung\s+galaxy|laptop|notebook|computadora|tablet|televisor|tv\s|aud[iÃ­]fono|bocina|mouse|teclado|impresora|monitor|c[aÃ¡]mara|camera|refrigeradora|lavadora|estufa|microondas|licuadora|cafetera|maquillaje|rubor|labial|maybelline|juguete|paw\s*patrol|figura\s+de\s+acci[oÃ³]n|bicicleta|moto|llanta|zapato|tenis|ropa|vestido|camisa|pantal[oÃ³]n)/i;
const BED_PRODUCT_PATTERN = FINAL_BED_PRODUCT_PATTERN;
const NON_BED_PRODUCT_PATTERN = FINAL_NON_BED_PRODUCT_PATTERN;

function readCsvProductText(row: CsvProduct, keys: string[]): string {
  const record = row as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function getCatalogFilterReason(row: CsvProduct): string {
  const site = readCsvProductText(row, ['source_site', 'sourceSite', 'sourceName', 'sitio_fuente', 'tienda', 'store', 'site']);
  const product = readCsvProductText(row, ['product_name', 'productName', 'producto', 'title', 'titulo', 'name']);
  const brand = readCsvProductText(row, ['brand', 'marca']);
  const line = readCsvProductText(row, ['line', 'linea']);
  const category = readCsvProductText(row, ['category', 'categoria']);
  const description = readCsvProductText(row, ['description', 'descripcion', 'details', 'detalle']);
  const headline = readCsvProductText(row, ['headline', 'title', 'titulo']);
  const benefits = readCsvProductText(row, ['benefits', 'beneficios']);
  const productUrl = readCsvProductText(row, ['product_url', 'productUrl', 'url_producto', 'url']);
  const imageAlt = readCsvProductText(row, ['image_alt', 'imageAlt']);
  const priceText = csvFilterText(
    row,
    'regular_price',
    'sale_price',
    'price',
    'priceText',
    'precio',
    'precio_regular',
    'precio_oferta',
    'regularPrice',
    'salePrice',
    'offerPrice',
  );
  const identityText = [product, brand, line, category, headline, productUrl, imageAlt].join(' ');
  const searchableText = [identityText, description, benefits].join(' ');
  const specializedBedStore = /(facenco|olympia|colchoneria|colchoner[iÃ­]a|sleep\s*gallery|mattress|beds?\s*&?\s*dreams?|suena\s*center|sue[nÃ±]a\s*center|dormilandia|dormisue[nÃ±]os|serta\s*guatemala)/i.test(site);

  if (!site) return 'sin tienda';
  if (!product && !description) return 'sin producto';
  if (FINAL_NON_BED_PRODUCT_PATTERN.test(identityText)) return 'producto no relacionado a cama';
  if (!specializedBedStore && !FINAL_BED_PRODUCT_PATTERN.test(searchableText)) return 'no parece producto de cama';

  // No se exige precio para guardar: FACENCO y algunas tiendas pueden traer catalogo sin precio.
  // Solo se rechaza si claramente viene en dolares y no aparece Quetzal.
  if ((/\bUSD\b|US\$|\$/i.test(priceText)) && !/(Q\s*\d|GTQ)/i.test(priceText)) {
    return 'precio en dolares';
  }

  return '';
}

function makeFinalDedupKey(row: CsvProduct): string {
  const site = readCsvProductText(row, ['source_site', 'sourceSite', 'sourceName', 'sitio_fuente', 'tienda', 'store', 'site']);
  const product = readCsvProductText(row, ['product_name', 'productName', 'producto', 'title', 'titulo', 'name']);
  const productUrl = readCsvProductText(row, ['product_url', 'productUrl', 'url_producto', 'url']);
  const regularPrice = readCsvProductText(row, ['regular_price', 'precio_regular', 'regularPrice', 'precioRegular']);
  const salePrice = readCsvProductText(row, ['sale_price', 'precio_oferta', 'salePrice', 'offerPrice', 'precioOferta']);
  return [site, product, productUrl, regularPrice, salePrice]
    .map((value) => value.toLowerCase().replace(/\s+/g, ' ').trim())
    .join('|');
}
// FIN FIX FILTRO FINAL POR TIENDA
async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const storeTimeoutMs = Math.max(
    30_000,
    Number(process.env.SCRAPER_STORE_TIMEOUT_MS || 4 * 60_000),
  );
  const getAttemptTimeoutMs = (storeName: string): number => (
    storeName === 'Siman Guatemala' ? Math.max(storeTimeoutMs, 10 * 60_000) : storeTimeoutMs
  );

  try {
    const scrapedAt = new Date().toISOString();
    const storeScrapers = createGuatemalaScraperRegistry(scrapedAt, {
      facenco: scrapeFacencoGt,
      olympia: olympiaLaColchoneria.olympia,
      laColchoneria: olympiaLaColchoneria.laColchoneria,
      sleepGallery: guatemalaCardStores.sleepGallery,
      serta: guatemalaCardStores.serta,
      americana2000: scrapeAmericana2000Gt,
      mattress: guatemalaCardStores.mattress,
      bedsDreams: scrapeBedsDreams,
      furnitureCity: scrapeFurnitureCity,
      laCuracao: guatemalaVisualStores.laCuracao,
      max: scrapeMaxGt,
      elektra: guatemalaVisualStores.elektra,
      walmart: scrapeWalmartGt,
      cemaco: guatemalaVisualStores.cemaco,
      siman: scrapeSimanGt,
      suenaCenter: scrapeSuenaCenterGt,
      dormilandia: guatemalaVisualStores.dormilandia,
      dormisuenos: guatemalaPagedVisualStores.dormisuenos,
      bodegangas: guatemalaPagedVisualStores.bodegangas,
    });

    const registration = getStoreRegistrationDifferences(storeScrapers.map((store) => store.name));
    if (registration.missing.length || registration.unknown.length) {
      throw new Error(
        `Catalogo de tiendas desalineado. Faltantes: ${registration.missing.join(', ') || 'ninguna'}. `
        + `No configuradas: ${registration.unknown.join(', ') || 'ninguna'}.`,
      );
    }

    const selectedStoreNames = getSelectedStoreNames();
    const selectedStoreKeys = selectedStoreNames.map((name) => name.toLowerCase());
    const storesToRun = selectedStoreKeys.length
      ? storeScrapers.filter((store) => selectedStoreKeys.includes(store.name.toLowerCase()))
      : storeScrapers;

    if (selectedStoreKeys.length && storesToRun.length === 0) {
      throw new Error(`No se encontro ninguna tienda seleccionada. Tiendas disponibles: ${storeScrapers.map((store) => store.name).join(', ')}`);
    }

    if (selectedStoreKeys.length) {
      console.log(`Ejecutando scraper solo para: ${storesToRun.map((store) => store.name).join(', ')}`);
    } else {
      console.log('Ejecutando scraper completo para todas las tiendas.');
    }

    const rows: CsvProduct[] = [];
    const failures: string[] = [];

    async function runStoreAttempt(store: StoreScraper, attempt: number): Promise<CsvProduct[]> {
      const storePage = await browser.newPage({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      });

      try {
        console.log(`Iniciando ${store.name} intento ${attempt}...`);
        const attemptTimeoutMs = getAttemptTimeoutMs(store.name);
        let timeoutHandle: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error(
              `${store.name} excedio el limite de ${Math.round(attemptTimeoutMs / 60_000)} minutos por intento.`,
            ));
          }, attemptTimeoutMs);
        });
        const storeRows = await Promise.race([
          store.run(storePage),
          timeoutPromise,
        ]).finally(() => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        });
        const finalRows = filterFinalCatalogRows(storeRows).filter((row) => row.source_site === store.name);
        console.log(`OK ${store.name} intento ${attempt}: ${storeRows.length} productos leidos, ${finalRows.length} productos utiles.`);
        return storeRows;
      } finally {
        await Promise.race([
          storePage.close().catch(() => undefined),
          new Promise<void>((resolveClose) => setTimeout(resolveClose, 5_000)),
        ]);
      }
    }

    for (const store of storesToRun) {
      let bestRows: CsvProduct[] = [];
      let bestFinalCount = -1;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const attemptRows = await runStoreAttempt(store, attempt);
          const attemptFinalCount = filterFinalCatalogRows(attemptRows).filter((row) => row.source_site === store.name).length;

          if (attemptFinalCount > bestFinalCount) {
            bestRows = attemptRows;
            bestFinalCount = attemptFinalCount;
          }

          const retryMinimum = getStoreRetryMinimum(store.name);
          if (attemptFinalCount >= retryMinimum) {
            break;
          }

          if (attempt < 2) {
            console.log(
              `ADVERTENCIA: ${store.name} obtuvo ${attemptFinalCount} productos utiles; `
              + `minimo para aceptar ${retryMinimum}. Reintentando para conservar el mejor resultado.`,
            );
          }
        } catch (error) {
          const technical = errorMessage(error);
          const message = userFriendlyStoreError(store.name, technical);

          if (attempt < 2) {
            console.error(`ADVERTENCIA: ${message}`);
            console.error(`DETALLE_TECNICO ${store.name} intento ${attempt}: ${technical}`);
            console.log(`Reintentando solo ${store.name} por fallo en el intento ${attempt}.`);
          } else {
            failures.push(message);
            console.error(`ADVERTENCIA: ${message}`);
            console.error(`DETALLE_TECNICO ${store.name} intento ${attempt}: ${technical}`);
          }
        }
      }

      if (bestRows.length > 0) {
        rows.push(...bestRows);
        console.log(`USANDO ${store.name}: ${bestRows.length} productos leidos, ${Math.max(bestFinalCount, 0)} productos utiles.`);
      }
    }

    const filteredRows = filterFinalCatalogRows(rows);
    const qualityWarnings: string[] = [];
    console.log('Diagnostico final por tienda despues de filtros:');
    for (const store of storesToRun) {
      const beforeCount = rows.filter((row) => normalizeCatalogText(row.source_site) === normalizeCatalogText(store.name)).length;
      const afterCount = filteredRows.filter((row) => normalizeCatalogText(row.source_site) === normalizeCatalogText(store.name)).length;
      console.log('FINAL ' + store.name + ': antes=' + beforeCount + ', despues=' + afterCount);
      const qualityWarning = buildStoreQualityWarning(store.name, afterCount, beforeCount);
      if (qualityWarning) {
        qualityWarnings.push(qualityWarning);
        console.log('ADVERTENCIA: ' + qualityWarning);
      }
    }

    if (filteredRows.length === 0) {
      throw new Error(`No se pudo generar informacion util. Se eliminaron productos fuera de cama o con precios en dolares. ${failures.join(' | ')}`);
    }

    await mkdir(dirname(OUTPUT_FILE), { recursive: true });
    await writeFile(OUTPUT_FILE, toCsv(filteredRows), 'utf8');
    await writeExcel(filteredRows, OUTPUT_XLSX_FILE);
    await saveProductsToPostgres(filteredRows);

    console.log(`Productos extraidos antes de filtro: ${rows.length}`);
    console.log(`Productos guardados despues de filtro: ${filteredRows.length}`);
    const allWarnings = [...failures, ...qualityWarnings];
    if (allWarnings.length > 0) {
      console.log(`Tiendas con advertencia: ${allWarnings.length}`);
      for (const warning of allWarnings) {
        console.log(`ADVERTENCIA: ${warning}`);
      }
    }
    console.log(`CSV generado: ${OUTPUT_FILE}`);
    console.log(`Excel generado: ${OUTPUT_XLSX_FILE}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});












































