export type ScrapedCatalogProduct = {
  productName: string;
  productUrl: string;
  sourceUrl: string;
  line: string;
  imageUrl: string;
  imageAlt: string;
};

export type ProductDetails = {
  headline: string;
  description: string;
  warranty: string;
  benefits: string;
};

export type CsvProduct = {
  source_site: string;
  brand: string;
  line: string;
  category: string;
  product_name: string;
  availability: string;
  regular_price: string;
  sale_price: string;
  discount: string;
  installment: string;
  product_url: string;
  source_url: string;
  headline: string;
  description: string;
  warranty: string;
  benefits: string;
  image_url: string;
  image_alt: string;
  scraped_at: string;
};

export type DbProduct = {
  id: string;
  run_id: string | null;
  semana_run: number | null;
  semana_inicio: string | null;
  sitio_fuente: string | null;
  marca: string | null;
  linea: string | null;
  categoria: string | null;
  producto: string | null;
  disponibilidad: string | null;
  precio_regular: string | null;
  precio_oferta: string | null;
  precio_regular_min?: number | null;
  precio_regular_max?: number | null;
  precio_oferta_min?: number | null;
  precio_oferta_max?: number | null;
  descuento: string | null;
  cuotas: string | null;
  url_producto: string | null;
  url_fuente: string | null;
  titulo: string | null;
  descripcion: string | null;
  garantia: string | null;
  beneficios: string | null;
  url_imagen: string | null;
  texto_imagen: string | null;
  fecha_scraping: string | null;
  creado_en: string | null;
  registro_uuid: string | null;
  run_uuid: string | null;
};

export type CatalogProduct = DbProduct & {
  precio_numero: number | null;
  diferencia_facenco: number | null;
  etiqueta_diferencia: string;
};

export type PriceRange = { min: number | null; max: number | null };

const EMPTY_TEXT_MARKERS = new Set(['', '-', 'n/a', 'na', 'null', 'undefined']);

export function cleanProductText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeProductText(value: string | null | undefined): string {
  return cleanProductText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function toNullableProductText(value: string | null | undefined): string | null {
  const cleaned = cleanProductText(value);
  return EMPTY_TEXT_MARKERS.has(cleaned.toLowerCase()) ? null : cleaned;
}

function parseMoneyToken(value: string): number | null {
  const cleaned = value.replace(/Q|GTQ/gi, '').replace(/\s/g, '').replace(/,/g, '').replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseGtqPriceRange(value: string | null | undefined): PriceRange {
  const text = cleanProductText(value);
  if (EMPTY_TEXT_MARKERS.has(text.toLowerCase())) return { min: null, max: null };
  const matches = text.match(/(?:Q|GTQ)?\s*\d[\d,]*(?:\.\d+)?/gi) || [];
  const numbers = matches.map(parseMoneyToken).filter((price): price is number => price !== null).sort((a, b) => a - b);
  if (numbers.length === 0) return { min: null, max: null };
  return { min: numbers[0], max: numbers[numbers.length - 1] };
}
