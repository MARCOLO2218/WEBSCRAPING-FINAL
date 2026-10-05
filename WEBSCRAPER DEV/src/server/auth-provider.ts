import type { IncomingMessage } from 'node:http';
import type { AccessContext, AccessProvider } from './access-guard.js';

// Sólo composición explícita: no lee .env ni inicia servicios al importar.
export function createHttpAccessProvider(baseUrl: string, transport: typeof fetch = fetch): AccessProvider {
  const base = new URL(baseUrl);
  if (base.protocol !== 'http:' || base.hostname !== '127.0.0.1'
    || !base.port || base.username || base.password || base.pathname !== '/'
    || base.search || base.hash) throw new Error('Destino auth debe ser loopback explícito.');

  const call = (path: string, req: IncomingMessage, method: string) => {
    const headers: Record<string, string> = {};
    for (const name of ['cookie', 'origin', 'x-csrf-token']) {
      const value = req.headers[name];
      if (typeof value === 'string') headers[name] = value;
    }
    return transport(new URL(path, base), {
      method, headers, redirect: 'error', signal: AbortSignal.timeout(5000),
    });
  };
  return {
    async readSession(req) {
      const response = await call('/auth/me', req, 'GET');
      if (response.status === 401) return null;
      if (response.status !== 200) throw new Error('Acceso no disponible.');
      const data = await response.json() as AccessContext;
      if (!data || !['usuario', 'admin', 'superadmin'].includes(data.account_level)
        || !Array.isArray(data.countries) || data.countries.length > 100
        || data.countries.some(country => !country || !/^[A-Z]{2}$/.test(country.code)
          || typeof country.enabled !== 'boolean' || typeof country.can_access !== 'boolean'
          || ![null, 'lector', 'operador'].includes(country.role))) {
        throw new Error('Respuesta de acceso inválida.');
      }
      return data;
    },
    async validateWrite(req) {
      const response = await call('/auth/check-write', req, 'POST');
      if ([401, 403].includes(response.status)) return false;
      if (response.status !== 204) throw new Error('Validación de escritura no disponible.');
      return true;
    },
  };
}
