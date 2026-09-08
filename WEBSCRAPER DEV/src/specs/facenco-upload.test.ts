import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePrices, createPriceUpload } from '../server/facenco-upload.js';

async function fixture(price: string | number = 2500, duplicate = false) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Precios FACENCO');
  sheet.getRow(4).values = [' PRECIO_OFERTA ', 'producto', 'precio_regular'];
  sheet.getRow(5).values = [price, 'Cama prueba', 3000];
  if (duplicate) sheet.getRow(6).values = [price, 'CAMA PRUEBA', 3000];
  return Buffer.from(await book.xlsx.writeBuffer());
}

test('carga reconoce columnas reordenadas y rechaza precios o duplicados', async () => {
  assert.equal((await validatePrices(await fixture())).count, 1);
  await assert.rejects(validatePrices(await fixture('una cama')), /Fila 5, precio_oferta/);
  await assert.rejects(validatePrices(await fixture(2000, true)), /duplicado/);
  await assert.rejects(validatePrices(Buffer.from('no excel')), /xlsx válido/);
});

test('la plantilla admite moneda GTQ y filas preparadas sin producto', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Precios FACENCO');
  sheet.getRow(4).values = ['producto', 'precio_regular', 'precio_oferta', 'marca', 'moneda', 'activo', 'disponibilidad'];
  sheet.getRow(5).values = ['Cama', 2500, null, 'FACENCO', 'GTQ', 'SI', 'Disponible'];
  sheet.getRow(6).values = [null, null, null, 'FACENCO', 'GTQ', 'SI', 'Disponible'];
  assert.equal((await validatePrices(Buffer.from(await book.xlsx.writeBuffer()))).count, 1);
  sheet.getCell('E5').value = 'HNL';
  await assert.rejects(validatePrices(Buffer.from(await book.xlsx.writeBuffer())), /moneda/);
});

test('preview no escribe; confirma con respaldo y conserva vigente ante errores', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'facenco-upload-'));
  try {
    const target = join(folder, 'precios.xlsx');
    const upload = createPriceUpload(target);
    const source = await fixture();
    await upload(source, false);
    assert.deepEqual(await readdir(folder), []);
    await upload(source, true);
    const first = await readFile(target);
    await assert.rejects(upload(await fixture('incorrecto'), true));
    assert.deepEqual(await readFile(target), first);
    const result = await upload(await fixture(2200), true);
    assert.ok(result.saved);
    assert.equal((await readdir(join(folder, 'backups'))).length, 1);
    assert.deepEqual(await readFile(join(folder, 'backups', (await readdir(join(folder, 'backups')))[0])), first);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
