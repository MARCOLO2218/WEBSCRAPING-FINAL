import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BEDS_DREAMS_SOURCE_URL } from '../scrapers/gt/beds-dreams.js';

const mainSource = readFileSync('src/scrape-facenco-energy.ts', 'utf8');
const bedsSource = readFileSync('src/scrapers/gt/beds-dreams.ts', 'utf8');

test('Beds & Dreams conserva sus colecciones comerciales', () => {
  assert.equal(BEDS_DREAMS_SOURCE_URL, 'https://www.bedsndreams.com/');
  for (const handle of ['simmons', 'indufoam', 'bases-electricas']) {
    assert.match(bedsSource, new RegExp(`handle: '${handle}'`));
  }
});

test('Beds & Dreams conserva nueve colecciones de confort y limite Shopify', () => {
  const comfortHandles = [
    'confort-suave', 'confort-semi-firme', 'confort-firme', 'confort-ortopedico',
    'confort-suave-indufoam', 'confort-semi-firme-indufoam',
    'confort-firme-indufoam', 'confort-ortopedico-indufoam', 'confort-extra-firme',
  ];
  for (const handle of comfortHandles) assert.match(bedsSource, new RegExp(`handle: '${handle}'`));
  assert.match(bedsSource, /searchParams\.set\('limit', '250'\)/);
  assert.match(bedsSource, /collections\/\$\{handle\}\/products\.json/);
});

test('Beds & Dreams vive fuera del ejecutor principal', () => {
  assert.doesNotMatch(mainSource, /async function scrapeBedsDreams\b/);
  assert.match(bedsSource, /export async function scrapeBedsDreams\b/);
});
