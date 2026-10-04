import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('piloto Curacao NC en vivo reutiliza lector estricto y permanece sin persistencia', () => {
  const source = readFileSync('scripts/curacao-nc-live-pilot.mjs', 'utf8');
  assert.match(source, /collectCuracaoNcPages\(LA_CURACAO_NC.categoryUrl/);
  assert.match(source, /readCuracaoNcDom\(page, url\)/);
  assert.match(source, /if \(!result.complete\) process.exitCode = 1/);
  assert.match(source, /finally\s*\{\s*await browser.close\(\)/);
  assert.doesNotMatch(source, /from ['"](?:pg|dotenv|node:fs)|writeFile|\.env|scrape-facenco-energy/);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.match(pkg.scripts['pilot:curacao-nc-live'], /scripts\/curacao-nc-live-pilot.mjs/);
});
