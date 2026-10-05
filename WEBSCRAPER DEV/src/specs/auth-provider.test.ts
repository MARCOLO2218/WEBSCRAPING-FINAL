import test from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { createHttpAccessProvider } from '../server/auth-provider.js';

const req = { headers: { cookie: 'session=test', origin: 'https://catalog.example',
  'x-csrf-token': 'test', 'x-account-level': 'superadmin' } } as unknown as IncomingMessage;
const context = { account_level: 'usuario', countries: [
  { code: 'NC', enabled: true, can_access: true, role: 'lector' },
] };

test('proveedor sólo permite destino loopback explícito', () => {
  for (const url of ['https://example.com', 'http://localhost:8041', 'http://127.0.0.1',
    'http://127.0.0.1:8041/path', 'http://user@127.0.0.1:8041']) {
    assert.throws(() => createHttpAccessProvider(url));
  }
});
test('relee permisos sin caché y reenvía sólo cabeceras previstas', async () => {
  let count = 0;
  const provider = createHttpAccessProvider('http://127.0.0.1:8041', (async (url, options) => {
    count++;
    assert.equal(String(url), 'http://127.0.0.1:8041/auth/me');
    assert.equal(options?.redirect, 'error');
    assert.deepEqual(options?.headers, { cookie: 'session=test', origin: 'https://catalog.example', 'x-csrf-token': 'test' });
    return Response.json(context);
  }) as typeof fetch);
  assert.equal((await provider.readSession(req))?.account_level, 'usuario');
  await provider.readSession(req);
  assert.equal(count, 2);
});
test('sesión ausente, malformada y backend caído se rechazan', async () => {
  const provider = (response: Response) => createHttpAccessProvider('http://127.0.0.1:8041',
    (async () => response) as typeof fetch);
  assert.equal(await provider(new Response(null, { status: 401 })).readSession(req), null);
  for (const response of [Response.json({}), Response.json({ ...context, account_level: 'root' }),
    new Response(null, { status: 503 })]) {
    await assert.rejects(provider(response).readSession(req));
  }
});
test('escrituras sólo aceptan confirmación 204 del backend', async () => {
  for (const status of [204, 403, 503]) {
    const provider = createHttpAccessProvider('http://127.0.0.1:8041', (async (url, options) => {
      assert.equal(String(url), 'http://127.0.0.1:8041/auth/check-write');
      assert.equal(options?.method, 'POST');
      return new Response(null, { status });
    }) as typeof fetch);
    if (status === 503) await assert.rejects(provider.validateWrite(req));
    else assert.equal(await provider.validateWrite(req), status === 204);
  }
});
