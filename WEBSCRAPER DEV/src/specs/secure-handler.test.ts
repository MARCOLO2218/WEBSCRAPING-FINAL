import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createSecureHandler, canonicalHttpsOrigin } from '../server/secure-handler.js';
import { createScraperJobQueue } from '../server/scraper-job-queue.js';

const origin = 'https://catalog.example:8443';
async function withServer(transport: typeof fetch, action: (url: string) => Promise<void>) {
  const handler = createSecureHandler(origin, { publicDir: resolve('public'), outputCsv: 'unused',
    scraperJobQueue: createScraperJobQueue() }, transport);
  const server = createServer((req, res) => { void handler(req, res); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address() as { port: number };
  try { await action(`http://127.0.0.1:${address.port}`); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
const headers = { Host: 'catalog.example:8443', Origin: origin };
function clientFetch(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const client = request(url, options, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        const resultHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          for (const item of Array.isArray(value) ? value : value ? [value] : []) resultHeaders.append(name, item);
        }
        resolve(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: resultHeaders }));
      });
    });
    client.on('error', reject); client.end(options.body);
  });
}
test('composición exige origen HTTPS canónico', () => {
  assert.equal(canonicalHttpsOrigin(origin).origin, origin);
  for (const value of ['http://catalog.example', origin + '/', origin + '/path']) {
    assert.throws(() => canonicalHttpsOrigin(value));
  }
});
test('proxy conserva cookies y sobrescribe cabeceras de identidad/red', async () => {
  await withServer((async (url, options) => {
    assert.equal(String(url), 'http://127.0.0.1:8041/auth/login');
    const forwarded = options?.headers as Record<string, string>;
    assert.equal(forwarded['x-forwarded-for'], '127.0.0.1');
    assert.equal(forwarded['x-account-level'], undefined);
    assert.equal(forwarded['x-forwarded-proto'], 'https');
    return Response.json({ user_id: 'id' }, { headers: { 'Set-Cookie': '__Host-catalog_session=test; Secure; HttpOnly; Path=/' } });
  }) as typeof fetch, async url => {
    const response = await clientFetch(url + '/auth/login', { method: 'POST', headers: {
      ...headers, 'Content-Type': 'application/json', 'X-Forwarded-For': 'forged', 'X-Account-Level': 'superadmin' },
      body: '{}' });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie') || '', /Secure/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});
test('Host, Origin y endpoint interno no se pueden saltar', async () => {
  await withServer((async () => { throw new Error('No debe llamar backend'); }) as typeof fetch, async url => {
    assert.equal((await clientFetch(url + '/auth/me')).status, 400);
    assert.equal((await clientFetch(url + '/auth/login', { method: 'POST', headers: { Host: headers.Host } })).status, 403);
    assert.equal((await clientFetch(url + '/auth/check-write', { method: 'POST', headers })).status, 404);
  });
});
test('catálogo requiere sesión y backend caído niega acceso', async () => {
  for (const status of [401, 503]) await withServer((async () => new Response(null, { status })) as typeof fetch, async url => {
    assert.equal((await clientFetch(url + '/catalogo-nicaragua.html', { headers })).status, status);
  });
});
test('HTTPS sirve portada preparada sin depender de index legacy ni backend', async () => {
  await withServer((async () => { throw new Error('No debe consultar auth para portada'); }) as typeof fetch, async url => {
    const response = await clientFetch(url + '/', { headers });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /login-form/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });
});
