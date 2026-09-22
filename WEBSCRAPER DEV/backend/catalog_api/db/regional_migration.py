"""SPEC-043: plan readonly; aplicar/revertir exige consentimiento y huella exacta."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import subprocess
import time

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, select, text
from .connection import database_url, readonly_engine, schema_name
from .regional_classification import classify_product, RULE_VERSION, MONEY, normalize
from .regional_expansion_v1 import tables

BASE = '037_countries'
HEAD = '042_regional'
VERSION = '043-backfill-v1'
LEGACY = {'scraping_runs': 'id', 'productos_catalogo': 'id',
          'catalog_display_snapshots': 'store_key', 'paises': 'codigo'}
BACKEND = Path(__file__).resolve().parents[2]


class Rejected(ValueError):
    """Mensaje controlado sin valores sensibles de filas ni conexiones."""


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, default=str, separators=(',', ':'))


def fingerprint(value):
    digest = hashlib.sha256()
    encoder = json.JSONEncoder(sort_keys=True, ensure_ascii=False, default=str, separators=(',', ':'))
    for piece in encoder.iterencode(value):
        digest.update(piece.encode('utf-8'))
    return digest.hexdigest()


def unique(rows, key):
    values = [row[key] for row in rows]
    if None in values or len(set(values)) != len(values):
        raise Rejected('Identidad duplicada o nula: ' + key)
    return dict(zip(values, rows))


def monetary_guard(row, country):
    # La auditoría 038-v2 se conserva. Antes de persistir se detectan dos riesgos:
    # C$ no equivale a USD y dos monedas dentro del mismo campo no son evidencia.
    tokens = {'Q': 'GTQ', 'GTQ': 'GTQ', '$': 'USD', 'USD': 'USD',
              'C$': 'NIO', 'NIO': 'NIO', 'L': 'HNL', 'HNL': 'HNL'}
    for key in ('precio_regular', 'precio_oferta'):
        value = str(row.get(key) or '').strip()
        if not value:
            continue
        matches = re.findall(r'(?<![A-Za-z])(?:GTQ|USD|NIO|HNL|C\$|Q|L|\$)\s*(?=\d)', value, re.I)
        currencies = {tokens[match.strip().upper()] for match in matches}
        if currencies != {MONEY[country]}:
            raise Rejected('Moneda ambigua detectada por guardia 043; revisar plan sin aplicar')


def prepare(source, identity, schema_signature):
    """Plan puro sobre todas las columnas; jamás acepta muestras como backfill."""
    source = dict(source)
    for name, key in LEGACY.items():
        source[name] = sorted((dict(row) for row in source[name]), key=lambda row: row[key])
        unique(source[name], key)
    countries = unique(source['paises'], 'codigo')
    runs = unique(source['scraping_runs'], 'id')
    unique(source['scraping_runs'], 'run_uuid')
    unique(source['productos_catalogo'], 'registro_uuid')
    for code, currency in MONEY.items():
        if code not in countries or countries[code]['moneda'] != currency:
            raise Rejected('Catálogo de países no coincide con contrato auditado')
    per_run = Counter()
    grouped = defaultdict(list)
    aliases = defaultdict(set)
    run_pairs, store_pairs = set(), set()
    regional = []
    states, assigned = Counter(), Counter()
    for row in source['productos_catalogo']:
        run_id = row['run_id']
        if run_id is not None:
            if run_id not in runs or str(row['run_uuid']) != str(runs[run_id]['run_uuid']):
                raise Rejected('Ejecución huérfana o UUID discordante')
            per_run[run_id] += 1
        result = classify_product(row)
        state, country, reason = result.status, result.country, result.reason
        original_store = row.get('sitio_fuente')
        # Mismo alias explícito que el escritor histórico Node.
        store = ('La Colchoneria Guatemala' if (original_store or '').startswith('La Colchoner')
                 else original_store)
        if state == 'asignado' and (run_id is None or not normalize(store)):
            state, country, reason = 'revision', None, 'relacion_incompleta'
        if country:
            monetary_guard(row, country)
            run_pairs.add((run_id, country))
            store_pairs.add((country, store))
            assigned[country] += 1
        states[state] += 1
        item = dict(producto_id=row['id'], run_id=run_id, pais_codigo=country,
                    store_key=store, estado=state, motivo=reason, source_hash=fingerprint(row))
        regional.append(item)
        grouped[(run_id, store)].append(item)
        aliases[normalize(store)].add(store)
    if any(len(names) > 1 for names in aliases.values()):
        raise Rejected('Colisión de nombres de tienda normalizados; no fusionar automáticamente')
    for run_id, row in runs.items():
        if row['total_products'] != per_run[run_id]:
            raise Rejected('Conteo por ejecución discordante')
    snapshots = []
    for row in source['catalog_display_snapshots']:
        if row['run_id'] not in runs:
            raise Rejected('Publicación con ejecución huérfana')
        members = grouped.get((row['run_id'], row['store_key']), [])
        if not members or row['product_count'] != len(members):
            raise Rejected('Publicación sin tienda exacta o conteo discordante')
        seen = {item['pais_codigo'] for item in members}
        eligible = len(seen) == 1 and None not in seen
        snapshots.append(dict(store_key=row['store_key'], run_id=row['run_id'],
            pais_codigo=next(iter(seen)) if eligible else None,
            estado='candidata' if eligible else 'revision',
            candidate_count=sum(item['estado'] == 'asignado' for item in members),
            source_payload=canonical(row)))
    payload = {
        'scraping_run_paises': [dict(run_id=r, pais_codigo=c) for r, c in sorted(run_pairs)],
        'tiendas_paises': [dict(pais_codigo=c, store_key=s) for c, s in sorted(store_pairs)],
        'productos_paises': regional, 'publicaciones_paises': snapshots}
    source_hash = fingerprint(source)
    token = fingerprint(dict(version=VERSION, rules=RULE_VERSION, identity=identity,
                             schema=schema_signature, source_hash=source_hash, payload=payload))
    payload['regional_lotes'] = [dict(id=1, plan_hash=token, source_hash=source_hash, rules=RULE_VERSION)]
    return dict(payload=payload, token=token, source_hash=source_hash,
                report=dict(status='plan_preparado', version=VERSION, reglas=RULE_VERSION,
                    destino=identity,
                    plan_hash=token, source_hash=source_hash,
                    conteos_originales={name: len(rows) for name, rows in source.items()},
                    conteos_nuevos={name: len(rows) for name, rows in payload.items()},
                    estados=dict(states), paises=dict(assigned),
                    publicaciones=dict(Counter(row['estado'] for row in snapshots)),
                    activacion_regional=False, escritura_ejecutada=False))


def read_source(connection):
    source, signature = {}, {}
    inspector = inspect(connection)
    from .models import metadata
    from .country_models import country_metadata
    expected = {t.name: set(t.c.keys()) for m in (metadata, country_metadata) for t in m.tables.values()}
    for name, key in LEGACY.items():
        columns = inspector.get_columns(name, schema='catalogo')
        if name != 'paises' and {'pais_codigo', 'country_code', 'origen_estado'} & {col['name'] for col in columns}:
            raise Rejected('Hay asignaciones regionales previas fuera de 037; conciliar antes de migrar')
        if not expected[name].issubset({col['name'] for col in columns}):
            raise Rejected('Faltan columnas históricas requeridas')
        signature[name] = dict(columns=columns,
            pk=inspector.get_pk_constraint(name, schema='catalogo'),
            fk=inspector.get_foreign_keys(name, schema='catalogo'),
            unique=inspector.get_unique_constraints(name, schema='catalogo'),
            checks=inspector.get_check_constraints(name, schema='catalogo'),
            indexes=inspector.get_indexes(name, schema='catalogo'))
        if signature[name]['pk']['constrained_columns'] != ([key] if name != 'paises' else ['id']):
            raise Rejected('Clave primaria histórica inesperada')
        print('SPEC-043 leyendo ' + name, file=sys.stderr, flush=True)
        with connection.execute(text(f'SELECT * FROM catalogo.{name} ORDER BY {key}')
                                .execution_options(yield_per=2000)) as cursor:
            source[name] = []
            for row in cursor.mappings():
                source[name].append(dict(row))
                if len(source[name]) % 10000 == 0:
                    print(f'SPEC-043 {name}: {len(source[name])} filas', file=sys.stderr, flush=True)
    return source, signature


def migrate_schema(connection, rollback=False):
    config = Config(str(BACKEND / 'alembic.ini'))
    config.set_main_option('script_location', str(BACKEND / 'migrations'))
    config.attributes.update(connection=connection, baseline_schema='catalogo',
                             regional_migration=True, regional_rollback=rollback)
    if rollback:
        command.downgrade(config, BASE)
    else:
        command.upgrade(config, HEAD)


def verify_projection(connection, plan):
    inspector = inspect(connection)
    for table in tables():
        if {col['name'] for col in inspector.get_columns(table.name, schema='catalogo')} != set(table.c.keys()):
            raise Rejected('Esquema regional divergente: ' + table.name)
        actual = [dict(row) for row in connection.execute(select(table)).mappings()]
        expected = plan['payload'][table.name]
        if sorted(map(canonical, actual)) != sorted(map(canonical, expected)):
            raise Rejected('Proyección regional divergente: ' + table.name)


def fill(connection, plan):
    for table in tables():
        values = plan['payload'][table.name]
        for offset in range(0, len(values), 1000):
            connection.execute(table.insert(), values[offset:offset + 1000])
    verify_projection(connection, plan)


def require_copy_target(connection):
    """Validar identidad real antes de bloquear o escribir en PostgreSQL."""
    identity = connection.execute(text(
        'SELECT current_database() AS db, current_user AS role'
    )).mappings().one()
    if identity['db'] != 'webscraper_dev' or identity['role'] != 'webscraper_user':
        raise Rejected('Escritura autorizada solamente en webscraper_dev con webscraper_user')


def execute(connection, mode='plan', expected_hash=None):
    timings = {}
    if mode not in ('plan', 'apply', 'verify', 'rollback'):
        raise Rejected('Modo desconocido')
    writing = mode in ('apply', 'rollback')
    postgres = connection.dialect.name == 'postgresql'
    if writing and postgres:
        require_copy_target(connection)
        connection.execute(text("SET LOCAL lock_timeout = '5s'"))
        connection.execute(text('SELECT pg_advisory_xact_lock(430043)'))
        connection.execute(text('LOCK TABLE catalogo.alembic_version, catalogo.paises, '
            'catalogo.scraping_runs, catalogo.productos_catalogo, catalogo.catalog_display_snapshots '
            'IN SHARE ROW EXCLUSIVE MODE'))
    elif postgres:
        connection.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'))
    if postgres:
        connection.execute(text("SET LOCAL TIME ZONE 'UTC'"))
    revisions = list(connection.execute(text('SELECT version_num FROM catalogo.alembic_version')).scalars())
    if revisions not in ([BASE], [HEAD]):
        raise Rejected('Revisión incompatible; no repetir baseline')
    new_names = {t.name for t in tables()}
    existing = set(inspect(connection).get_table_names(schema='catalogo')) & new_names
    if existing != (new_names if revisions == [HEAD] else set()):
        raise Rejected('Estado parcial o nombres regionales ya ocupados')
    if writing and existing and postgres:
        for name in sorted(existing):
            connection.execute(text(f'LOCK TABLE catalogo.{name} IN ACCESS EXCLUSIVE MODE'))
    identity = dict(connection.execute(text('SELECT current_database() AS db, '
        'inet_server_addr()::text AS host, inet_server_port() AS port')).mappings().one()) if postgres else {'test': 'sqlite'}
    source, signature = read_source(connection)
    plan = prepare(source, identity, signature)
    if expected_hash and expected_hash != plan['token']:
        raise Rejected('El plan cambió; regenerar y revisar antes de escribir')
    if writing and not expected_hash:
        raise Rejected('Falta huella del plan revisado')
    if mode == 'rollback':
        if revisions != [HEAD]:
            raise Rejected('No hay expansión 042 para revertir')
        verify_projection(connection, plan)
        started = time.monotonic()
        migrate_schema(connection, rollback=True)
        timings['ddl_rollback_segundos'] = time.monotonic() - started
    elif revisions == [HEAD]:
        verify_projection(connection, plan)
    elif mode == 'verify':
        raise Rejected('Aún no se aplicó 042')
    elif mode == 'apply':
        started = time.monotonic()
        migrate_schema(connection)
        timings['ddl_expansion_segundos'] = time.monotonic() - started
        started = time.monotonic()
        fill(connection, plan)
        timings['backfill_y_verificacion_segundos'] = time.monotonic() - started
    if writing:
        after, after_schema = read_source(connection)
        if fingerprint(after) != plan['source_hash'] or fingerprint(signature) != fingerprint(after_schema):
            raise Rejected('Conservación histórica falló; rollback transaccional')
    report = plan['report'] | {'revision_antes': revisions[0], 'modo': mode,
        'duraciones': timings,
        'escritura_ejecutada': writing,
        'status': 'revertido' if mode == 'rollback' else
            ('validado' if mode == 'verify' or revisions == [HEAD] else
             ('aplicado' if mode == 'apply' else 'plan_preparado'))}
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--apply', action='store_true')
    modes.add_argument('--rollback', action='store_true')
    modes.add_argument('--verify', action='store_true')
    parser.add_argument('--confirm-dev', action='store_true')
    parser.add_argument('--expected-hash')
    parser.add_argument('--backup')
    args = parser.parse_args(argv)
    writing = args.apply or args.rollback
    if writing and (not args.confirm_dev or not re.fullmatch(r'[a-f0-9]{64}', args.expected_hash or '')):
        parser.error('Escritura requiere --confirm-dev y --expected-hash revisado')
    engine = None
    try:
        if schema_name() != 'catalogo' or os.environ.get('REGIONAL_ENV') != 'DEV':
            raise Rejected('Usar wrapper de WEBSCRAPER DEV con esquema catalogo')
        if writing:
            if not args.backup:
                raise Rejected('Falta respaldo pg_dump -Fc validado')
            with Path(args.backup).open('rb') as backup:
                if backup.read(5) != b'PGDMP':
                    raise Rejected('Respaldo no es archivo pg_dump custom')
            validation = subprocess.run(['pg_restore', '--list', str(Path(args.backup).resolve())],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60, check=False)
            if validation.returncode:
                raise Rejected('pg_restore no reconoce el respaldo; no aplicar')
        engine = create_engine(database_url(), hide_parameters=True, connect_args={
            'connect_timeout': 10, 'options': '-c statement_timeout=300000',
            'sslmode': 'require' if os.environ.get('PGSSL', '').lower() == 'true' else 'disable'
        }) if writing else readonly_engine()
        mode = 'apply' if args.apply else 'rollback' if args.rollback else 'verify' if args.verify else 'plan'
        with engine.begin() as connection:
            report = execute(connection, mode, args.expected_hash)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0
    except KeyboardInterrupt:
        print('Cancelado; transacción no confirmada', file=sys.stderr)
        return 130
    except Exception as error:
        print(json.dumps({'status': 'error', 'message': str(error) if isinstance(error, Rejected)
            else 'Operación no confirmada; revisar conexión, permisos y registro PostgreSQL.'}))
        return 2
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())
