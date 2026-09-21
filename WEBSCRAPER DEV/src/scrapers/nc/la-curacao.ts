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
  complete: boolean;
};

export function compareCuracaoNcCategory(
  category: { productIds: readonly string[]; complete: boolean },
  observations: readonly SourceCoverage[],
) {
  const beds = compareCuracaoNcCoverage(observations);
  if (category.productIds.some(id => !id.trim())) throw new Error('Identidad de producto vacía.');
  const categoryIds = new Set(category.productIds);
  const bedIds = new Set(observations.flatMap(source => [...source.productIds]));
  const onlyCategory = [...categoryIds].filter(id => !bedIds.has(id)).sort();
  const onlyBeds = [...bedIds].filter(id => !categoryIds.has(id)).sort();
  const complete = category.complete && beds.complete;
  return { complete, onlyCategory, onlyBeds,
    categoryCoversBeds: complete ? onlyBeds.length === 0 : null,
    equivalent: complete ? onlyCategory.length === 0 && onlyBeds.length === 0 : null };
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
  const main = new Set(bySource.get('principal')?.productIds ?? []);
  const sizes = new Set(sources.filter(source => source !== 'principal')
    .flatMap(source => [...(bySource.get(source)?.productIds ?? [])]));
  const onlyMain = [...main].filter(id => !sizes.has(id)).sort();
  const onlySizes = [...sizes].filter(id => !main.has(id)).sort();
  return {
    complete: incompleteSources.length === 0,
    equivalent: incompleteSources.length ? null : onlyMain.length === 0 && onlySizes.length === 0,
    incompleteSources, onlyMain, onlySizes,
    shared: [...main].filter(id => sizes.has(id)).sort(),
    uniqueTotal: new Set([...main, ...sizes]).size,
  };
}
