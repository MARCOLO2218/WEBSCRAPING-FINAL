import { writeFile, rename, unlink, readFile, open } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

export function buildNcPreviewSnapshot(report, scrapedAt) {
  if (report.status !== 'ok' || report.country !== 'NC' || report.currency !== 'NIO'
    || report.stores.length !== 5 || new Set(report.stores.map(store => store.store)).size !== 5
    || report.stores.some(store => store.status !== 'ok' || !store.products?.length)) {
    throw new Error('No se publica vista NC con ejecución incompleta');
  }
  const products = report.stores.flatMap(store => store.products);
  if (products.some(product => product.country !== 'NC' || product.currency !== 'NIO')) throw new Error('Producto ajeno a NC/NIO');
  return { version: 1, country: 'NC', currency: 'NIO', scrapedAt, mode: 'dev_preview',
    stores: report.stores.map(({ products, diagnostics, ...store }) => store), products };
}

export async function publishNcPreviewSnapshot(report, scrapedAt, publicDir) {
  const target = resolve(publicDir, 'nicaragua-catalogo.json');
  const lock = await open(`${target}.lock`, 'wx');
  try {
  let previous;
  try { previous = JSON.parse(await readFile(target, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const snapshot = mergeNcPreviewSnapshot(report, scrapedAt, previous);
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(snapshot), { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => undefined); }
  return target;
  } finally { await lock.close(); await unlink(`${target}.lock`); }
}

export function mergeNcPreviewSnapshot(report, scrapedAt, previous) {
  const ids = { 'la-curacao': 'la-curacao-nc', 'el-gallo': 'el-gallo-nc', siman: 'siman-nc', walmart: 'walmart-nc', maxipali: 'maxipali-nc' };
  if (report.country !== 'NC' || report.currency !== 'NIO' || !report.stores.length
    || report.stores.some(store => !Object.hasOwn(ids, store.store))
    || new Set(report.stores.map(store => store.store)).size !== report.stores.length) throw new Error('Informe NC inválido');
  if (previous && (previous.country !== 'NC' || previous.currency !== 'NIO' || previous.version !== 1)) throw new Error('Snapshot anterior inválido');
  let products = [...(previous?.products || [])];
  const stores = new Map((previous?.stores || []).map(store => [store.store, store]));
  for (const { products: rows, diagnostics, ...store } of report.stores) {
    const old = stores.get(store.store);
    if (store.status === 'ok' && rows?.length) {
      if (rows.some(row => row.country !== 'NC' || row.currency !== 'NIO' || row.store_id !== ids[store.store])) throw new Error('Producto ajeno a tienda NC');
      products = products.filter(row => row.store_id !== ids[store.store]).concat(rows);
      stores.set(store.store, { ...store, scrapedAt, attemptedAt: scrapedAt });
    } else stores.set(store.store, { ...old, ...store, scrapedAt: old?.scrapedAt || previous?.scrapedAt || null, attemptedAt: scrapedAt, retained: Boolean(old) });
  }
  return { version: 1, country: 'NC', currency: 'NIO', mode: 'dev_preview', scrapedAt, stores: [...stores.values()], products };
}
