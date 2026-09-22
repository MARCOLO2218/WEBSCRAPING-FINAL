"""Ejercicios reales de DDL/DML exclusivamente en SQLite :memory:."""
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal
import uuid

import pytest
from sqlalchemy import create_engine, event, text, select, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable, CreateIndex
from catalog_api.db import regional_migration as migration
from catalog_api.db.regional_expansion_v1 import tables
from catalog_api.db.models import metadata, products, runs, snapshots
from catalog_api.db.country_models import country_metadata, countries


@pytest.mark.parametrize('mode', ['apply', 'rollback'])
@pytest.mark.parametrize('database,role', [
    ('WEBSCRAPING_CAMAS_DEV', 'postgres'),
    ('tickets_it', 'webscraper_user'),
    ('webscraper_dev', 'postgres'),
])
def test_write_target_rejected_before_locks_or_ddl(mode, database, role):
    from unittest.mock import MagicMock
    connection = MagicMock()
    connection.dialect.name = 'postgresql'
    connection.execute.return_value.mappings.return_value.one.return_value = {
        'db': database, 'role': role,
    }
    with pytest.raises(migration.Rejected, match='solamente en webscraper_dev'):
        migration.execute(connection, mode, 'a' * 64)
    assert connection.execute.call_count == 1
    assert str(connection.execute.call_args.args[0]).startswith('SELECT current_database()')


def test_copy_identity_is_accepted():
    from unittest.mock import MagicMock
    connection = MagicMock()
    connection.execute.return_value.mappings.return_value.one.return_value = {
        'db': 'webscraper_dev', 'role': 'webscraper_user',
    }
    migration.require_copy_target(connection)


def test_copy_plan_is_readonly_restores_environment_and_refuses_overwrite(monkeypatch, tmp_path):
    import os
    from catalog_api.db import regional_copy_plan
    monkeypatch.setenv('PGDATABASE', 'WEBSCRAPING_CAMAS_DEV')
    monkeypatch.setenv('PGPASSWORD', 'original-test-secret')
    monkeypatch.setattr(regional_copy_plan.getpass, 'getpass', lambda _: 'copy-test-secret')
    def fake_main(args):
        assert args == []
        assert os.environ['PGDATABASE'] == 'webscraper_dev'
        assert os.environ['PGUSER'] == 'webscraper_user'
        assert os.environ['PGPASSWORD'] == 'copy-test-secret'
        print('{"status": "plan_preparado"}')
        return 0
    monkeypatch.setattr(regional_copy_plan, 'migration_main', fake_main)
    destination = tmp_path / 'plan.json'
    args = ['--host', '127.0.0.1', '--output', str(destination)]
    assert regional_copy_plan.main(args) == 0
    assert os.environ['PGPASSWORD'] == 'original-test-secret'
    assert os.environ['PGDATABASE'] == 'WEBSCRAPING_CAMAS_DEV'
    assert 'secret' not in destination.read_text()
    with pytest.raises(FileExistsError):
        regional_copy_plan.main(args)


def fixture_data():
    run_uuid = uuid.UUID(int=50)
    def product(i, **changes):
        return dict(id=i, registro_uuid=uuid.UUID(int=i), run_id=1, run_uuid=run_uuid,
            sitio_fuente='Sleep Gallery Guatemala', producto='Cama histórica',
            url_fuente='https://paises.sleepgalleryca.com/',
            url_producto='https://sleepgalleryca.com/gt/producto/cama/',
            precio_regular='Q500', precio_oferta=None,
            descripcion='Texto original áéñ', precio_regular_min=Decimal('500.00'),
            creado_en=datetime(2026, 9, 21)) | changes
    return {'paises': [dict(id=i, codigo=c, nombre=c, moneda=m, habilitado=c == 'GT')
            for i, (c, m) in enumerate(migration.MONEY.items(), 1)],
        'scraping_runs': [dict(id=1, run_uuid=run_uuid, total_products=4)],
        'productos_catalogo': [product(1), product(2,
            url_producto='https://sleepgalleryca.com/sv/producto/cama/', precio_regular='$500'),
            product(3, url_producto=None),
            product(4, url_producto='https://www.instagram.com/sleepgallery/')],
        'catalog_display_snapshots': [dict(store_key='Sleep Gallery Guatemala', run_id=1,
            product_count=4, locked_at=datetime(2026, 9, 21, tzinfo=timezone.utc),
            lock_until=datetime(2026, 9, 21, 3, tzinfo=timezone.utc),
            updated_at=datetime(2026, 9, 21, tzinfo=timezone.utc))]}


@pytest.fixture
def db():
    engine = create_engine('sqlite://')
    @event.listens_for(engine, 'connect')
    def setup(connection, record):
        connection.isolation_level = None
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute("ATTACH DATABASE ':memory:' AS catalogo")
    @event.listens_for(engine, 'begin')
    def begin(connection):
        connection.exec_driver_sql('BEGIN')
    data = fixture_data()
    with engine.begin() as connection:
        metadata.create_all(connection)
        country_metadata.create_all(connection)
        connection.execute(text('CREATE TABLE catalogo.alembic_version (version_num VARCHAR(32) PRIMARY KEY)'))
        connection.execute(text("INSERT INTO catalogo.alembic_version VALUES ('037_countries')"))
        for table in (countries, runs, products, snapshots):
            connection.execute(table.insert(), data[table.name])
    yield engine
    engine.dispose()


def test_plan_preserves_all_ids_mixed_runs_and_ambiguous_publication():
    data = fixture_data()
    before = deepcopy(data)
    plan = migration.prepare(data, {}, {})
    assert data == before
    assert plan['report']['estados'] == {'asignado': 2, 'revision': 1, 'no_producto': 1}
    assert plan['report']['paises'] == {'GT': 1, 'SV': 1}
    assert len(plan['payload']['productos_paises']) == 4
    assert {r['pais_codigo'] for r in plan['payload']['scraping_run_paises']} == {'GT', 'SV'}
    assert plan['payload']['publicaciones_paises'][0]['pais_codigo'] is None


@pytest.mark.parametrize('mutation', ['description', 'price', 'country', 'lock', 'identity', 'schema'])
def test_fingerprint_covers_all_fields_and_target(mutation):
    data = fixture_data()
    original = migration.prepare(deepcopy(data), {}, {})['token']
    identity, schema = {}, {}
    if mutation == 'description': data['productos_catalogo'][0]['descripcion'] = 'cambió'
    if mutation == 'price': data['productos_catalogo'][0]['precio_regular_min'] = Decimal('501.00')
    if mutation == 'country': data['paises'][1]['habilitado'] = True
    if mutation == 'lock': data['catalog_display_snapshots'][0]['lock_until'] = datetime(2027, 1, 1)
    if mutation == 'identity': identity = {'db': 'otra'}
    if mutation == 'schema': schema = {'extra': 'column'}
    assert migration.prepare(data, identity, schema)['token'] != original


@pytest.mark.parametrize('mutation', ['duplicate', 'uuid', 'orphan', 'count', 'snapshot', 'alias', 'currency'])
def test_invalid_source_rejected_before_migration(mutation):
    data = fixture_data()
    if mutation == 'duplicate': data['productos_catalogo'].append(data['productos_catalogo'][0])
    if mutation == 'uuid': data['productos_catalogo'][0]['run_uuid'] = uuid.UUID(int=900)
    if mutation == 'orphan': data['productos_catalogo'][0]['run_id'] = 100
    if mutation == 'count': data['scraping_runs'][0]['total_products'] = 3
    if mutation == 'snapshot': data['catalog_display_snapshots'][0]['product_count'] = 3
    if mutation == 'alias': data['productos_catalogo'][0]['sitio_fuente'] = 'SLEEP GALLERY GUATEMALA'
    if mutation == 'currency': data['productos_catalogo'][0]['precio_regular'] = 'Q500 o $65'
    with pytest.raises(migration.Rejected): migration.prepare(data, {}, {})


def test_null_run_preserved_pending_not_fabricated():
    data = fixture_data()
    data['productos_catalogo'][0]['run_id'] = None
    data['scraping_runs'][0]['total_products'] = 3
    data['catalog_display_snapshots'][0]['product_count'] = 3
    plan = migration.prepare(data, {}, {})
    row = plan['payload']['productos_paises'][0]
    assert (row['run_id'], row['pais_codigo'], row['estado']) == (None, None, 'revision')


def test_cordoba_not_dollar_and_mixed_prices_blocked():
    with pytest.raises(migration.Rejected): migration.monetary_guard({'precio_oferta': 'C$500'}, 'SV')
    with pytest.raises(migration.Rejected): migration.monetary_guard({'precio_oferta': 'Q500 USD65'}, 'GT')
    migration.monetary_guard({'precio_oferta': 'Precio especial C$500'}, 'NC')
    migration.monetary_guard({'precio_oferta': 'Precio especial Q500 habitual Q650'}, 'GT')


def test_upgrade_idempotence_verify_and_rollback_preserve_every_legacy_field(db):
    with db.begin() as connection:
        source, schema = migration.read_source(connection)
        original = migration.fingerprint(source)
        report = migration.execute(connection)
        token = report['plan_hash']
        assert 'productos_paises' not in inspect(connection).get_table_names(schema='catalogo')
    with db.begin() as connection:
        assert migration.execute(connection, 'apply', token)['status'] == 'aplicado'
    with db.begin() as connection:
        assert migration.execute(connection, 'apply', token)['status'] == 'validado'
        assert migration.execute(connection, 'verify', token)['status'] == 'validado'
        assert migration.fingerprint(migration.read_source(connection)[0]) == original
    with db.begin() as connection:
        assert migration.execute(connection, 'rollback', token)['status'] == 'revertido'
        assert 'productos_paises' not in inspect(connection).get_table_names(schema='catalogo')
        assert migration.fingerprint(migration.read_source(connection)[0]) == original
        assert connection.execute(text('SELECT version_num FROM catalogo.alembic_version')).scalar_one() == migration.BASE


def test_stale_plan_fails_before_ddl(db):
    with db.begin() as connection:
        token = migration.execute(connection)['plan_hash']
        connection.execute(products.update().where(products.c.id == 1).values(descripcion='Cambio externo'))
    with pytest.raises(migration.Rejected, match='plan cambió'), db.begin() as connection:
        migration.execute(connection, 'apply', token)
    with db.connect() as connection:
        assert 'regional_lotes' not in inspect(connection).get_table_names(schema='catalogo')


def test_failure_mid_backfill_rolls_back_ddl_and_insertions(db, monkeypatch):
    with db.begin() as connection: token = migration.execute(connection)['plan_hash']
    original_fill = migration.fill
    def fail(connection, plan):
        original_fill(connection, plan)
        raise RuntimeError('fallo simulado antes del commit')
    monkeypatch.setattr(migration, 'fill', fail)
    with pytest.raises(RuntimeError), db.begin() as connection:
        migration.execute(connection, 'apply', token)
    with db.connect() as connection:
        assert 'regional_lotes' not in inspect(connection).get_table_names(schema='catalogo')
        assert connection.execute(select(products.c.id)).scalars().all() == [1, 2, 3, 4]
        assert connection.execute(text('SELECT version_num FROM catalogo.alembic_version')).scalar_one() == migration.BASE


def test_constraints_and_tampering_are_detected(db):
    with db.begin() as connection:
        token = migration.execute(connection)['plan_hash']
        migration.execute(connection, 'apply', token)
    product_table = next(t for t in tables() if t.name == 'productos_paises')
    for values in ({'pais_codigo': 'NC'}, {'pais_codigo': None}, {'run_id': 99}):
        with pytest.raises(IntegrityError), db.begin() as connection:
            connection.execute(product_table.update().where(product_table.c.producto_id == 1).values(**values))
    with db.begin() as connection:
        connection.execute(product_table.update().where(product_table.c.producto_id == 1).values(motivo='externo'))
    with pytest.raises(migration.Rejected, match='divergente'), db.begin() as connection:
        migration.execute(connection, 'rollback', token)


def test_postgresql_ddl_compiles_and_only_creates_new_tables():
    for table in tables():
        sql = str(CreateTable(table).compile(dialect=postgresql.dialect()))
        assert 'CREATE TABLE catalogo.' + table.name in sql
        assert table.name not in migration.LEGACY
        for index in table.indexes:
            assert str(CreateIndex(index).compile(dialect=postgresql.dialect())).startswith('CREATE INDEX')


def test_cli_refuses_writes_without_explicit_controls(monkeypatch):
    monkeypatch.setattr(migration, 'create_engine', lambda *a, **kw: pytest.fail('No conectar'))
    with pytest.raises(SystemExit): migration.main(['--apply'])
    with pytest.raises(SystemExit): migration.main(['--rollback', '--confirm-dev'])


def test_rejects_partial_schema_and_unexpected_revision(db):
    with db.begin() as connection:
        connection.execute(text('CREATE TABLE catalogo.regional_lotes (id INTEGER)'))
    with pytest.raises(migration.Rejected, match='Estado parcial'), db.begin() as connection:
        migration.execute(connection)
    with db.begin() as connection:
        connection.execute(text("UPDATE catalogo.alembic_version SET version_num='otra'"))
    with pytest.raises(migration.Rejected, match='Revisión incompatible'), db.begin() as connection:
        migration.execute(connection)


def test_rollback_rejects_post_migration_legacy_change(db):
    with db.begin() as connection:
        token = migration.execute(connection)['plan_hash']
        migration.execute(connection, 'apply', token)
        connection.execute(products.update().where(products.c.id == 1).values(descripcion='Dato posterior'))
    with pytest.raises(migration.Rejected, match='plan cambió'), db.begin() as connection:
        migration.execute(connection, 'rollback', token)
    with db.connect() as connection:
        assert 'productos_paises' in inspect(connection).get_table_names(schema='catalogo')
        assert connection.execute(select(products.c.descripcion).where(products.c.id == 1)).scalar_one() == 'Dato posterior'


def test_original_modification_during_fill_triggers_transaction_rollback(db, monkeypatch):
    with db.begin() as connection:
        original = migration.read_source(connection)[0]
        token = migration.execute(connection)['plan_hash']
    real_fill = migration.fill
    def corrupt(connection, plan):
        real_fill(connection, plan)
        connection.execute(products.update().where(products.c.id == 1).values(descripcion='Cambio inesperado'))
    monkeypatch.setattr(migration, 'fill', corrupt)
    with pytest.raises(migration.Rejected, match='Conservación'), db.begin() as connection:
        migration.execute(connection, 'apply', token)
    with db.connect() as connection:
        assert migration.read_source(connection)[0] == original
        assert 'regional_lotes' not in inspect(connection).get_table_names(schema='catalogo')


def test_single_country_snapshot_copies_original_payload_and_duplicate_urls_keep_ids():
    data = fixture_data()
    first = data['productos_catalogo'][0]
    data['productos_catalogo'] = [first, first | {'id': 10, 'registro_uuid': uuid.UUID(int=10)}]
    data['scraping_runs'][0]['total_products'] = 2
    data['catalog_display_snapshots'][0]['product_count'] = 2
    plan = migration.prepare(data, {}, {})
    snapshot = plan['payload']['publicaciones_paises'][0]
    assert snapshot['estado'] == 'candidata'
    assert snapshot['pais_codigo'] == 'GT'
    assert snapshot['source_payload'] == migration.canonical(data['catalog_display_snapshots'][0])
    assert [row['producto_id'] for row in plan['payload']['productos_paises']] == [1, 10]


def test_colchoneria_alias_matches_existing_node_writer():
    data = fixture_data()
    for row in data['productos_catalogo']: row['sitio_fuente'] = 'La Colchonería Guatemala'
    data['catalog_display_snapshots'][0]['store_key'] = 'La Colchoneria Guatemala'
    plan = migration.prepare(data, {}, {})
    assert {row['store_key'] for row in plan['payload']['productos_paises']} == {'La Colchoneria Guatemala'}


def test_duplicate_regional_product_is_rejected(db):
    with db.begin() as connection:
        token = migration.execute(connection)['plan_hash']
        migration.execute(connection, 'apply', token)
    table = next(t for t in tables() if t.name == 'productos_paises')
    with pytest.raises(IntegrityError), db.begin() as connection:
        row = dict(connection.execute(select(table).limit(1)).mappings().one())
        connection.execute(table.insert(), row)


def test_scratch_rehearsal_refuses_existing_application_database_before_connect(monkeypatch):
    from catalog_api.db import regional_rehearsal
    monkeypatch.setattr(regional_rehearsal, 'create_engine', lambda *a, **kw: pytest.fail('No conectar'))
    with pytest.raises(ValueError, match='base nueva'):
        regional_rehearsal.rehearse('postgresql+psycopg://user:secret@localhost/catalogo_dev')


def test_offline_rehearsal_and_orm_contract():
    from catalog_api.db.regional_rehearsal import rehearse
    from catalog_api.db.regional_models import ProductCountry, RunCountry
    report = rehearse()
    assert report['source_hash_antes'] == report['source_hash_despues']
    assert report['rollback'] == 'revertido'
    assert report['postgresql_ejecutado'] is False
    assert ProductCountry.__table__.name == 'productos_paises'
    assert len(RunCountry.__table__.primary_key.columns) == 2


def test_preexisting_regional_assignments_are_not_overridden(db):
    with db.begin() as connection:
        connection.execute(text('ALTER TABLE catalogo.productos_catalogo ADD COLUMN pais_codigo TEXT'))
        connection.execute(text("UPDATE catalogo.productos_catalogo SET pais_codigo='SV' WHERE id=1"))
    with pytest.raises(migration.Rejected, match='asignaciones regionales previas'), db.begin() as connection:
        migration.execute(connection)
