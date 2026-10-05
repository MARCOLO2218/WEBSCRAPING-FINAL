import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CatalogRouteDependencies } from './routes.js';
import { createCatalogRequestHandler } from './routes.js';
import { createAccessGuard } from './access-guard.js';
import { createHttpAccessProvider } from './auth-provider.js';
import { serveStatic } from './http.js';

export function canonicalHttpsOrigin(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) throw new Error('Origen HTTPS canónico requerido.');
  return url;
}

export function createSecureHandler(origin: string, dependencies: CatalogRouteDependencies,
  transport: typeof fetch = fetch) {
  const allowed = canonicalHttpsOrigin(origin);
  const authBase = 'http://127.0.0.1:8041';
  const catalog = createCatalogRequestHandler({ ...dependencies,
    accessGuard: createAccessGuard(createHttpAccessProvider(authBase, transport)) });
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const reject = (status: number, error: string) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error }));
    };
    if (req.headers.host !== allowed.host) return reject(400, 'Host no permitido.');
    let url: URL;
    try { url = new URL(req.url || '/', origin); }
    catch { return reject(400, 'Ruta inválida.'); }
    if (url.origin !== origin) return reject(400, 'Destino no permitido.');
    if (['/', '/index.html'].includes(url.pathname)) {
      res.setHeader('Cache-Control', 'no-store');
      serveStatic('/portal-facenco.html', res, dependencies.publicDir);
      return;
    }
    if (!url.pathname.startsWith('/auth/')) return catalog(req, res);
    if (!['/auth/login', '/auth/logout', '/auth/me'].includes(url.pathname)
      && !/^\/auth\/admin\/users(?:\/audit-events|\/[a-zA-Z0-9_-]+\/(?:country-permissions|password|status|level))?$/.test(url.pathname)) {
      return reject(404, 'Ruta de acceso no disponible.');
    }
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method || '')) return reject(405, 'Método no permitido.');
    const write = req.method !== 'GET';
    if (write && req.headers.origin !== origin) return reject(403, 'Origen no permitido.');
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        const buffer = Buffer.from(chunk); size += buffer.length;
        if (size > 50000) return reject(413, 'Solicitud demasiado grande.');
        chunks.push(buffer);
      }
      const headers: Record<string, string> = { 'x-forwarded-for': req.socket.remoteAddress || '127.0.0.1',
        'x-forwarded-proto': 'https' };
      for (const name of ['cookie', 'origin', 'x-csrf-token', 'content-type']) {
        const value = req.headers[name]; if (typeof value === 'string') headers[name] = value;
      }
      const response = await transport(new URL(url.pathname + url.search, authBase), {
        method: req.method, headers, body: write && size ? Buffer.concat(chunks) : undefined,
        redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      const body = Buffer.from(await response.arrayBuffer());
      if (body.length > 2_000_000) return reject(502, 'Respuesta de acceso demasiado grande.');
      res.statusCode = response.status;
      res.setHeader('Cache-Control', 'no-store');
      for (const name of ['content-type', 'retry-after']) {
        const value = response.headers.get(name); if (value) res.setHeader(name, value);
      }
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader('Set-Cookie', cookies);
      res.end(body);
    } catch { reject(503, 'Servicio de acceso no disponible.'); }
  };
}
