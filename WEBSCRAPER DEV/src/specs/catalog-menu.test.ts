import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('menú ofrece administración sólo para niveles emitidos por servidor', () => {
  const source = readFileSync('public/catalog-menu.js', 'utf8');
  assert.match(source, /\['admin', 'superadmin'\]\.includes\(context\?\.account_level\)/);
  assert.match(source, /\/auth\/me/);
  assert.match(source, /aria-expanded/);
  assert.match(source, /event.key === 'Escape'/);
  assert.doesNotMatch(source, /innerHTML|localStorage|sessionStorage/);
});
test('NC usa paneles responsive y actualiza datos al recuperar visibilidad', () => {
  const html = readFileSync('public/catalogo-nicaragua.html', 'utf8');
  for (const name of ['nc-main', 'nc-panel', 'run-options', 'nc-filters']) assert.ok(html.includes(`class="${name}"`));
  assert.match(readFileSync('public/nicaragua-catalogo.js', 'utf8'), /!document.hidden && !activeJob/);
});
