import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/admin-usuarios-demo.html', import.meta.url), 'utf8');

test('la vista previa de usuarios es explícita, ficticia y no transmite ni persiste cambios', () => {
  assert.match(html, /Vista previa de diseño · no es el módulo operativo/);
  assert.match(html, /Los nombres y eventos son de ejemplo/);
  assert.match(html, /desaparecen al recargar/);
  assert.match(html, /no se envía información ni se modifica ninguna cuenta/i);
  assert.match(html, /superadmin\.demo/);
  assert.match(html, /admin\.demo/);
  assert.match(html, /usuario\.demo/);
  assert.match(html, /Guatemala/);
  assert.match(html, /Honduras/);
  assert.match(html, /Editar países/);
  assert.match(html, /Crear cuenta de ejemplo/);
  assert.match(html, /Restablecer demostración/);
  assert.match(html, /sólo en pantalla/);
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(html, /\/auth\/|\/api\//);
  assert.doesNotMatch(html, /https?:\/\//);
});
