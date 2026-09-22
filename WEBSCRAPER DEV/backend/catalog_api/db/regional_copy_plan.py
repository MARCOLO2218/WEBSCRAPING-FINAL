"""Plan readonly de la copia restaurada, sin cargar .env ni aceptar modos de escritura."""
import argparse
import contextlib
import getpass
import json
import os
from pathlib import Path
import time

from .regional_migration import main as migration_main


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', required=True)
    parser.add_argument('--port', type=int, default=5432)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(argv)
    # Apertura exclusiva antes de pedir secreto: no sobreescribir informes previos.
    descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
        original = dict(os.environ)
        started = time.monotonic()
        try:
            os.environ.update(PGHOST=args.host, PGPORT=str(args.port),
                PGDATABASE='webscraper_dev', PGUSER='webscraper_user',
                PGSCHEMA='catalogo', PGSSL='false', REGIONAL_ENV='DEV')
            os.environ['PGPASSWORD'] = getpass.getpass('Contraseña de webscraper_user: ')
            with contextlib.redirect_stdout(output):
                status = migration_main([])
        finally:
            os.environ.clear()
            os.environ.update(original)
    print(json.dumps({'informe': str(args.output.resolve()), 'exit_code': status,
                     'duracion_segundos': round(time.monotonic() - started, 3)}))
    return status


if __name__ == '__main__':
    raise SystemExit(main())
