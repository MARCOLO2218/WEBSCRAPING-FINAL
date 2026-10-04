import { spawn } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NC_EXECUTION_STORES } from '../scrapers/nc/execution.js';
import { createScraperJobQueue, type RunScraper } from './scraper-job-queue.js';

export const runNcProcess: RunScraper = (stores = [], onProgress) => new Promise(resolve => {
  const states: Record<string, unknown> = Object.fromEntries(stores.map(store => [store, { store, status: 'queued' }]));
  let pending = '';
  let message = '';
  const output = () => JSON.stringify({ stores: Object.values(states), message });
  const child = spawn(process.execPath, ['scripts/scrape-nicaragua.mjs', '--publish-preview', '--summary', '--web-job', `--stores=${stores.join(',')}`], { cwd: process.cwd(), windowsHide: true });
  child.stdout.on('data', chunk => {
    pending += String(chunk);
    const lines = pending.split('\n'); pending = lines.pop()!.slice(-16000);
    for (const line of lines) if (line.startsWith('NC_PROGRESS ')) {
      try { const event = JSON.parse(line.slice(12)); if (Object.hasOwn(states, event.store)) states[event.store] = event; } catch { /* Ignore malformed progress. */ }
    }
    onProgress?.(output());
  });
  child.stderr.on('data', () => { message = 'La ejecución encontró un error; se conservarán los resultados anteriores de las tiendas fallidas.'; });
  let forceStop: ReturnType<typeof setTimeout> | undefined;
  const timeout = setTimeout(() => {
    message = 'La consulta excedió 30 minutos.'; child.kill('SIGTERM');
    forceStop = setTimeout(() => child.kill('SIGKILL'), 10000);
  }, 30 * 60_000);
  child.on('error', () => { message = 'No se pudo iniciar el ejecutor NC.'; });
  child.on('close', code => {
    clearTimeout(timeout); clearTimeout(forceStop);
    if (code !== 0 && !message) message = 'La consulta terminó con errores; revise los estados de tiendas.';
    resolve({ ok: code === 0, output: output() });
  });
});

export function createNcJobs(runScraper: RunScraper = runNcProcess) {
  const queue = createScraperJobQueue({ runScraper });
  return async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const reply = (status: number, body: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (url.pathname === '/api/nc/status' && req.method === 'GET') return reply(200, queue.getStatus());
    if (url.pathname === '/api/nc/job' && req.method === 'GET') {
      const job = queue.getJob(url.searchParams.get('id') || '');
      return reply(job ? 200 : 404, job ? { job } : { error: 'Trabajo no encontrado.' });
    }
    if (url.pathname !== '/api/nc/run' || req.method !== 'POST') return reply(404, { error: 'Ruta NC no disponible.' });
    if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== url.origin)) return reply(403, { error: 'Origen no permitido.' });
    if (!req.headers['content-type']?.startsWith('application/json')) return reply(400, { error: 'Se requiere JSON.' });
    try {
      let raw = '';
      for await (const chunk of req) { raw += String(chunk); if (raw.length > 4096) return reply(413, { error: 'Solicitud demasiado grande.' }); }
      const body = JSON.parse(raw);
      const stores = body.mode === 'all' && body.stores === undefined ? Object.keys(NC_EXECUTION_STORES) : body.stores;
      if (!Array.isArray(stores) || !stores.length || stores.length > 5 || new Set(stores).size !== stores.length || stores.some(store => typeof store !== 'string' || !Object.hasOwn(NC_EXECUTION_STORES, store))) return reply(400, { error: 'Seleccione tiendas NC válidas.' });
      if (queue.getStatus().queueSize >= 5) return reply(409, { error: 'La cola NC está llena. Espere al trabajo actual.' });
      reply(202, { job: queue.enqueue(stores) });
    } catch { reply(400, { error: 'Solicitud NC inválida.' }); }
  };
}
