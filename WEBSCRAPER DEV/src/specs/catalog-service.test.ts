import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { DbProduct } from '../domain/product.js';
import {
  mergeFacencoExcelRows,
  parsePrice,
  toCsv,
  withPriceComparison,
} from '../server/catalog-service.js';

const mainSource = readFileSync('src/catalog-server.ts', 'utf8');
const routesSource = readFileSync('src/server/routes.ts', 'utf8');
const serviceSource = readFileSync('src/server/catalog-service.ts', 'utf8');

function product(overrides: Partial<DbProduct>): DbProduct {
  return {
    id: '1',
    run_id: '10',
    semana_run: 36,
    semana_inicio: '2026-08-31',
    sitio_fuente: 'FACENCO',
    marca: 'FACENCO',
    linea: null,
    categoria: 'Colchones',
    producto: 'Colchón Prueba',
    disponibilidad: 'Disponible',
    precio_regular: null,
    precio_oferta: null,
    descuento: null,
    cuotas: null,
    url_producto: null,
    url_fuente: null,
    titulo: null,
    descripcion: null,
    garantia: null,
    beneficios: null,
    url_imagen: null,
    texto_imagen: null,
    fecha_scraping: '2026-09-03T12:00:00.000Z',
    creado_en: null,
    registro_uuid: null,
    run_uuid: null,
    ...overrides,
  };
}

test('el servicio conserva lectura del menor precio en quetzales', () => {
  assert.equal(parsePrice('Antes Q3,299.00 ahora Q2,499.00'), 2499);
  assert.equal(parsePrice(null), null);
});

test('el complemento Excel actualiza FACENCO y conserva otras tiendas', () => {
  const competitor = product({ id: '2', sitio_fuente: 'Otra tienda', precio_oferta: 'Q2,300' });
  const merged = mergeFacencoExcelRows(
    [product({ precio_regular: 'Q3,000' }), competitor],
    [product({ id: 'excel', precio_regular: 'Q2,500', linea: 'Deluxe' })],
  );

  assert.equal(merged[0]?.precio_regular, 'Q2,500');
  assert.equal(merged[0]?.linea, 'Deluxe');
  assert.equal(merged[1], competitor);
});

test('la comparación conserva etiquetas relativas a FACENCO', () => {
  const compared = withPriceComparison([
    product({ precio_oferta: 'Q2,500' }),
    product({ id: '2', sitio_fuente: 'Barata', precio_oferta: 'Q2,000' }),
    product({ id: '3', sitio_fuente: 'Cara', precio_oferta: 'Q3,000' }),
  ]);

  assert.deepEqual(
    compared.map((row) => [row.precio_numero, row.diferencia_facenco, row.etiqueta_diferencia]),
    [
      [2500, 0, 'Igual a FACENCO'],
      [2000, -500, 'Mas barato'],
      [3000, 500, 'Mas caro'],
    ],
  );
});

test('CSV conserva BOM, orden y escape de comillas', () => {
  const row = withPriceComparison([product({ producto: 'Colchón "Premium"', precio_regular: 'Q2,500' })])[0];
  const csv = toCsv([row]);

  assert.ok(csv.startsWith('\uFEFF"id","run_id","semana_run"'));
  assert.match(csv, /"Colchón ""Premium"""/);
  assert.match(csv, /"Igual a FACENCO"/);
});

test('el servicio de catálogo vive fuera del servidor principal', () => {
  for (const name of ['parsePrice', 'mergeFacencoExcelRows', 'withPriceComparison', 'getProducts', 'toCsv']) {
    assert.doesNotMatch(mainSource, new RegExp(`(?:async )?function ${name}\\b`));
    assert.match(serviceSource, new RegExp(`export (?:async )?function ${name}\\b`));
  }
  assert.match(routesSource, /from '.\/catalog-service\.js'/);
  assert.match(mainSource, /createCatalogRequestHandler/);
});
