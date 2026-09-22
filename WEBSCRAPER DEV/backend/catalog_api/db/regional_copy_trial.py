"""Ensayo real autorizado sólo en copia: plan -> apply -> verify -> repeat -> rollback."""
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL
from . import regional_migration as migration
from .regional_inventory import inventory, check_inventory

BASE_COUNTS = {'scraping_runs': 245, 'productos_catalogo': 180382,
               'catalog_display_snapshots': 19, 'paises': 4}


def save(directory, name, value):
    path = directory / name
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
        json.dump(value, output, ensure_ascii=False, indent=2, default=str)


def backup_check(path):
    """Verificar todo el archivo sin restaurar ni copiarlo dentro del contenedor."""
    digest = hashlib.sha256()
    started = time.monotonic()
    with path.open('rb') as source:
        if source.read(5) != b'PGDMP':
            raise migration.Rejected('Backup no es custom PGDMP')
        source.seek(0)
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
        source.seek(0)
        result = subprocess.run(['sudo', '-n', 'docker', 'exec', '-i', 'tickets_it_db',
            'pg_restore', '--no-owner', '--no-privileges', '--file=/dev/null'],
            stdin=source, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
            timeout=600, check=False)
        if result.returncode:
            raise migration.Rejected('No se pudo decodificar backup completo con pg_restore; detener')
    return {'sha256': digest.hexdigest(), 'bytes': path.stat().st_size,
            'decodificacion_completa': True, 'restauracion_nueva_ejecutada': False,
            'segundos': time.monotonic() - started}


def client_resources():
    try:
        import resource
        usage = resource.getrusage(resource.RUSAGE_SELF)
        return {'cpu_usuario_segundos': usage.ru_utime, 'cpu_sistema_segundos': usage.ru_stime,
                'rss_max_kib_linux': usage.ru_maxrss if sys.platform.startswith('linux') else None}
    except ImportError:
        return {'cpu_proceso_segundos': time.process_time(), 'rss_max_kib_linux': None}


class LockObserver:
    """Muestreo readonly, limitado a sesiones etiquetadas de esta base."""
    def __init__(self, engine):
        self.engine = engine
        self.stop = threading.Event()
        self.result = {'muestras': 0, 'max_locks_no_concedidos': 0,
                       'max_sesiones_esperando_lock': 0, 'error_muestreo': False}
        self.thread = threading.Thread(target=self.run, daemon=True)

    def run(self):
        try:
            with self.engine.connect() as connection:
                while not self.stop.is_set():
                    row = connection.execute(text("""SELECT
                      (SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid
                       WHERE a.datname=current_database() AND a.application_name='spec043_trial'
                       AND NOT l.granted) AS locks,
                      (SELECT count(*) FROM pg_stat_activity
                       WHERE datname=current_database() AND application_name='spec043_trial'
                       AND wait_event_type='Lock') AS waiting""")).mappings().one()
                    connection.rollback()
                    self.result['muestras'] += 1
                    self.result['max_locks_no_concedidos'] = max(self.result['max_locks_no_concedidos'], row['locks'])
                    self.result['max_sesiones_esperando_lock'] = max(self.result['max_sesiones_esperando_lock'], row['waiting'])
                    self.stop.wait(1)
        except Exception:
            self.result['error_muestreo'] = True

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *args):
        self.stop.set()
        self.thread.join(timeout=10)


def stage(engine, name, mode, token, baseline, directory):
    started, cpu = time.monotonic(), time.process_time()
    with engine.begin() as connection:
        report = migration.execute(connection, mode, token)
        migration.require_copy_target(connection)
        objects = inventory(connection)
        if baseline is not None:
            regional = {t.name for t in migration.tables()} if mode != 'rollback' else set()
            check_inventory(baseline, objects, regional)
        if connection.dialect.name == 'postgresql' and (
            report['status'] in ('aplicado', 'validado')
        ):
            counts = {table.name: connection.execute(text(
                f'SELECT count(*) FROM catalogo.{table.name}'
            )).scalar_one() for table in migration.tables()}
            if counts != report['conteos_nuevos']:
                raise migration.Rejected('Conteos persistidos no coinciden con plan')
            report['conteos_regionales_verificados'] = counts
        size = connection.execute(text('SELECT pg_database_size(current_database())')).scalar_one()
    # El informe se guarda después de confirmar la transacción, nunca antes.
    report.update(duracion_segundos=time.monotonic() - started,
                  cpu_cliente_segundos=time.process_time() - cpu, bytes_base=size)
    save(directory, name + '.json', report)
    save(directory, name + '-objetos.json', objects)
    print(f'{name}: {report["status"]}; {report["duracion_segundos"]:.1f}s', flush=True)
    return report, objects


def run_trial(engine, token, directory):
    plan, baseline = stage(engine, '01-plan', 'plan', token, None, directory)
    if plan['revision_antes'] != migration.BASE or plan['conteos_originales'] != BASE_COUNTS:
        raise migration.Rejected('Baseline distinto al aprobado; no iniciar ensayo')
    reports = {'plan': plan}
    for name, mode in [('02-aplicar', 'apply'), ('03-verificar', 'verify'),
                       ('04-repetir', 'apply'), ('05-verificar-repeticion', 'verify'),
                       ('06-rollback', 'rollback'), ('07-final', 'plan')]:
        report, objects = stage(engine, name, mode, token, baseline, directory)
        if report['source_hash'] != plan['source_hash']:
            raise migration.Rejected('Huella original divergente')
        reports[name] = report
    check_inventory(baseline, objects)
    if reports['07-final']['revision_antes'] != migration.BASE:
        raise migration.Rejected('Revisión final inesperada')
    return reports


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', required=True)
    parser.add_argument('--port', type=int, default=5432)
    parser.add_argument('--backup', type=Path, required=True)
    parser.add_argument('--expected-hash', required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--confirm-copy-trial', action='store_true', required=True)
    args = parser.parse_args(argv)
    import re
    if not re.fullmatch('[a-f0-9]{64}', args.expected_hash):
        parser.error('Huella SHA256 requerida')
    args.output_dir.mkdir(mode=0o700, parents=False, exist_ok=False)
    engine = observer_engine = None
    try:
        backup = backup_check(args.backup)
        save(args.output_dir, '00-backup.json', backup)
        password = getpass.getpass('Contraseña PostgreSQL de webscraper_user: ')
        url = URL.create('postgresql+psycopg', username='webscraper_user', password=password,
                         host=args.host, port=args.port, database='webscraper_dev')
        del password
        engine = create_engine(url, hide_parameters=True, connect_args={
            'connect_timeout': 10, 'sslmode': 'disable', 'application_name': 'spec043_trial',
            'options': '-c statement_timeout=300000'})
        observer_engine = create_engine(url, hide_parameters=True, connect_args={
            'connect_timeout': 10, 'sslmode': 'disable', 'application_name': 'spec043_observer',
            'options': '-c default_transaction_read_only=on -c statement_timeout=5000'})
        started = time.monotonic()
        with LockObserver(observer_engine) as observer:
            reports = run_trial(engine, args.expected_hash, args.output_dir)
        final_backup = backup_check(args.backup)
        if backup['sha256'] != final_backup['sha256']:
            raise migration.Rejected('Backup cambió durante ensayo; revisar evidencia')
        save(args.output_dir, 'resultado.json', {
            'status': 'ensayo_completado', 'etapas': reports,
            'duracion_ensayo_segundos': time.monotonic() - started,
            'recursos_cliente': client_resources(), 'bloqueos_muestreados': observer.result,
            'backup': final_backup, 'limites': [
                'CPU/memoria corresponden al cliente Python, no al servidor compartido.',
                'Muestreo de locks cada segundo; no demuestra ausencia absoluta de espera.',
                'Restauración inicial ejecutada por usuario; no se repitió restauración.',
                'Decodificar dump no equivale a comparar todas sus filas con la copia.',
                'Tamaño físico puede no volver al original después de rollback DDL.',
            ]})
        print('Ensayo terminado y copia devuelta a 037. Informe: ' + str(args.output_dir / 'resultado.json'))
        return 0
    except (Exception, KeyboardInterrupt) as error:
        save(args.output_dir, 'error.json', {'status': 'ensayo_incompleto',
            'tipo': type(error).__name__,
            'mensaje': str(error) if isinstance(error, migration.Rejected) else
                'Fallo de conexión, herramienta o ejecución; conservar informes y revisar antes de repetir.',
            'sqlstate': getattr(getattr(error, 'orig', error), 'sqlstate', None),
            'nota': 'Etapas ya confirmadas pueden permanecer. No restaurar ni repetir a ciegas.'})
        print('Ensayo detenido. Revisar ' + str(args.output_dir / 'error.json'), file=sys.stderr)
        return 2
    finally:
        if engine is not None:
            engine.dispose()
        if observer_engine is not None:
            observer_engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())
