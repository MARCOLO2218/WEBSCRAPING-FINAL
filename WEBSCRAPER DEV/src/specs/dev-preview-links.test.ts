import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const portal = await readFile(new URL('../../public/index.html', import.meta.url), 'utf8');
const guatemalaCatalog = await readFile(new URL('../../public/catalogo-guatemala.html', import.meta.url), 'utf8');

test('la portada es un acceso regional independiente y muestra países después del login simulado', () => {
  assert.match(portal, /<title>Acceso regional/);
  assert.match(portal, /id="login-form"/);
  assert.match(portal, /id="countries" hidden/);
  assert.match(portal, /login\.hidden = true;\s*countries\.hidden = false;/);
  assert.match(portal, /id="demo-profile"/);
  assert.match(portal, /usuario: \{ label: 'Usuario', allowed: \['GT'\] \}/);
  assert.match(portal, /admin: \{ label: 'Administrador', allowed: \['GT', 'HN', 'NC', 'SV'\] \}/);
  assert.match(portal, /superadmin: \{ label: 'Superadmin', allowed: \['GT', 'HN', 'NC', 'SV'\] \}/);
  assert.match(portal, /Acceso denegado · país no asignado/);
  assert.match(portal, /denied\.hidden = allowed/);
  assert.match(portal, /No se envían ni almacenan los datos/);
  assert.doesNotMatch(portal, /fetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|localStorage|sessionStorage/i);
});

test('el selector abre cada país directamente y Guatemala ya no es la portada', () => {
  assert.match(portal, /href="\/catalogo-guatemala\.html">Ingresar a Guatemala/);
  assert.match(portal, /href="\/demo-acceso-pais\.html#hnPreviewStage">Ver piloto de Honduras/);
  assert.match(portal, /href="\/catalogo-nicaragua\.html">Ver catálogo DEV de Nicaragua/);
  assert.match(portal, /El Salvador/);
  assert.match(guatemalaCatalog, /id="runScraperButton"/);
  assert.match(guatemalaCatalog, /id="statusBar"/);
  assert.match(guatemalaCatalog, /href="\/">Volver al portal de países/);
});
