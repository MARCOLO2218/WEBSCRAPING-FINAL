import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync('src/scrape-facenco-energy.ts', 'utf8');
const engineSource = readFileSync('src/scrapers/shared/visual-engine.ts', 'utf8');
const gtVisualStoresSource = readFileSync('src/scrapers/gt/visual-stores.ts', 'utf8');
const gtPagedStoresSource = readFileSync('src/scrapers/gt/paged-visual-stores.ts', 'utf8');

test('el motor visual vive fuera del ejecutor principal', () => {
  for (const functionName of [
    'scrapeGenericGuatemalaStore',
    'scrapeVisualProductGrid',
    'scrapePagedVisualProductGrid',
  ]) {
    assert.match(engineSource, new RegExp(`(?:async )?function ${functionName}\\b`));
    assert.doesNotMatch(mainSource, new RegExp(`(?:async )?function ${functionName}\\b`));
  }
  assert.match(mainSource, /createVisualScraperEngine/);
});

test('Dormisuenos y Bodegangas viven fuera del ejecutor principal', () => {
  for (const functionName of ['scrapeDormisuenosGt', 'scrapeBodegangasGt']) {
    assert.doesNotMatch(mainSource, new RegExp(`(?:async )?function ${functionName}\\b`));
    assert.match(gtPagedStoresSource, new RegExp(`(?:async )?function ${functionName}\\b`));
  }
});

test('las primeras tiendas visuales GT viven fuera del ejecutor', () => {
  for (const functionName of ['scrapeLaCuracao', 'scrapeElektraGt', 'scrapeCemacoGt', 'scrapeDormilandiaGt']) {
    assert.doesNotMatch(mainSource, new RegExp(`(?:async )?function ${functionName}\\b`));
  }
  for (const storeName of ['La Curacao Guatemala', 'Elektra Guatemala', 'Cemaco Guatemala', 'Dormilandia Guatemala']) {
    assert.match(gtVisualStoresSource, new RegExp(storeName));
  }
});
