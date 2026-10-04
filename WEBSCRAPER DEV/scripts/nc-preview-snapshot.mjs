import { writeFile, rename, unlink } from 'node:fs/promises';
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
  const snapshot = buildNcPreviewSnapshot(report, scrapedAt);
  const target = resolve(publicDir, 'nicaragua-catalogo.json');
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(snapshot), { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, target);
  } finally { await unlink(temporary).catch(() => undefined); }
  return target;
}
