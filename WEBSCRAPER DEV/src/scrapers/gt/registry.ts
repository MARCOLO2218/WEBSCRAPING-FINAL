import type { StoreScraper, TimestampedStoreScraper } from '../types.js';

export type GuatemalaScraperDependencies = {
  facenco: TimestampedStoreScraper;
  olympia: TimestampedStoreScraper;
  laColchoneria: TimestampedStoreScraper;
  sleepGallery: TimestampedStoreScraper;
  serta: TimestampedStoreScraper;
  americana2000: TimestampedStoreScraper;
  mattress: TimestampedStoreScraper;
  bedsDreams: TimestampedStoreScraper;
  furnitureCity: TimestampedStoreScraper;
  laCuracao: TimestampedStoreScraper;
  max: TimestampedStoreScraper;
  elektra: TimestampedStoreScraper;
  walmart: TimestampedStoreScraper;
  cemaco: TimestampedStoreScraper;
  siman: TimestampedStoreScraper;
  suenaCenter: TimestampedStoreScraper;
  dormilandia: TimestampedStoreScraper;
  dormisuenos: TimestampedStoreScraper;
  bodegangas: TimestampedStoreScraper;
};

export function createGuatemalaScraperRegistry(
  scrapedAt: string,
  scrapers: GuatemalaScraperDependencies,
): StoreScraper[] {
  return [
    { name: 'FACENCO', run: (page) => scrapers.facenco(page, scrapedAt) },
    { name: 'Camas Olympia Online GT', run: (page) => scrapers.olympia(page, scrapedAt) },
    { name: 'La Colchoneria Guatemala', run: (page) => scrapers.laColchoneria(page, scrapedAt) },
    { name: 'Sleep Gallery Guatemala', run: (page) => scrapers.sleepGallery(page, scrapedAt) },
    { name: 'Serta Guatemala', run: (page) => scrapers.serta(page, scrapedAt) },
    { name: 'Americana 2000 Guatemala', run: (page) => scrapers.americana2000(page, scrapedAt) },
    { name: 'Mattress Guatemala', run: (page) => scrapers.mattress(page, scrapedAt) },
    { name: 'Beds & Dreams', run: (page) => scrapers.bedsDreams(page, scrapedAt) },
    { name: 'Furniture City Guatemala', run: (page) => scrapers.furnitureCity(page, scrapedAt) },
    { name: 'La Curacao Guatemala', run: (page) => scrapers.laCuracao(page, scrapedAt) },
    { name: 'MAX Guatemala', run: (page) => scrapers.max(page, scrapedAt) },
    { name: 'Elektra Guatemala', run: (page) => scrapers.elektra(page, scrapedAt) },
    { name: 'Walmart Guatemala', run: (page) => scrapers.walmart(page, scrapedAt) },
    { name: 'Cemaco Guatemala', run: (page) => scrapers.cemaco(page, scrapedAt) },
    { name: 'Siman Guatemala', run: (page) => scrapers.siman(page, scrapedAt) },
    { name: 'Suena Center Guatemala', run: (page) => scrapers.suenaCenter(page, scrapedAt) },
    { name: 'Dormilandia Guatemala', run: (page) => scrapers.dormilandia(page, scrapedAt) },
    { name: 'Dormisuenos Guatemala', run: (page) => scrapers.dormisuenos(page, scrapedAt) },
    { name: 'Bodegangas Guatemala', run: (page) => scrapers.bodegangas(page, scrapedAt) },
  ];
}
