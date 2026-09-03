import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENABLED_STORE_NAMES,
  STORE_CATALOG,
  getStoreRegistrationDifferences,
  sanitizeStoreSelection,
} from '../config/store-catalog.js';

test('el catalogo mantiene las 19 tiendas habilitadas de Guatemala', () => {
  assert.equal(STORE_CATALOG.length, 19);
  assert.equal(ENABLED_STORE_NAMES.length, 19);
  assert.equal(new Set(STORE_CATALOG.map((store) => store.id)).size, STORE_CATALOG.length);
  assert.ok(ENABLED_STORE_NAMES.includes('Americana 2000 Guatemala'));
});

test('la seleccion acepta nombres sin distinguir mayusculas y elimina duplicados', () => {
  assert.deepEqual(
    sanitizeStoreSelection(['facenco', ' FACENCO ', 'Siman Guatemala', 'desconocida']),
    ['FACENCO', 'Siman Guatemala'],
  );
});

test('una seleccion invalida equivale a ninguna tienda seleccionada', () => {
  assert.deepEqual(sanitizeStoreSelection(null), []);
  assert.deepEqual(sanitizeStoreSelection('FACENCO'), []);
});

test('detecta scrapers faltantes o no configurados', () => {
  const registered = ENABLED_STORE_NAMES.filter((name) => name !== 'FACENCO').concat('Tienda de prueba');
  assert.deepEqual(getStoreRegistrationDifferences(registered), {
    missing: ['FACENCO'],
    unknown: ['Tienda de prueba'],
  });
});
