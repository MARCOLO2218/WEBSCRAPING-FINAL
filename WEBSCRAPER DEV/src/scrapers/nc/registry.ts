import type { StoreScraper, TimestampedStoreScraper } from '../types.js';

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

export function createNicaraguaScraperRegistry(
  scrapedAt: string,
  scrapers: NicaraguaScraperDependencies,
  enabled = false,
): StoreScraper[] {
  if (!enabled) return [];
  return [
    { name: NICARAGUA_STORE_ORDER[0], run: (page) => scrapers.laCuracao(page, scrapedAt) },
    { name: NICARAGUA_STORE_ORDER[1], run: (page) => scrapers.elGallo(page, scrapedAt) },
    { name: NICARAGUA_STORE_ORDER[2], run: (page) => scrapers.siman(page, scrapedAt) },
    { name: NICARAGUA_STORE_ORDER[3], run: (page) => scrapers.walmart(page, scrapedAt) },
    { name: NICARAGUA_STORE_ORDER[4], run: (page) => scrapers.maxipali(page, scrapedAt) },
  ];
}
