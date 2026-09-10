import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from catalog_api.db.baseline import register
from catalog_api.db.countries import migrate

def test_country_migration_seeds_extends_and_preserves_history():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE productos_catalogo (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO productos_catalogo VALUES (55)"))
        register(conn, "main")
        assert migrate(conn, "main") == "listo_para_crear_paises"
        assert migrate(conn, "main", True) == "aplicado"
        rows = conn.execute(text("SELECT codigo, moneda, habilitado FROM paises ORDER BY codigo")).all()
        assert rows == [("GT", "GTQ", 1), ("HN", "HNL", 0), ("NC", "NIO", 0), ("SV", "USD", 0)]
        conn.execute(text("INSERT INTO paises (codigo,nombre,moneda,habilitado) VALUES ('CR','Costa Rica','CRC',0)"))
        assert migrate(conn, "main", True) == "ya_aplicado"
        assert conn.execute(text("SELECT count(*) FROM paises")).scalar_one() == 5
        assert conn.execute(text("SELECT id FROM productos_catalogo")).scalar_one() == 55
        with pytest.raises(IntegrityError):
            conn.execute(text("INSERT INTO paises (codigo,nombre,moneda,habilitado) VALUES ('GT','Duplicado','GTQ',1)"))
    engine.dispose()

def test_country_migration_rejects_missing_baseline():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        with pytest.raises(ValueError, match="SPEC-036"):
            migrate(conn, "main", True)
    engine.dispose()

def test_country_migration_does_not_adopt_unknown_country_table():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        register(conn, "main")
        conn.execute(text("CREATE TABLE paises (id INTEGER)"))
        with pytest.raises(ValueError, match="Ya existe"):
            migrate(conn, "main", True)
    engine.dispose()
