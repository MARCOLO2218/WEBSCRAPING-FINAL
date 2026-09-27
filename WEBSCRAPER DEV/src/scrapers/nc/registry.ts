import type { StoreScraper, TimestampedStoreScraper } from '../types.js';
import { STORE_CATALOG, type StoreDefinition } from '../../config/store-catalog.js';

export const NICARAGUA_STORE_ORDER = [
  'La Curacao Nicaragua',
  'El Gallo mas Gallo Nicaragua',
  'Siman Nicaragua',
  'Walmart Nicaragua',
  'Maxi Pali Nicaragua',
] as const;

export type NicaraguaScraperDependencies = {
  laCuracao: TimestampedStoreScraper;
  elGallo: TimestampedStoreScraper;
  siman: TimestampedStoreScraper;
  walmart: TimestampedStoreScraper;
  maxipali: TimestampedStoreScraper;
};

export type NicaraguaScraperRegistryOptions = {
  countryEnabled?: boolean;
  storeCatalog?: readonly StoreDefinition[];
};

export function createNicaraguaScraperRegistry(
  scrapedAt: string,
  scrapers: NicaraguaScraperDependencies,
  options: NicaraguaScraperRegistryOptions = {},
): StoreScraper[] {
  if (!options.countryEnabled) return [];

  const enabledStoreIds = new Set((options.storeCatalog ?? STORE_CATALOG)
    .filter((store) => store.countryCode === 'NC' && store.enabled)
    .map((store) => store.id));
  const registrations: readonly { id: string; name: (typeof NICARAGUA_STORE_ORDER)[number]; run: StoreScraper['run'] }[] = [
    { id: 'la-curacao-nc', name: NICARAGUA_STORE_ORDER[0], run: (page) => scrapers.laCuracao(page, scrapedAt) },
    { id: 'el-gallo-nc', name: NICARAGUA_STORE_ORDER[1], run: (page) => scrapers.elGallo(page, scrapedAt) },
    { id: 'siman-nc', name: NICARAGUA_STORE_ORDER[2], run: (page) => scrapers.siman(page, scrapedAt) },
    { id: 'walmart-nc', name: NICARAGUA_STORE_ORDER[3], run: (page) => scrapers.walmart(page, scrapedAt) },
    { id: 'maxipali-nc', name: NICARAGUA_STORE_ORDER[4], run: (page) => scrapers.maxipali(page, scrapedAt) },
  ];
  return registrations
    .filter((registration) => enabledStoreIds.has(registration.id))
    .map(({ name, run }) => ({ name, run }));
}
