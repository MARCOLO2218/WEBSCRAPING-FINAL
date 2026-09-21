import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validatePrices, createPriceUpload } from '../server/facenco-upload.js';
import { loadFacencoPriceRows } from '../server/catalog-service.js';

async function fixture(rows: unknown[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Precios FACENCO');
  sheet.getRow(4).values = ['pais','moneda','codigo_producto','producto','precio_regular','precio_oferta','activo'];
  rows.forEach((row, i) => { sheet.getRow(i + 5).values = row as any; });
  return Buffer.from(await book.xlsx.writeBuffer());
}
const rows = [
  ['gt','gtq','A1','Cama', 'Q2,000', 1900, 'SI'],
  ['HN','HNL','A1','Cama', 'L3,000', 2900, 'SI'],
  ['SV','USD','A1','Cama', '$400', 390, 'SI'],
  ['NC','NIO','A1','Cama', 'C$5,000', 4900, 'SI'],
];

test('Excel regional valida cuatro países, normaliza y permite códigos/nombres repetidos entre países', async () => {
  const checked = await validatePrices(await fixture(rows));
  assert.deepEqual(checked.countries, {GT:1,HN:1,SV:1,NC:1});
  assert.deepEqual(checked.preview.map(r=>[r.pais,r.moneda]), [['GT','GTQ'],['HN','HNL'],['SV','USD'],['NC','NIO']]);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(checked.buffer as any);
  assert.equal(book.getWorksheet('Precios FACENCO')!.getCell('A5').value, 'GT');
  assert.equal(book.getWorksheet('Precios FACENCO')!.getCell('E6').value, 3000);
  await assert.rejects(validatePrices(await fixture([...rows,rows[0]])), /duplicado/);
});

test('Excel regional rechaza país/moneda ausentes, cruces y símbolos ajenos', async () => {
  for (const [country,currency,price] of [['HN','GTQ',20],['','GTQ',20],['NI','NIO',20],['GT','',20],['SV','USD','Q20']]) {
    await assert.rejects(validatePrices(await fixture([[country,currency,'A','Cama',price,null,'SI']])), /Fila 5/);
  }
});

test('guardar conserva filas regionales y respaldo; Node carga solamente Guatemala', async () => {
  const folder = await mkdtemp(join(tmpdir(),'regional-prices-'));
  try {
    const target = join(folder,'prices.xlsx');
    const upload = createPriceUpload(target);
    const source = await fixture(rows);
    await upload(source,false); assert.deepEqual(await readdir(folder),[]);
    await upload(source,true);
    const first = await readFile(target);
    assert.equal((await validatePrices(first)).count,4);
    const loaded = await loadFacencoPriceRows([],target);
    assert.equal(loaded.length,1); assert.equal(loaded[0].precio_oferta_min,1900);
    await assert.rejects(upload(await fixture([['HN','USD','A','Cama',20,null,'SI']]),true));
    assert.deepEqual(await readFile(target),first);
    const saved = await upload(source,true);
    assert.deepEqual(await readFile(join(folder,'backups',saved.backup!)),first);
    await writeFile(target,await fixture([['','GTQ','A','Cama',20,null,'SI'],['GT','HNL','B','Otra',30,null,'SI']]));
    assert.deepEqual(await loadFacencoPriceRows([],target),[]);
  } finally { await rm(folder,{recursive:true,force:true}); }
});

test('plantilla descargable conserva encabezados, listas y acepta datos sin modificar el original', async () => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile('public/templates/precios_facenco_regional.xlsx');
  const sheet = book.getWorksheet('Precios FACENCO')!;
  assert.equal(sheet.getCell('A4').value,'pais'); assert.equal(sheet.getCell('B4').value,'moneda');
  assert.equal(sheet.getCell('A5').dataValidation.type,'list');
  assert.equal(sheet.getCell('B5').dataValidation.type,'list');
  assert.match(String(sheet.getCell('A5').dataValidation.formulae),/GT,HN,SV,NC/);
  assert.match(String(sheet.getCell('B5').dataValidation.formulae),/GTQ,HNL,USD,NIO/);
  await assert.rejects(validatePrices(Buffer.from(await book.xlsx.writeBuffer())),/No hay productos/);
  sheet.getCell('D5').value='Cama'; sheet.getCell('H5').value=2500;
  assert.equal((await validatePrices(Buffer.from(await book.xlsx.writeBuffer()))).count,1);
});
