import { cleanProductText } from '../../domain/product.js';
import { LA_CURACAO_NC, isNicaraguaCuracaoUrl, parseCuracaoNcPrice } from './la-curacao.js';

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

const sourcePaths = new Set([
  ...Object.values(LA_CURACAO_NC.sources),
  LA_CURACAO_NC.categoryUrl,
].map((value) => {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}));

function isAllowedSourceUrl(value: string): boolean {
  if (!isNicaraguaCuracaoUrl(value)) return false;
  const url = new URL(value);
  return sourcePaths.has(`${url.origin}${url.pathname}`);
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
