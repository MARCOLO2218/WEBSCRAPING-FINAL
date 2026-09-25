import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../scripts/nicaragua-stores-pilot.mjs', import.meta.url), 'utf8');

test('piloto Nicaragua cubre las cuatro tiendas nuevas sin escribir base de datos', () => {
  for (const store of ['el-gallo', 'siman', 'walmart', 'maxipali']) assert.match(source, new RegExp(`['\"]${store}['\"]`));
  assert.match(source, /databaseWrites:\s*false/);
  assert.doesNotMatch(source, /\b(pg|postgres|insert|update|delete)\b/i);
});

test('piloto Nicaragua siempre cierra Chromium y reporta errores', () => {
  assert.match(source, /finally\s*\{/);
  assert.match(source, /browser\.close\(\)/);
  assert.match(source, /status:\s*'error'/);
});
