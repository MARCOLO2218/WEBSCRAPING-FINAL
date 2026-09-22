from copy import deepcopy
from unittest.mock import Mock

import pytest
from sqlalchemy import inspect

from catalog_api.db import regional_copy_trial as trial
from catalog_api.db import regional_inventory
from catalog_api.db import regional_migration as migration
from test_regional_migration import db  # Fixture SQLite aislada, no PostgreSQL.


def test_inventory_only_allows_expected_new_tables():
    baseline = {'relations': [{'name': 'productos_catalogo', 'kind': 'r'}],
                'functions': [{'name': 'f()', 'definition': 'original'}],
                'sequences': [{'name': 'id_seq', 'last_value': 42, 'is_called': True}]}
    expanded = deepcopy(baseline)
    expanded['relations'].append({'name': 'productos_paises', 'kind': 'r'})
    regional_inventory.check_inventory(baseline, expanded, {'productos_paises'})
    for kind, field, value in [('functions', 'definition', 'alterada'),
                               ('sequences', 'last_value', 43)]:
        changed = deepcopy(expanded)
        changed[kind][0][field] = value
        with pytest.raises(migration.Rejected, match='inventario'):
            regional_inventory.check_inventory(baseline, changed, {'productos_paises'})
    with pytest.raises(migration.Rejected):
        regional_inventory.check_inventory(baseline, expanded)


def test_backup_is_read_fully_via_docker_without_database_target(tmp_path, monkeypatch):
    path = tmp_path / 'baseline.dump'
    path.write_bytes(b'PGDMPtest-fixture')
    calls = []
    def run(command, **kwargs):
        calls.append(command)
        assert kwargs['stdin'].read() == b'PGDMPtest-fixture'
        assert '--file=/dev/null' in command
        assert '--dbname' not in command and '-d' not in command
        return Mock(returncode=0)
    monkeypatch.setattr(trial.subprocess, 'run', run)
    original = path.read_bytes()
    report = trial.backup_check(path)
    assert report['decodificacion_completa'] is True
    assert report['restauracion_nueva_ejecutada'] is False
    assert path.read_bytes() == original
    assert len(calls) == 1
    monkeypatch.setattr(trial.subprocess, 'run', lambda *a, **kw: Mock(returncode=1))
    with pytest.raises(migration.Rejected, match='backup completo'):
        trial.backup_check(path)


def test_complete_trial_pipeline_and_rollback_with_sqlite(db, monkeypatch, tmp_path):
    def objects(connection):
        return {'relations': [{'name': name, 'kind': 'r'}
                for name in sorted(inspect(connection).get_table_names(schema='catalogo'))]}
    monkeypatch.setattr(trial, 'inventory', objects)
    monkeypatch.setattr(migration, 'require_copy_target', lambda connection: None)
    with db.connect() as connection:
        raw = connection.connection.driver_connection
        raw.create_function('current_database', 0, lambda: 'sqlite_fixture')
        raw.create_function('pg_database_size', 1, lambda name: 100)
    with db.begin() as connection:
        plan = migration.execute(connection)
    monkeypatch.setattr(trial, 'BASE_COUNTS', plan['conteos_originales'])
    result = trial.run_trial(db, plan['plan_hash'], tmp_path)
    assert result['02-aplicar']['status'] == 'aplicado'
    assert result['04-repetir']['status'] == 'validado'
    assert result['06-rollback']['status'] == 'revertido'
    assert result['07-final']['revision_antes'] == '037_countries'
    assert {report['source_hash'] for report in result.values()} == {plan['source_hash']}
    assert len(list(tmp_path.glob('*.json'))) == 14
    assert 'regional_lotes' not in inspect(db).get_table_names(schema='catalogo')


def test_auxiliary_object_change_aborts_apply_transaction(db, monkeypatch, tmp_path):
    monkeypatch.setattr(migration, 'require_copy_target', lambda connection: None)
    monkeypatch.setattr(trial, 'inventory', lambda connection: {'functions': ['changed']})
    with db.begin() as connection:
        token = migration.execute(connection)['plan_hash']
    with pytest.raises(migration.Rejected, match='inventario'):
        trial.stage(db, 'apply', 'apply', token, {'functions': ['original']}, tmp_path)
    assert 'regional_lotes' not in inspect(db).get_table_names(schema='catalogo')
    assert not list(tmp_path.iterdir())
