import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.schema import CreateTable
from sqlalchemy.dialects import postgresql
from catalog_api.db.regional_schema import regional_metadata, regional_products, regional_snapshots


def test_candidate_preserves_mixed_runs_and_rejects_cross_country_links():
    engine = create_engine('sqlite://', execution_options={'schema_translate_map': {'catalogo': None}})
    with engine.begin() as conn:
        conn.execute(text('PRAGMA foreign_keys=ON'))
        regional_metadata.create_all(conn)
        conn.execute(text("INSERT INTO paises VALUES ('GT'),('SV'),('NC')"))
        conn.execute(text('INSERT INTO scraping_runs VALUES (2),(3)'))
        conn.execute(text("INSERT INTO scraping_run_paises VALUES (2,'GT'),(2,'SV'),(3,'GT')"))
        conn.execute(text("INSERT INTO productos_catalogo VALUES (308,2,'SV','asignado','ruta'),"
                          "(309,2,'GT','asignado','ruta'),(310,2,NULL,'revision','sin evidencia')"))
        conn.execute(text("INSERT INTO catalog_display_snapshots VALUES ('GT','tienda',2),('SV','tienda',2)"))
        assert conn.execute(text('SELECT count(*) FROM scraping_runs')).scalar_one() == 2
        for sql in ["INSERT INTO productos_catalogo VALUES (311,3,'SV','asignado','ruta')",
                    "INSERT INTO productos_catalogo VALUES (312,2,'GT','revision','ruta')",
                    "INSERT INTO productos_catalogo VALUES (313,2,NULL,'asignado','ruta')",
                    "INSERT INTO catalog_display_snapshots VALUES ('NC','tienda',2)"]:
            with pytest.raises(IntegrityError):
                conn.execute(text(sql))
    engine.dispose()


def test_candidate_postgres_constraints_compile_without_changing_baseline():
    from catalog_api.db.models import metadata
    assert 'pais_codigo' not in metadata.tables['catalogo.productos_catalogo'].c
    ddl = str(CreateTable(regional_products).compile(dialect=postgresql.dialect()))
    assert 'FOREIGN KEY(run_id, pais_codigo)' in ddl
    assert 'catalogo.scraping_run_paises' in ddl
    assert 'PRIMARY KEY (pais_codigo, store_key)' in str(CreateTable(regional_snapshots).compile(dialect=postgresql.dialect()))
