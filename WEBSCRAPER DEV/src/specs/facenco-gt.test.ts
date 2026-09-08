import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Page } from 'playwright';
import {
  FACENCO_SOURCE_URL,
  createFacencoGuatemalaScraper,
} from '../scrapers/gt/facenco.js';

const mainSource = readFileSync('src/scrape-facenco-energy.ts', 'utf8');
const facencoSource = readFileSync('src/scrapers/gt/facenco.ts', 'utf8');

test('FACENCO conserva descubrimiento, navegación y metadatos', async () => {
  const catalogUrl = 'https://camasfacenco.com/linea-deluxe/';
  const productUrl = 'https://camasfacenco.com/producto/colchon-prueba/';
  const navigated: string[] = [];
  const evaluations: unknown[] = [
    [catalogUrl],
    [{
      productName: 'Colchón Prueba',
      productUrl,
      sourceUrl: catalogUrl,
      line: '',
      imageUrl: 'https://camasfacenco.com/img/prueba.jpg',
      imageAlt: 'Colchón Prueba',
    }],
    {
      headline: 'Colchón Prueba - Descanso',
      description: 'Descripción de prueba',
      warranty: '10 años de garantía',
      benefits: 'Soporte y confort',
    },
  ];
  const page = {
    evaluate: async () => evaluations.shift(),
    title: async () => 'Línea Deluxe',
  } as unknown as Page;
  const scraper = createFacencoGuatemalaScraper({
    navigate: async (_page, url) => { navigated.push(url); },
  });

  const rows = await scraper(page, '2026-09-03T12:00:00.000Z');

  assert.deepEqual(navigated, [FACENCO_SOURCE_URL, catalogUrl, productUrl]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.source_site, 'FACENCO');
  assert.equal(rows[0]?.line, 'Deluxe');
  assert.equal(rows[0]?.category, 'Colchones');
  assert.equal(rows[0]?.warranty, '10 años de garantía');
  assert.equal(rows[0]?.scraped_at, '2026-09-03T12:00:00.000Z');
});

test('FACENCO conserva selectores y fuentes de detalles', () => {
  assert.match(facencoSource, /et_link_options_data/);
  for (const route of ['linea-', 'producto', 'colchon', 'cama']) {
    assert.match(facencoSource, new RegExp(`\\\\/${route}`));
  }
  assert.match(facencoSource, /main, article, #main-content/);
  assert.match(facencoSource, /garant/);
  assert.match(facencoSource, /benefitPairs/);
});

test('FACENCO vive fuera del ejecutor principal', () => {
  for (const name of [
    'inferFacencoLine',
    'extractFacencoCatalogUrls',
    'extractFacencoCatalogProducts',
    'extractProductDetails',
    'scrapeFacenco',
  ]) {
    assert.doesNotMatch(mainSource, new RegExp(`(?:async )?function ${name}\\b`));
    assert.match(facencoSource, new RegExp(`(?:async )?function ${name}\\b`));
  }
  assert.doesNotMatch(mainSource, /const FACENCO_SOURCE_URL/);
  assert.match(mainSource, /createFacencoGuatemalaScraper/);
});
