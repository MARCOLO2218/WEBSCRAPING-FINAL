"""Arranque explícito de acceso DEV, sólo loopback; no crea esquema ni lee .env."""
import argparse
import getpass
import json
import os
from pathlib import Path
import stat

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.orm import sessionmaker
from .auth import AuthRepository
from .auth_app import create_auth_app
from .auth_throttle import DatabaseLoginThrottle
from .auth_routes import _approved_origin
from .db import auth_schema_migration as migration


def validate_origin(origin):
    if not _approved_origin(origin, frozenset([origin])):
        raise ValueError('Se requiere un origen HTTPS canónico')
    return origin


def read_key(path: Path):
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or (os.name != 'nt' and info.st_mode & 0o077):
        raise ValueError('El archivo HMAC debe ser regular y privado (0600)')
    value = path.read_bytes()
    if not 32 <= len(value) <= 4096:
        raise ValueError('El archivo HMAC debe contener entre 32 y 4096 bytes')
    return value


def check_destination(connection):
    connection.execute(text('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'))
    migration.require_copy_target(connection)
    current = migration.revision(connection)
    if current != '047_admin_level_event':
        raise migration.Rejected('Acceso requiere revisión 047_admin_level_event')
    existing = migration.existing_auth_tables(connection)
    migration.require_consistent_state(current, existing)
    _, counts = migration.table_state(connection, existing, current)
    return {'status': 'validado', 'database': 'webscraper_dev', 'revision': current,
            'filas': counts, 'escritura_ejecutada': False}


def compose(engine, origin, key):
    validate_origin(origin)
    factory = sessionmaker(engine, expire_on_commit=False)
    return create_auth_app(AuthRepository(factory),
                           throttle=DatabaseLoginThrottle(factory, key_secret=key),
                           allowed_origins=[origin])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db-host', required=True)
    parser.add_argument('--db-port', type=int, default=5432)
    parser.add_argument('--check-only', action='store_true')
    parser.add_argument('--https-origin')
    parser.add_argument('--hmac-file', type=Path)
    parser.add_argument('--port', type=int, default=8041)
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535 or not 1 <= args.db_port <= 65535:
        parser.error('Puerto inválido')
    if not args.check_only and (not args.https_origin or not args.hmac_file):
        parser.error('Arranque requiere --https-origin y --hmac-file; usar --check-only sin ellos')
    engine = None
    try:
        key = None
        if not args.check_only:
            validate_origin(args.https_origin)
            key = read_key(args.hmac_file)
        password = getpass.getpass('Contraseña PostgreSQL webscraper_user: ')
        engine = create_engine(URL.create('postgresql+psycopg', username='webscraper_user',
                               password=password, host=args.db_host, port=args.db_port,
                               database='webscraper_dev'), hide_parameters=True,
                               connect_args={'connect_timeout': 10, 'application_name': 'catalog_auth_dev'},
                               pool_pre_ping=True)
        del password
        with engine.begin() as connection:
            report = check_destination(connection)
        if args.check_only:
            print(json.dumps(report, ensure_ascii=False))
            return 0
        import uvicorn
        uvicorn.run(compose(engine, args.https_origin, key), host='127.0.0.1',
                    port=args.port, proxy_headers=False, access_log=False)
        return 0
    except Exception as error:
        print(json.dumps({'status': 'error', 'message': str(error) if isinstance(error, migration.Rejected)
                          else 'Acceso no iniciado; revisar destino y requisitos.',
                          'diagnostico': migration.safe_diagnostic(error)}, ensure_ascii=False))
        return 2
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())
