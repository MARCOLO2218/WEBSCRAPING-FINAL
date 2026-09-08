import assert from 'node:assert/strict';
import test from 'node:test';
import type { Page } from 'playwright';
import { ENABLED_STORE_NAMES, getStoreRegistrationDifferences } from '../config/store-catalog.js';
import type { CsvProduct } from '../domain/product.js';
import { createGuatemalaScraperRegistry, type GuatemalaScraperDependencies } from '../scrapers/gt/registry.js';

test('el registro GT conserva las 19 tiendas del catalogo en el mismo orden', async () => {
  const calls: string[] = [];
  const dependency = (key: string) => async (_page: Page, scrapedAt: string): Promise<CsvProduct[]> => {
    calls.push(`${key}:${scrapedAt}`);
    return [];
  };
  const dependencies: GuatemalaScraperDependencies = {
    facenco: dependency('facenco'), olympia: dependency('olympia'),
    laColchoneria: dependency('laColchoneria'), sleepGallery: dependency('sleepGallery'),
    serta: dependency('serta'), americana2000: dependency('americana2000'),
    mattress: dependency('mattress'), bedsDreams: dependency('bedsDreams'),
    furnitureCity: dependency('furnitureCity'), laCuracao: dependency('laCuracao'),
    max: dependency('max'), elektra: dependency('elektra'), walmart: dependency('walmart'),
    cemaco: dependency('cemaco'), siman: dependency('siman'), suenaCenter: dependency('suenaCenter'),
    dormilandia: dependency('dormilandia'), dormisuenos: dependency('dormisuenos'),
    bodegangas: dependency('bodegangas'),
  };
  const registry = createGuatemalaScraperRegistry('2026-09-03T12:00:00.000Z', dependencies);

  assert.deepEqual(registry.map((store) => store.name), ENABLED_STORE_NAMES);
  assert.deepEqual(getStoreRegistrationDifferences(registry.map((store) => store.name)), { missing: [], unknown: [] });
  await registry[0].run({} as Page);
  assert.deepEqual(calls, ['facenco:2026-09-03T12:00:00.000Z']);
});
