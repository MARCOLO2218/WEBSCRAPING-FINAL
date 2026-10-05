import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function browser(level = 'usuario', role = 'lector', enabled = true) {
  const nodes = [{ hidden: false }];
  const calls: { path: string; options: RequestInit }[] = [];
  let active = true;
  const context = { account_level: level, countries: [
    { code: 'GT', enabled: true, can_access: true, role: 'lector' },
    { code: 'NC', enabled, can_access: enabled, role },
  ] };
  const document = { cookie: '__Host-catalog_csrf=csrf-test', hidden: false,
    querySelectorAll: () => nodes, dispatchEvent: () => {}, addEventListener: () => {} };
  const window: any = { location: { protocol: 'https:', origin: 'https://catalog.example:8443', pathname: '/catalogo-nicaragua.html' },
    fetch: async (path: URL | string, options: RequestInit) => {
      calls.push({ path: String(path), options });
      if (String(path) === '/auth/me') return active ? Response.json(context) : new Response(null, { status: 401 });
      return Response.json({ ok: true });
    } };
  runInNewContext(readFileSync('public/catalog-access.js', 'utf8'), { window, document, URL, Headers,
    CustomEvent: class { constructor(public name: string, public data: unknown) {} } });
  return { api: window.catalogAccess, nodes, calls, document, context, revoke: () => { active = false; } };
}
test('lector consulta pero no ejecuta; ocultar botones no concede permisos', async () => {
  const b = browser(); await b.api.refresh();
  assert.equal(b.nodes[0].hidden, true);
  await b.api.request('/nicaragua-catalogo.json');
  await assert.rejects(b.api.request('/api/nc/run', { method: 'POST' }), /operador/);
  assert.equal(b.calls.some(call => call.path.endsWith('/api/nc/run')), false);
});
test('operador usa CSRF y consulta sesión antes de cada escritura', async () => {
  const b = browser('usuario', 'operador'); await b.api.refresh();
  assert.equal(b.nodes[0].hidden, false);
  await b.api.request('/api/nc/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const call = b.calls.at(-1)!;
  assert.equal(new Headers(call.options.headers).get('X-CSRF-Token'), 'csrf-test');
  assert.equal(call.options.credentials, 'same-origin');
  assert.equal(b.calls.at(-2)?.path, '/auth/me');
  b.revoke();
  await assert.rejects(b.api.request('/api/nc/run', { method: 'POST' }), /sesión venció/);
  assert.equal(b.nodes[0].hidden, true);
});
test('admin y superadmin operan sólo países habilitados', async () => {
  for (const level of ['admin', 'superadmin']) {
    const b = browser(level); await b.api.refresh(); assert.equal(b.api.canOperate(), true);
    b.context.countries[1].enabled = false; await b.api.refresh();
    assert.equal(b.api.canOperate(), false);
  }
});
test('CSRF ausente y destino externo no envían escritura', async () => {
  const b = browser('admin'); b.document.cookie = '';
  await assert.rejects(b.api.request('/api/nc/run', { method: 'POST' }), /verificar la sesión/);
  await assert.rejects(b.api.request('https://other.example/path'), /Destino/);
});
test('ambos catálogos cargan cliente de permisos antes de sus acciones', () => {
  for (const [file, script] of [['catalogo-guatemala.html', 'app.js'], ['catalogo-nicaragua.html', 'nicaragua-catalogo.js']]) {
    const html = readFileSync(`public/${file}`, 'utf8');
    assert.ok(html.indexOf('/catalog-access.js') < html.indexOf(`/${script}`));
  }
  for (const script of ['app.js', 'price-upload.js', 'nicaragua-catalogo.js']) {
    assert.match(readFileSync(`public/${script}`, 'utf8'), /window.catalogAccess.request/);
  }
});
