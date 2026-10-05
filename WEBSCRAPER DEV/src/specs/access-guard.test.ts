import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createAccessGuard, accessRequirement, type AccessContext } from '../server/access-guard.js';

const user: AccessContext = { account_level: 'usuario', countries: [
  { code: 'GT', enabled: true, can_access: true, role: 'lector' },
  { code: 'NC', enabled: true, can_access: false, role: null },
] };
async function check(path: string, context: AccessContext | null = user, write = true) {
  let status = 200;
  const req = {} as IncomingMessage;
  const res = { writeHead: (code: number) => { status = code; }, end: () => {}, setHeader: () => {} } as unknown as ServerResponse;
  const guard = createAccessGuard({ readSession: async () => context, validateWrite: async () => write });
  const allowed = await guard(req, res, new URL(path, 'https://catalog.example'));
  return { allowed, status };
}
test('lectores no entran a NC por HTML, snapshot ni trabajo directo', async () => {
  for (const path of ['/catalogo-nicaragua.html', '/nicaragua-catalogo.json', '/api/nc/run', '/api/nc/job?id=1']) assert.equal((await check(path)).status, 403);
  assert.equal((await check('/catalogo-guatemala.html')).allowed, true);
  assert.equal((await check('/api/run-scraper')).status, 403);
  assert.equal((await check('/admin-usuarios.html')).status, 403);
});
test('sesión ausente bloquea recursos pero permite el portal', async () => {
  assert.equal((await check('/nicaragua-catalogo.json', null)).status, 401);
  assert.equal((await check('/', null)).allowed, true);
  assert.equal((await check('/facenco-theme.css', null)).allowed, true);
});
test('operador requiere CSRF/origen validados y permisos vigentes cada vez', async () => {
  const operator: AccessContext = { ...user, countries: [{ code: 'NC', enabled: true, can_access: true, role: 'operador' }] };
  assert.equal((await check('/api/nc/run', operator, false)).status, 403);
  assert.equal((await check('/api/nc/run', operator)).allowed, true);
  operator.countries[0].can_access = false;
  assert.equal((await check('/api/nc/run', operator)).status, 403);
});
test('admin no salta habilitación de país y CSV GT tiene país explícito', async () => {
  assert.equal(accessRequirement('/output/comparacion_colchones.csv')?.country, 'GT');
  const admin: AccessContext = { account_level: 'admin', countries: [{ code: 'NC', enabled: false, can_access: false, role: null }] };
  assert.equal((await check('/catalogo-nicaragua.html', admin)).status, 403);
});
