export type CountryCode = 'GT';

export type StoreDefinition = {
  id: string;
  name: string;
  countryCode: CountryCode;
  enabled: boolean;
};

// Fuente unica para las tiendas disponibles en la API y en el ejecutor.
// Al regionalizar, se agregaran nuevos CountryCode y tiendas en este catalogo.
export const STORE_CATALOG: readonly StoreDefinition[] = [
  { id: 'facenco', name: 'FACENCO', countryCode: 'GT', enabled: true },
  { id: 'camas-olympia-gt', name: 'Camas Olympia Online GT', countryCode: 'GT', enabled: true },
  { id: 'la-colchoneria-gt', name: 'La Colchoneria Guatemala', countryCode: 'GT', enabled: true },
  { id: 'sleep-gallery-gt', name: 'Sleep Gallery Guatemala', countryCode: 'GT', enabled: true },
  { id: 'serta-gt', name: 'Serta Guatemala', countryCode: 'GT', enabled: true },
  { id: 'americana-2000-gt', name: 'Americana 2000 Guatemala', countryCode: 'GT', enabled: true },
  { id: 'mattress-gt', name: 'Mattress Guatemala', countryCode: 'GT', enabled: true },
  { id: 'beds-dreams-gt', name: 'Beds & Dreams', countryCode: 'GT', enabled: true },
  { id: 'furniture-city-gt', name: 'Furniture City Guatemala', countryCode: 'GT', enabled: true },
  { id: 'la-curacao-gt', name: 'La Curacao Guatemala', countryCode: 'GT', enabled: true },
  { id: 'max-gt', name: 'MAX Guatemala', countryCode: 'GT', enabled: true },
  { id: 'elektra-gt', name: 'Elektra Guatemala', countryCode: 'GT', enabled: true },
  { id: 'walmart-gt', name: 'Walmart Guatemala', countryCode: 'GT', enabled: true },
  { id: 'cemaco-gt', name: 'Cemaco Guatemala', countryCode: 'GT', enabled: true },
  { id: 'siman-gt', name: 'Siman Guatemala', countryCode: 'GT', enabled: true },
  { id: 'suena-center-gt', name: 'Suena Center Guatemala', countryCode: 'GT', enabled: true },
  { id: 'dormilandia-gt', name: 'Dormilandia Guatemala', countryCode: 'GT', enabled: true },
  { id: 'dormisuenos-gt', name: 'Dormisuenos Guatemala', countryCode: 'GT', enabled: true },
  { id: 'bodegangas-gt', name: 'Bodegangas Guatemala', countryCode: 'GT', enabled: true },
] as const;

export const ENABLED_STORE_NAMES = STORE_CATALOG
  .filter((store) => store.enabled)
  .map((store) => store.name);

export function sanitizeStoreSelection(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const known = new Map(ENABLED_STORE_NAMES.map((name) => [name.toLowerCase(), name]));
  const selected = value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => known.get(item.toLowerCase()))
    .filter((item): item is string => Boolean(item));

  return [...new Set(selected)];
}

export function getStoreRegistrationDifferences(registeredNames: readonly string[]): {
  missing: string[];
  unknown: string[];
} {
  const registered = new Set(registeredNames);
  const enabled = new Set(ENABLED_STORE_NAMES);

  return {
    missing: ENABLED_STORE_NAMES.filter((name) => !registered.has(name)),
    unknown: [...registered].filter((name) => !enabled.has(name)),
  };
}
