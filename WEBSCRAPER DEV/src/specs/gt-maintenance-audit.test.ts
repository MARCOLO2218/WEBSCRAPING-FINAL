import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const auditSource = readFileSync('src/gt-maintenance-audit.ts', 'utf8');
const coordinatorSource = readFileSync('src/scrape-facenco-energy.ts', 'utf8');

test('auditoria GT recorre el registro activo y no exporta ni persiste', () => {
  assert.match(auditSource, /createGuatemalaScraperRegistry/);
  assert.match(auditSource, /for \(const store of stores\)/);
  assert.doesNotMatch(auditSource, /saveProductsToPostgres|writeExcel|writeFile|OUTPUT_FILE/);
  assert.match(auditSource, /await browser\.close\(\)/);
});

test('importar el coordinador no arranca scraping ni carga variables del archivo .env', () => {
  assert.match(coordinatorSource, /import\.meta\.url === pathToFileURL\(resolve\(process\.argv\[1\]\)\)\.href/);
  const mainIndex = coordinatorSource.indexOf('async function main()');
  const envLoadIndex = coordinatorSource.indexOf("loadEnv({ path: envFile })");
  assert.ok(mainIndex >= 0 && envLoadIndex > mainIndex);
});
