import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNTRY_CATALOG, getCountry, validateCountryCurrency } from '../config/countries.js';
import { STORE_CATALOG } from '../config/store-catalog.js';

test('los cuatro países conservan su moneda y solo Guatemala está operativa', () => {
  assert.deepEqual(COUNTRY_CATALOG.map(c => [c.code, c.currency]),
    [['GT', 'GTQ'], ['HN', 'HNL'], ['SV', 'USD'], ['NC', 'NIO']]);
  assert.deepEqual(COUNTRY_CATALOG.filter(c => c.operational).map(c => c.code), ['GT']);
  assert.ok(Object.isFrozen(COUNTRY_CATALOG));
  assert.ok(COUNTRY_CATALOG.every(Object.isFrozen));
  assert.equal(STORE_CATALOG.length, 19);
  assert.ok(STORE_CATALOG.every(s => s.countryCode === 'GT' && getCountry(s.countryCode)?.operational));
});

test('valida todos los pares y rechaza cada combinación cruzada', () => {
  for (const country of COUNTRY_CATALOG) {
    assert.equal(validateCountryCurrency(country.code, country.currency), country);
    for (const other of COUNTRY_CATALOG.filter(c => c.code !== country.code)) {
      assert.throws(() => validateCountryCurrency(country.code, other.currency), /Moneda incompatible/);
    }
  }
});

test('no asigna Guatemala a códigos desconocidos ni acepta monedas ausentes', () => {
  for (const value of [undefined, null, '', 'NI', 'CR', 'gt', 0, {}]) {
    assert.equal(getCountry(value), undefined);
    assert.throws(() => validateCountryCurrency(value, 'GTQ'), /País no reconocido/);
  }
  for (const value of [undefined, null, '', 'gtq', 'USD']) {
    assert.throws(() => validateCountryCurrency('GT', value), /Moneda incompatible/);
  }
});
