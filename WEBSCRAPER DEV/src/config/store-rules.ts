export type StoreQualityRule = {
  minFinalProducts: number;
};

// Una cantidad menor genera una advertencia, pero no detiene el scraper.
export const STORE_QUALITY_RULES: Readonly<Record<string, StoreQualityRule>> = {
  FACENCO: { minFinalProducts: 10 },
  'Camas Olympia Online GT': { minFinalProducts: 25 },
  'La Colchoneria Guatemala': { minFinalProducts: 20 },
  'Sleep Gallery Guatemala': { minFinalProducts: 35 },
  'Mattress Guatemala': { minFinalProducts: 25 },
  'Beds & Dreams': { minFinalProducts: 30 },
  'Furniture City Guatemala': { minFinalProducts: 5 },
  'La Curacao Guatemala': { minFinalProducts: 15 },
  'MAX Guatemala': { minFinalProducts: 5 },
  'Elektra Guatemala': { minFinalProducts: 5 },
  'Walmart Guatemala': { minFinalProducts: 10 },
  'Cemaco Guatemala': { minFinalProducts: 5 },
  'Siman Guatemala': { minFinalProducts: 10 },
  'Serta Guatemala': { minFinalProducts: 10 },
  'Americana 2000 Guatemala': { minFinalProducts: 30 },
};

// Si el primer intento queda bajo este minimo, se reintenta y se conserva el mejor resultado.
export const STORE_RETRY_RULES: Readonly<Record<string, StoreQualityRule>> = {
  'La Curacao Guatemala': { minFinalProducts: 20 },
  'Walmart Guatemala': { minFinalProducts: 520 },
};

export function getStoreRetryMinimum(storeName: string): number {
  return STORE_RETRY_RULES[storeName]?.minFinalProducts ?? 1;
}

export function buildStoreQualityWarning(
  storeName: string,
  finalCount: number,
  rawCount: number,
): string | null {
  const rule = STORE_QUALITY_RULES[storeName];
  if (!rule || finalCount >= rule.minFinalProducts) return null;

  const rawText = rawCount !== finalCount ? ` (antes del filtro: ${rawCount})` : '';
  return `${storeName} genero ${finalCount} productos finales${rawText}; minimo esperado ${rule.minFinalProducts}. Puede ser carga incompleta o cambio de estructura. Recomendacion: correr nuevamente y revisar logs si se repite.`;
}

export function getUnknownStoreRuleNames(knownStoreNames: readonly string[]): string[] {
  const known = new Set(knownStoreNames);
  return [...new Set([...Object.keys(STORE_QUALITY_RULES), ...Object.keys(STORE_RETRY_RULES)])]
    .filter((name) => !known.has(name))
    .sort();
}
