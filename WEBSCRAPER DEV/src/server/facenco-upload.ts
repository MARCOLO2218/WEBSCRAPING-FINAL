import ExcelJS from 'exceljs';
import { mkdir, writeFile, copyFile, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getCountry, validateCountryCurrency } from '../config/countries.js';

const MAX_BYTES = 5 * 1024 * 1024;
const columns = ['codigo_producto', 'producto', 'marca', 'linea', 'categoria', 'precio_regular',
  'precio_oferta', 'moneda', 'disponibilidad', 'activo', 'fecha_vigencia', 'observaciones', 'pais'];
export class UploadError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

export async function validatePrices(buffer: Buffer) {
  if (!buffer.length || buffer.length > MAX_BYTES) throw new UploadError('Archivo vacío o mayor de 5 MB.', 413);
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(buffer as any); }
  catch { throw new UploadError('No se pudo leer el archivo. Selecciona un Excel .xlsx válido.'); }
  const sheet = book.getWorksheet('Precios FACENCO');
  if (!sheet) throw new UploadError('Falta la hoja Precios FACENCO.');
  if (sheet.rowCount > 10004 || sheet.columnCount > 50) throw new UploadError('Máximo 10 000 filas y 50 columnas.');
  const headers = new Map<string, number>();
  const errors: string[] = [];
  sheet.getRow(4).eachCell((cell, index) => {
    const name = String(cell.value ?? '').trim().toLowerCase();
    if (!columns.includes(name)) errors.push(`Fila 4, columna ${index}: encabezado desconocido ${name}.`);
    else if (headers.has(name)) errors.push(`Fila 4: encabezado duplicado ${name}.`);
    else { headers.set(name, index); cell.value = name; }
  });
  for (const key of ['producto', 'precio_regular', 'precio_oferta']) {
    if (!headers.has(key)) errors.push(`Fila 4: falta la columna ${key}.`);
  }
  const names = new Set<string>();
  const codes = new Set<string>();
  const preview: Array<{ producto: string; precio_regular: string; precio_oferta: string; pais: string; moneda: string }> = [];
  const countries: Record<string, number> = {};
  let count = 0;
  sheet.eachRow((row, number) => {
    if (number <= 4) return;
    const get = (key: string) => headers.has(key) ? row.getCell(headers.get(key)!).value : null;
    const text = (key: string) => String(get(key) ?? '').trim();
    const fail = (key: string, message: string) => errors.push(`Fila ${number}, ${key}: ${message}`);
    const country = headers.has('pais') ? text('pais').toUpperCase() : 'GT';
    const currency = headers.has('pais') ? text('moneda').toUpperCase() : text('moneda').toUpperCase() || 'GTQ';
    const placeholders: Record<string, string> = { marca: 'FACENCO', pais: getCountry(country)?.code || 'GT', moneda: getCountry(country)?.currency || 'GTQ', disponibilidad: 'DISPONIBLE', activo: 'SI' };
    // La plantilla trae filas preparadas con estos valores aunque no haya producto.
    if ([...headers.keys()].every(key => !text(key) || text(key).toUpperCase() === placeholders[key])
        && row.values && !Object.keys(row.values).some(index => Number(index) > 0 && row.getCell(Number(index)).value != null && ![...headers.values()].includes(Number(index)))) return;
    row.eachCell((cell, index) => {
      if (cell.value === null || cell.value === '') return;
      if (![...headers.values()].includes(index)) fail(`columna ${index}`, 'datos sin encabezado.');
      if (typeof cell.value === 'object' && !(cell.value instanceof Date)) fail(`columna ${index}`, 'pega valores, no fórmulas u objetos.');
    });
    if (![...headers.keys()].some(key => text(key))) return;
    const active = text('activo').toUpperCase();
    if (active && !['SI', 'NO'].includes(active)) fail('activo', 'usa SI o NO.');
    if (headers.has('activo')) row.getCell(headers.get('activo')!).value = active || 'SI';
    if (active === 'NO') return;
    try { validateCountryCurrency(country, currency); }
    catch { fail('pais/moneda', 'usa GT/GTQ, HN/HNL, SV/USD o NC/NIO; ambos son obligatorios en el formato regional.'); }
    if (headers.has('pais')) row.getCell(headers.get('pais')!).value = country;
    if (headers.has('moneda')) row.getCell(headers.get('moneda')!).value = currency;
    const product = text('producto');
    if (!product || typeof get('producto') !== 'string') fail('producto', 'escribe el nombre del producto.');
    const key = country + ':' + product.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
    if (names.has(key)) fail('producto', 'producto duplicado.');
    names.add(key);
    const code = text('codigo_producto') ? country + ':' + text('codigo_producto').toLowerCase() : '';
    if (code && codes.has(code)) fail('codigo_producto', 'código duplicado.');
    if (code) codes.add(code);
    for (const field of ['precio_regular', 'precio_oferta']) {
      const value = text(field);
      if (!value) continue;
      const prefixes: Record<string, RegExp> = { GTQ: /^(GTQ|Q)\s*/i, HNL: /^(HNL|L)\s*/i, USD: /^(USD|\$)\s*/i, NIO: /^(NIO|C\$)\s*/i };
      const cleaned = prefixes[currency] ? value.replace(prefixes[currency], '') : value;
      if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(cleaned) || !Number.isFinite(Number(cleaned.replaceAll(',', '')))) {
        fail(field, 'usa un precio no negativo, por ejemplo 2500.00, y la moneda del país.');
      } else row.getCell(headers.get(field)!).value = Number(cleaned.replaceAll(',', ''));
    }
    if (!text('precio_regular') && !text('precio_oferta')) fail('precio_regular/precio_oferta', 'falta al menos un precio.');
    const date = get('fecha_vigencia');
    if (date instanceof Date && !Number.isNaN(date.getTime())) row.getCell(headers.get('fecha_vigencia')!).value = date.toISOString().slice(0, 10);
    else if (text('fecha_vigencia')) {
      const value = text('fecha_vigencia');
      const parsed = new Date(value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('fecha_vigencia', 'usa fecha Excel o AAAA-MM-DD.');
    }
    count++;
    countries[country] = (countries[country] || 0) + 1;
    if (preview.length < 5) preview.push({ producto: product, precio_regular: text('precio_regular'), precio_oferta: text('precio_oferta'), pais: country, moneda: currency });
  });
  if (!count) errors.push('No hay productos activos para cargar.');
  if (errors.length) throw new UploadError(errors.slice(0, 50).join('\n'));
  return { count, preview, countries, buffer: Buffer.from(await book.xlsx.writeBuffer()) };
}

export function createPriceUpload(target = resolve('data/precios_facenco.xlsx')) {
  let saving = false;
  return async (buffer: Buffer, confirm: boolean) => {
    if (saving) throw new UploadError('Otra carga está en curso. Intenta nuevamente.', 409);
    saving = true;
    let temp: string | undefined;
    try {
      const checked = await validatePrices(buffer);
      if (!confirm) return { ok: true, saved: false, count: checked.count, preview: checked.preview, countries: checked.countries };
      await mkdir(dirname(target), { recursive: true });
      const backupDir = join(dirname(target), 'backups');
      await mkdir(backupDir, { recursive: true });
      const backup = `precios_facenco-${randomUUID()}.xlsx`;
      let backedUp = true;
      try { await copyFile(target, join(backupDir, backup)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') backedUp = false; else throw error; }
      temp = join(dirname(target), `.precios-${randomUUID()}.xlsx`);
      await writeFile(temp, checked.buffer, { flag: 'wx' });
      await rename(temp, target);
      return { ok: true, saved: true, count: checked.count, countries: checked.countries, backup: backedUp ? backup : null };
    } finally {
      if (temp) await unlink(temp).catch(() => undefined);
      saving = false;
    }
  };
}

const savePrices = createPriceUpload();
export async function handlePriceUpload(req: IncomingMessage, res: ServerResponse, confirm: boolean) {
  try {
    if (req.method !== 'POST') throw new UploadError('Método no permitido.', 405);
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) throw new UploadError('Origen no permitido.', 403);
    if (req.headers['content-type'] !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') throw new UploadError('Selecciona un archivo .xlsx.', 415);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new UploadError('El archivo supera 5 MB.', 413);
      chunks.push(Buffer.from(chunk));
    }
    const result = await savePrices(Buffer.concat(chunks), confirm);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(error instanceof UploadError ? error.status : 500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: error instanceof UploadError ? error.message : 'No se pudo guardar. El archivo vigente se conserva; revisa permisos del servidor.' }));
  }
}
