import assert from 'node:assert/strict';
import test from 'node:test';
import { ENABLED_STORE_NAMES } from '../config/store-catalog.js';
import {
  buildStoreQualityWarning,
  getStoreRetryMinimum,
  getUnknownStoreRuleNames,
} from '../config/store-rules.js';

test('conserva los minimos de reintento y el valor predeterminado', () => {
  assert.equal(getStoreRetryMinimum('La Curacao Guatemala'), 20);
  assert.equal(getStoreRetryMinimum('Walmart Guatemala'), 520);
  assert.equal(getStoreRetryMinimum('FACENCO'), 1);
});

test('solo genera advertencia cuando el resultado queda bajo el minimo', () => {
  assert.equal(buildStoreQualityWarning('FACENCO', 10, 10), null);
  assert.equal(buildStoreQualityWarning('Tienda sin regla', 0, 0), null);
  assert.equal(
    buildStoreQualityWarning('FACENCO', 8, 12),
    'FACENCO genero 8 productos finales (antes del filtro: 12); minimo esperado 10. Puede ser carga incompleta o cambio de estructura. Recomendacion: correr nuevamente y revisar logs si se repite.',
  );
});

test('todas las reglas pertenecen a tiendas del catalogo central', () => {
  assert.deepEqual(getUnknownStoreRuleNames(ENABLED_STORE_NAMES), []);
});
