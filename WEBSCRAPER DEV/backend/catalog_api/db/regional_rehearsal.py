"""Ensayo sintético: SQLite por defecto; PostgreSQL sólo en base nueva vacía explícita."""
import argparse
from datetime import datetime
import json
import os
import re
from pathlib import Path
import uuid
from sqlalchemy import create_engine, event, text, inspect
from sqlalchemy.engine import make_url
from .models import metadata, products, runs, snapshots
from .country_models import country_metadata, countries
from .regional_migration import execute, read_source, fingerprint, MONEY


def rehearse(scratch_url=None):
    if scratch_url:
        raise ValueError('Ensayo en base nueva deshabilitado: usar copia webscraper_dev; SQLite sigue disponible')
    if scratch_url:
        target = make_url(scratch_url)
        if target.drivername != 'postgresql+psycopg' or not re.fullmatch(r'spec043_ensayo_[a-z0-9_]+', target.database or ''):
            raise ValueError('El ensayo exige una base nueva spec043_ensayo_* con psycopg')
    engine = create_engine(scratch_url or 'sqlite://', hide_parameters=True)
    if not scratch_url:
        @event.listens_for(engine, 'connect')
        def setup(db, record):
            db.isolation_level = None
            db.execute('PRAGMA foreign_keys=ON')
            db.execute("ATTACH DATABASE ':memory:' AS catalogo")
        @event.listens_for(engine, 'begin')
        def begin(conn):
            conn.exec_driver_sql('BEGIN')
    try:
        with engine.begin() as conn:
            if scratch_url:
                # Nunca aceptar la base DEV ni una base de ensayo ya usada.
                occupied = conn.execute(text("SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")).scalar_one()
                if occupied or 'catalogo' in inspect(conn).get_schema_names():
                    raise ValueError('Base de ensayo no vacía; no se modificó')
                conn.execute(text("SET LOCAL TIME ZONE 'UTC'"))
                conn.execute(text('CREATE SCHEMA catalogo'))
            metadata.create_all(conn)
            country_metadata.create_all(conn)
            conn.execute(text('CREATE TABLE catalogo.alembic_version (version_num VARCHAR(32) PRIMARY KEY)'))
            conn.execute(text("INSERT INTO catalogo.alembic_version VALUES ('037_countries')"))
            conn.execute(countries.insert(), [dict(id=i, codigo=c, nombre=c, moneda=m, habilitado=c == 'GT')
                for i, (c, m) in enumerate(MONEY.items(), 1)])
            run_uuid = uuid.UUID(int=100)
            conn.execute(runs.insert(), dict(id=1, run_uuid=run_uuid, total_products=4))
            records = []
            for i, (url, price) in enumerate([
                ('https://sleepgalleryca.com/gt/producto/cama/', 'Q500'),
                ('https://sleepgalleryca.com/sv/producto/cama/', '$500'),
                (None, None), ('https://instagram.com/sleepgallery/', None)], 1):
                records.append(dict(id=i, registro_uuid=uuid.UUID(int=i), run_id=1, run_uuid=run_uuid,
                    sitio_fuente='Sleep Gallery Guatemala', producto='Cama', descripcion='Conservar áéñ',
                    url_fuente='https://paises.sleepgalleryca.com/', url_producto=url,
                    precio_regular=price, precio_oferta=None, creado_en=datetime(2026, 9, 22)))
            conn.execute(products.insert(), records)
            conn.execute(snapshots.insert(), dict(store_key='Sleep Gallery Guatemala', run_id=1,
                product_count=4, locked_at=datetime(2026, 9, 22),
                lock_until=datetime(2026, 9, 22, 3), updated_at=datetime(2026, 9, 22)))
        with engine.begin() as conn:
            plan = execute(conn)
            before = plan['source_hash']
        with engine.begin() as conn: applied = execute(conn, 'apply', plan['plan_hash'])
        with engine.begin() as conn: repeated = execute(conn, 'apply', plan['plan_hash'])
        with engine.begin() as conn: verified = execute(conn, 'verify', plan['plan_hash'])
        with engine.begin() as conn: reverted = execute(conn, 'rollback', plan['plan_hash'])
        with engine.begin() as conn:
            if scratch_url: conn.execute(text("SET LOCAL TIME ZONE 'UTC'"))
            after = fingerprint(read_source(conn)[0])
        if before != after:
            raise RuntimeError('Ensayo no conservó datos')
        return dict(status='ensayo_aprobado' if scratch_url else 'ensayo_offline_aprobado',
            motor='PostgreSQL aislado' if scratch_url else 'SQLite memoria', datos='sinteticos',
            postgresql_ejecutado=bool(scratch_url), source_hash_antes=before, source_hash_despues=after,
            conteos_originales=plan['conteos_originales'], conteos_nuevos=plan['conteos_nuevos'],
            estados=plan['estados'], paises=plan['paises'],
            aplicacion=applied['status'], repeticion=repeated['status'],
            verificacion=verified['status'], rollback=reverted['status'])
    finally:
        engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--postgres-scratch', action='store_true', help='Sólo base vacía spec043_ensayo_*')
    args = parser.parse_args()
    scratch = os.environ.get('REGIONAL_SCRATCH_URL') if args.postgres_scratch else None
    if args.postgres_scratch and not scratch:
        parser.error('Falta REGIONAL_SCRATCH_URL; nunca usar la base DEV existente')
    content = json.dumps(rehearse(scratch), ensure_ascii=False, indent=2) + '\n'
    if args.output:
        with args.output.open('x', encoding='utf-8') as output:
            output.write(content)
    print(content)


if __name__ == '__main__':
    main()
