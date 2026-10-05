import type { IncomingMessage, ServerResponse } from 'node:http';

export type AccessContext = {
  account_level: 'superadmin' | 'admin' | 'usuario';
  countries: { code: string; enabled: boolean; can_access: boolean; role: string | null }[];
};
export type AccessProvider = {
  readSession: (req: IncomingMessage) => Promise<AccessContext | null>;
  validateWrite: (req: IncomingMessage) => Promise<boolean>;
};

export function accessRequirement(path: string): { country?: string; write?: boolean; operator?: boolean; admin?: boolean } | null {
  if (['/', '/index.html', '/facenco-theme.css', '/portal-access.js', '/catalog-menu.js', '/catalog-access.js', '/price-upload.js', '/nicaragua-catalogo.js', '/styles.css', '/app.js'].includes(path)
    || /^\/assets\/[a-zA-Z0-9_.-]+$/.test(path)) return null;
  if (path === '/admin-usuarios.html') return { admin: true };
  if (path === '/catalogo-nicaragua.html' || path === '/nicaragua-catalogo.json') return { country: 'NC' };
  if (path.startsWith('/api/nc/')) return { country: 'NC', operator: true, write: path === '/api/nc/run' };
  if (path === '/catalogo-guatemala.html' || path === '/output/comparacion_colchones.csv') return { country: 'GT' };
  if (['/api/run-scraper', '/api/facenco-prices'].includes(path)) return { country: 'GT', operator: true, write: true };
  if (['/api/scraper-job', '/api/scraper-status'].includes(path)) return { country: 'GT', operator: true };
  if (['/api/products', '/api/latest-run', '/api/summary', '/api/export.csv', '/api/image'].includes(path)) return { country: 'GT' };
  // Desconocidos no se sirven como archivos públicos durante integración.
  return { admin: true };
}

export function createAccessGuard(provider: AccessProvider) {
  return async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> => {
    const reject = (status: number, error: string) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error })); return false;
    };
    let path: string;
    try { path = decodeURIComponent(url.pathname); } catch { return reject(400, 'Ruta inválida.'); }
    const requirement = accessRequirement(path);
    if (!requirement) return true;
    try {
      const context = await provider.readSession(req);
      if (!context) return reject(401, 'Inicia sesión para continuar.');
      const administrative = ['admin', 'superadmin'].includes(context.account_level);
      if (requirement.admin && !administrative) return reject(403, 'Acceso administrativo requerido.');
      if (requirement.country) {
        const country = context.countries.find(item => item.code === requirement.country);
        if (!country?.enabled || !country.can_access) return reject(403, 'País no autorizado.');
        if (requirement.operator && !administrative && country.role !== 'operador') return reject(403, 'Permiso de operador requerido.');
      }
      if (requirement.write && !await provider.validateWrite(req)) return reject(403, 'Solicitud de escritura no válida.');
      res.setHeader('Cache-Control', 'no-store');
      return true;
    } catch { return reject(503, 'Servicio de acceso no disponible.'); }
  };
}
