/** Pure TypeScript mirror of backend/catalog_api/db/regional_classification.py. */

export type RegionalClassificationStatus = 'asignado' | 'revision' | 'no_producto';
export type RegionalClassification = {
  status: RegionalClassificationStatus;
  country: string | null;
  reason: string;
};
export type RegionalClassificationInput = {
  sitio_fuente?: string | null;
  url_fuente?: string | null;
  url_producto?: string | null;
  precio_regular?: string | null;
  precio_oferta?: string | null;
};

export const REGIONAL_CLASSIFICATION_RULE_VERSION = '038-origin-v3';

const MONEY = { GT: 'GTQ', SV: 'USD', HN: 'HNL', NC: 'NIO' } as const;
const GENERIC_GT: Record<string, string> = {
  'americana 2000 guatemala': 'americana2000.com',
  'beds & dreams': 'bedsndreams.com',
  'bodegangas guatemala': 'bodegangasgts.com',
  'cemaco guatemala': 'cemaco.com',
  'dormisuenos guatemala': 'tiendasdormisuenos.com',
  facenco: 'camasfacenco.com',
};
const NATIONAL_GT = new Set([
  'dormilandia.com.gt', 'elektra.com.gt', 'furniturecity.com.gt',
  'lacolchoneria.com.gt', 'mattress.com.gt', 'max.com.gt', 'walmart.com.gt',
  'gt.siman.com', 'gt.camasuena.com',
]);
const REGIONAL: Record<string, Record<string, string>> = {
  'sleepgalleryca.com': { gt: 'GT', sv: 'SV', hn: 'HN', nc: 'NC' },
  'lacuracaonline.com': {
    guatemala: 'GT', nicaragua: 'NC', honduras: 'HN', elsalvador: 'SV',
  },
  'sertacentroamerica.com': { guatemala: 'GT' },
  'camasolympiaonline.com': { gt: 'GT' },
};
const SOCIAL = new Set([
  'facebook.com', 'instagram.com', 'youtube.com', 'youtu.be', 'wa.me',
  'pinterest.com', 'tiktok.com', 'shopify.com', 'es.shopify.com',
]);
const NAVIGATION = new Set([
  'mi-cuenta', 'my-account', 'cart', 'carrito', 'checkout', 'contactenos',
  'contacto', 'trabaja-con-nosotros', 'politicas-de-privacidad',
  'politicas-de-garantia', 'politicas-de-devolucion', 'politicas-de-despacho',
  'preguntas-y-respuestas', 'codigos-postales-de-el-salvador',
]);

function normalize(value: string | null | undefined): string {
  return (value ?? '').normalize('NFD').replace(/\p{Mn}/gu, '').trim().toLowerCase();
}

type ParsedUrl = { host: string; parts: string[] };

function parsedUrl(value: string | null | undefined): ParsedUrl | null {
  const raw = (value ?? '').trim();
  const match = raw.match(/^(https?):\/\/([^/?#]*)([^?#]*)/i);
  if (!match) return null;
  try {
    const url = new URL(`${match[1]}://${match[2]}/`);
    if (url.username || url.password || !url.hostname || !['', '80', '443'].includes(url.port)) {
      return null;
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const parts: string[] = [];
    for (const segment of match[3].split('/').filter(Boolean)) {
      let decoded: string;
      try {
        decoded = decodeURIComponent(segment).toLowerCase();
      } catch {
        return null;
      }
      if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) {
        return null;
      }
      parts.push(decoded);
    }
    return { host, parts };
  } catch {
    return null;
  }
}

function priceCurrency(value: string | null | undefined): string | null {
  const text = value ?? '';
  const patterns: Array<[RegExp, string]> = [
    [/(?:GTQ|Q)\s*[\d,.]/i, 'GTQ'],
    [/(?:NIO|C\$)\s*[\d,.]/i, 'NIO'],
    [/(?:USD|\$)\s*[\d,.]/i, 'USD'],
    [/(?:HNL|L)\s*[\d,.]/i, 'HNL'],
  ];
  for (const [pattern, currency] of patterns) {
    if (pattern.test(text)) return currency;
  }
  return text.trim() ? 'sin_moneda_verificable' : null;
}

function result(status: RegionalClassificationStatus, reason: string, country: string | null = null): RegionalClassification {
  return { status, country, reason };
}

/** Mirrors the conservative Python 038-v3 source/domain/currency rules. */
export function classifyRegionalProduct(row: RegionalClassificationInput): RegionalClassification {
  const source = parsedUrl(row.url_fuente);
  const product = parsedUrl(row.url_producto);
  if (!source || !product) return result('revision', 'url_ausente_o_invalida');

  const { host, parts } = product;
  if (SOCIAL.has(host)) return result('no_producto', 'enlace_social_o_plataforma');

  const routeParts = REGIONAL[host] ? parts.slice(1) : parts;
  if (REGIONAL[host] && (parts.length === 0 || parts.length === 1)) {
    return result('no_producto', 'enlace_portada_o_pais');
  }
  if (routeParts.length && NAVIGATION.has(routeParts[0])) {
    return result('no_producto', 'enlace_navegacion');
  }
  if (host === 'bedsndreams.com' && routeParts.length
      && ['account', 'pages'].includes(routeParts[0])) {
    return result('no_producto', 'enlace_navegacion');
  }
  if (host === 'sleepgalleryca.com' && routeParts.length) {
    if ([
      'categoria-producto', 'colchones', 'accesorios', 'mi-cuenta-2',
      'hotel-collection', 'tiendas', 'promociones', 'nuestro-enfoque-y-marcas',
    ].includes(routeParts[0])) return result('no_producto', 'enlace_navegacion');
    if (routeParts[0] !== 'producto' || routeParts.length < 2) {
      return result('revision', 'ruta_sin_producto_verificado');
    }
  }

  let country: string;
  let reason: string;
  if (REGIONAL[host]) {
    if (source.host !== host
        && !(host === 'sleepgalleryca.com' && source.host === 'paises.sleepgalleryca.com')) {
      return result('revision', 'origen_producto_incompatible');
    }
    country = REGIONAL[host][parts[0]];
    if (!country) return result('revision', 'ruta_regional_no_verificada');
    if (source.host === host && source.parts.length && REGIONAL[host][source.parts[0]]
        && REGIONAL[host][source.parts[0]] !== country) {
      return result('revision', 'conflicto_pais_fuente_producto');
    }
    reason = 'ruta_regional_explicita';
  } else if (NATIONAL_GT.has(host) && source.host === host) {
    country = 'GT';
    reason = 'dominio_nacional_verificado';
  } else if (GENERIC_GT[normalize(row.sitio_fuente)] === host && source.host === host) {
    country = 'GT';
    reason = 'tienda_origen_y_moneda_concordantes';
  } else {
    return result('revision', 'origen_no_verificado');
  }

  if (!parts.length) return result('no_producto', 'enlace_navegacion');
  const currencies = new Set([
    priceCurrency(row.precio_regular), priceCurrency(row.precio_oferta),
  ].filter((value): value is string => value !== null));
  if (currencies.size && (currencies.size !== 1 || !currencies.has(MONEY[country as keyof typeof MONEY]))) {
    return result('revision', 'moneda_ausente_o_conflictiva');
  }
  if (reason === 'tienda_origen_y_moneda_concordantes' && !currencies.size) {
    return result('revision', 'fuente_generica_sin_moneda');
  }
  return result('asignado', reason, country);
}
