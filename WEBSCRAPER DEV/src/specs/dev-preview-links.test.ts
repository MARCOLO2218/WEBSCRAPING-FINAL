import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/styles.css', import.meta.url), 'utf8');

test('el catálogo enlaza ambas vistas previas y aclara que no son operativas', () => {
  assert.match(html, /aria-label="Vistas previas regionales"/);
  assert.match(html, /href="\/demo-acceso-pais\.html"/);
  assert.match(html, /Demo de acceso y países/);
  assert.match(html, /href="\/admin-usuarios-demo\.html"/);
  assert.match(html, /Demo de usuarios y permisos/);
  assert.match(html, /el login no autentica y los cambios de usuarios no se guardan/);
  assert.match(css, /\.preview-nav/);
  assert.match(css, /@media \(max-width: 600px\)/);
});
