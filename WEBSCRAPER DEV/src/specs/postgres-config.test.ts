import assert from 'node:assert/strict';
import test from 'node:test';
import { getDbConfig } from '../persistence/postgres.js';

const REQUIRED = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'] as const;

function withDatabaseEnvironment(values: Partial<Record<(typeof REQUIRED)[number] | 'PGSCHEMA', string>>, run: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const key of [...REQUIRED, 'PGSCHEMA']) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  Object.assign(process.env, values);
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('usa el esquema catalogo y reporta variables faltantes', () => {
  withDatabaseEnvironment({}, () => {
    assert.deepEqual(getDbConfig(), { enabled: false, schema: 'catalogo', missing: [...REQUIRED] });
  });
});

test('habilita persistencia cuando existe la configuracion completa', () => {
  withDatabaseEnvironment({ PGHOST: 'host', PGPORT: '5432', PGDATABASE: 'db', PGUSER: 'user', PGPASSWORD: 'secret', PGSCHEMA: 'catalogo_dev' }, () => {
    assert.deepEqual(getDbConfig(), { enabled: true, schema: 'catalogo_dev', missing: [] });
  });
});

test('rechaza nombres de esquema inseguros', () => {
  withDatabaseEnvironment({ PGSCHEMA: 'catalogo; DROP TABLE productos' }, () => {
    assert.throws(() => getDbConfig(), /PGSCHEMA solo puede usar/);
  });
});
