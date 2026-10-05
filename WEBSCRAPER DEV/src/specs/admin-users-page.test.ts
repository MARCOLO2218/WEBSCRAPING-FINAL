import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/admin-usuarios.html', import.meta.url), 'utf8');

test('panel administrativo usa API protegida, CSRF y no inserta contenido de usuario como HTML', () => {
  assert.match(html, /\/auth\/admin\/users/);
  assert.match(html, /country-permissions/);
  assert.match(html, /X-CSRF-Token/);
  assert.match(html, /__Host-catalog_csrf=/);
  assert.match(html, /credentials:'same-origin'/);
  assert.match(html, /cache:'no-store'/);
  assert.match(html, /let writeLockReason = null/);
  assert.match(html, /let writePending = false/);
  assert.match(html, /response\.status === 401\) \{ writeLockReason = 'session'/);
  assert.match(html, /response\.status === 403 && code === 'csrf_no_valido'/);
  assert.match(html, /if \(isWrite && writePending\)/);
  assert.match(html, /data-admin-write/);
  assert.match(html, /Esta acción sólo está disponible para el superadmin/);
  assert.match(html, /Las cuentas superadmin están protegidas/);
  assert.match(html, /textContent/);
  assert.doesNotMatch(html, /\.innerHTML\s*=/);
  assert.match(html, /país seguirá bloqueado hasta que se habilite/);
  assert.match(html, /Superadmin/);
  assert.match(html, /Restablecer contraseña/);
  assert.match(html, /Bloquear/);
  assert.match(html, /Crear cuenta/);
  assert.match(html, /audit-events/);
  assert.match(html, /Lector/);
  assert.match(html, /Operador/);
});
