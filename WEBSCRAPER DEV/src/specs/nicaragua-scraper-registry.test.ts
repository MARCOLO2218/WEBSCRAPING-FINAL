import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNicaraguaScraperRegistry,
  NICARAGUA_STORE_ORDER,
  type NicaraguaScraperDependencies,
} from '../scrapers/nc/registry.js';
import { STORE_CATALOG } from '../config/store-catalog.js';

const emptyScraper = async () => [];
const dependencies: NicaraguaScraperDependencies = {
  laCuracao: emptyScraper,
  elGallo: emptyScraper,
  siman: emptyScraper,
  walmart: emptyScraper,
  maxipali: emptyScraper,
};

test('registro Nicaragua permanece apagado hasta activación explícita', () => {
  assert.deepEqual(createNicaraguaScraperRegistry('2026-09-25', dependencies), []);
  assert.deepEqual(createNicaraguaScraperRegistry('2026-09-25', dependencies, { countryEnabled: true }), []);
});

test('registro Nicaragua incluye sólo las tiendas NC habilitadas y conserva orden estable', () => {
  const storeCatalog = STORE_CATALOG.map((store) => ({
    ...store,
    enabled: ['walmart-nc', 'la-curacao-nc', 'maxipali-nc'].includes(store.id),
  })).reverse();
  const registry = createNicaraguaScraperRegistry('2026-09-25', dependencies, {
    countryEnabled: true,
    storeCatalog,
  });
  assert.deepEqual(registry.map((entry) => entry.name), [
    NICARAGUA_STORE_ORDER[0], NICARAGUA_STORE_ORDER[3], NICARAGUA_STORE_ORDER[4],
  ]);
  assert.equal(new Set(registry.map((entry) => entry.name)).size, 3);
});

test('registro Nicaragua no incluye tiendas habilitadas de otro país', () => {
  const storeCatalog = [
    { id: 'max-gt', name: 'MAX Guatemala', countryCode: 'GT', enabled: true },
  ] as const;
  assert.deepEqual(createNicaraguaScraperRegistry('2026-09-25', dependencies, {
    countryEnabled: true,
    storeCatalog,
  }), []);
});
