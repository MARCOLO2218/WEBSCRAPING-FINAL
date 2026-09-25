import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNicaraguaScraperRegistry,
  NICARAGUA_STORE_ORDER,
  type NicaraguaScraperDependencies,
} from '../scrapers/nc/registry.js';

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
});

test('registro Nicaragua conserva una entrada por tienda y orden estable', () => {
  const registry = createNicaraguaScraperRegistry('2026-09-25', dependencies, true);
  assert.deepEqual(registry.map((entry) => entry.name), [...NICARAGUA_STORE_ORDER]);
  assert.equal(new Set(registry.map((entry) => entry.name)).size, 5);
});
