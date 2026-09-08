import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanProductText, normalizeProductText, parseGtqPriceRange, toNullableProductText } from '../domain/product.js';

test('limpia espacios sin alterar el contenido del producto', () => {
  assert.equal(cleanProductText('  Colchon\n  matrimonial  '), 'Colchon matrimonial');
});

test('normaliza texto para comparaciones sin mayusculas ni acentos', () => {
  assert.equal(normalizeProductText('  Colchón ÁRTICO  '), 'colchon artico');
});

test('convierte marcadores vacios de base de datos a null', () => {
  for (const value of ['', ' - ', 'N/A', 'null', undefined]) assert.equal(toNullableProductText(value), null);
  assert.equal(toNullableProductText(' Disponible '), 'Disponible');
});

test('extrae el minimo y maximo de rangos de precios en quetzales', () => {
  assert.deepEqual(parseGtqPriceRange('Q 3,499.95 - GTQ 5,000'), { min: 3499.95, max: 5000 });
  assert.deepEqual(parseGtqPriceRange('N/A'), { min: null, max: null });
});
