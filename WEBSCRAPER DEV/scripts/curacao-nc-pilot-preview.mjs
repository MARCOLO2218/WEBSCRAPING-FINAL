import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { LA_CURACAO_NC, compareCuracaoNcCoverage } from '../dist/scrapers/nc/la-curacao.js';
import { readCuracaoNcDom, normalizeCuracaoNcListingUrl } from '../dist/scrapers/nc/la-curacao.js';
import { createCuracaoNcProduct } from '../dist/scrapers/nc/la-curacao.js';
import { reviewCuracaoNcSavedPages, checkCuracaoNcSavedUrl } from '../dist/scrapers/nc/la-curacao.js';

const devRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Uso: node scripts/curacao-nc-pilot-preview.mjs .regional-validation/spec039-pilot-captures.json');
  process.exit(1);
}

const manifestPath = resolve(args[0]);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
const expectedSources = Object.keys(LA_CURACAO_NC.sources);
if (manifest?.version !== 1 || !Array.isArray(manifest.sources)) {
  throw new Error('Manifiesto inválido: requiere version 1 y sources.');
}
const bySource = new Map();
for (const entry of manifest.sources) {
  if (!expectedSources.includes(entry?.source) || bySource.has(entry.source)
    || !Array.isArray(entry.pages) || entry.pages.length === 0) {
    throw new Error('Fuente desconocida/repetida o sin páginas en el manifiesto.');
  }
  const expectedStart = LA_CURACAO_NC.sources[entry.source];
  if (normalizeCuracaoNcListingUrl(entry.startUrl).href !== normalizeCuracaoNcListingUrl(expectedStart).href) {
    throw new Error(`La URL inicial no corresponde a la fuente ${entry.source}.`);
  }
  bySource.set(entry.source, entry);
}
if (expectedSources.some(source => !bySource.has(source))) {
  throw new Error('El piloto requiere las cinco fuentes NC declaradas.');
}

const browser = await chromium.launch({
  channel: process.env.CURACAO_NC_BROWSER_CHANNEL || (process.platform === 'win32' ? 'chrome' : undefined),
  headless: true,
});
const sourceRows = [];
const pageEvidence = [];
const productsByUrl = new Map();
const candidateErrors = [];
let mainReview;
try {
  const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();

  for (const source of expectedSources) {
    const entry = bySource.get(source);
    const samples = [];
    for (let index = 0; index < entry.pages.length; index += 1) {
      const capture = entry.pages[index];
      const expectedUrl = new URL(entry.startUrl);
      if (index > 0) expectedUrl.searchParams.set('p', String(index + 1));
      const url = normalizeCuracaoNcListingUrl(capture.url);
      if (url.href !== normalizeCuracaoNcListingUrl(expectedUrl.href).href) {
        throw new Error(`Secuencia de páginas inválida para ${source}, posición ${index + 1}.`);
      }
      const html = readFileSync(resolve(dirname(manifestPath), capture.file), 'utf8');
      const savedUrlVerified = checkCuracaoNcSavedUrl(html, url.href);
      if (!savedUrlVerified) throw new Error(`El HTML no confirma su URL guardada: ${capture.file}`);
      await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const result = await readCuracaoNcDom(page, url.href, { savedHtml: true });
      const sample = { url: url.href, sha256: createHash('sha256').update(html).digest('hex'), page: result };
      samples.push(sample);
      pageEvidence.push({ source, url: url.href, sha256: sample.sha256, cards: result.cardCount,
        extracted: result.items.length, complete: result.complete, issues: result.issues, warnings: result.warnings });

      for (const item of result.items) {
        try {
          if (!new URL(item.productUrl).pathname.endsWith('/p')) throw new Error('URL de producto sin ruta /p.');
          const candidate = createCuracaoNcProduct({ ...item,
            regularPrice: item.regularPriceText, salePrice: item.salePriceText });
          const rows = productsByUrl.get(candidate.productUrl) ?? [];
          rows.push({ source, product: candidate });
          productsByUrl.set(candidate.productUrl, rows);
        } catch (error) {
          candidateErrors.push({ source, productId: item.productId,
            error: error instanceof Error ? error.message : 'producto_invalido' });
        }
      }
    }

    const review = await reviewCuracaoNcSavedPages(entry.startUrl, samples);
    if (source === 'principal') mainReview = review;
    const products = samples.flatMap(sample => sample.page.items.map(item => ({
      productId: item.productId, productUrl: item.productUrl,
    })));
    sourceRows.push({ source, productIds: products.map(product => product.productId), products,
      complete: review.complete });
  }
} finally {
  await browser.close();
}

const comparison = compareCuracaoNcCoverage(sourceRows);
const fieldConflicts = [];
for (const [productUrl, rows] of productsByUrl) {
  const main = rows.find(row => row.source === 'principal')?.product;
  if (!main) continue;
  for (const { source, product } of rows.filter(row => row.source !== 'principal')) {
    for (const field of ['productName', 'regularPrice', 'salePrice', 'discount']) {
      if (product[field] !== main[field]) fieldConflicts.push({ productUrl, source, field });
    }
  }
}

const report = {
  status: candidateErrors.length || fieldConflicts.length ? 'preview_with_errors' : 'preview_only_not_activated',
  version: 'spec039-pilot-preview-v1',
  execution: { networkRequestsAllowed: false, databaseConnection: false, writes: 0, ncActivated: false },
  sourcePages: pageEvidence,
  sourceCoverage: { complete: comparison.complete, equivalent: comparison.equivalent,
    incompleteSources: comparison.incompleteSources, sharedUrls: comparison.shared.length,
    onlyPrincipal: comparison.onlyMain.length, onlyBySize: comparison.onlySizes.length,
    uniqueUrls: comparison.uniqueTotal, camasDeclaredTotal: mainReview?.declaredTotal ?? null,
    camasReason: mainReview?.reason ?? 'not_reviewed' },
  candidates: { observedUniqueProducts: productsByUrl.size,
    validatedUniqueProducts: productsByUrl.size,
    candidateErrors, crossSourceFieldConflicts: fieldConflicts },
  notes: [
    'Vista previa local desde HTML guardado; no visita el sitio ni persiste datos.',
    '53/54 en Camas y ausencia de total/paginación en las cuatro fuentes por tamaño mantienen la cobertura incompleta.',
    'Esta salida no habilita NC ni autoriza una importación o escritura en PostgreSQL.',
  ],
};

const outputDir = resolve(devRoot, '.regional-validation');
mkdirSync(outputDir, { recursive: true });
const outputPath = resolve(outputDir, 'spec039-pilot-preview.json');
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: outputPath, status: report.status,
  candidates: report.candidates.observedUniqueProducts, coverageComplete: report.sourceCoverage.complete,
  comparison: report.sourceCoverage, candidateErrors: candidateErrors.length,
  crossSourceFieldConflicts: fieldConflicts.length }, null, 2));
if (candidateErrors.length || fieldConflicts.length) process.exitCode = 2;
