"""Inventario readonly de objetos auxiliares; no confundir con hash de filas."""
from sqlalchemy import text
from .regional_migration import Rejected, canonical


def inventory(connection):
    queries = {
        'relations': """SELECT c.relname AS name, c.relkind AS kind,
            pg_get_userbyid(c.relowner) AS owner,
            CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid, false) END AS definition
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='catalogo' AND c.relkind IN ('r','p','v','m','S','f')
            ORDER BY c.relname""",
        'functions': """SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS name,
            pg_get_functiondef(p.oid) AS definition, pg_get_userbyid(p.proowner) AS owner
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='catalogo' AND p.prokind IN ('f','p') ORDER BY name""",
        'triggers': """SELECT c.relname || '.' || t.tgname AS name,
            pg_get_triggerdef(t.oid, false) AS definition, t.tgenabled AS enabled
            FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='catalogo' AND NOT t.tgisinternal ORDER BY name""",
        'extensions': """SELECT e.extname AS name, e.extversion AS version,
            n.nspname AS schema FROM pg_extension e
            JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY name""",
        'sequences': """SELECT sequencename AS name, sequenceowner AS owner, data_type,
            start_value, min_value, max_value, increment_by, cycle, cache_size
            FROM pg_sequences WHERE schemaname='catalogo' ORDER BY name""",
    }
    result = {kind: [dict(row) for row in connection.execute(text(query)).mappings()]
              for kind, query in queries.items()}
    quote = connection.dialect.identifier_preparer.quote_identifier
    for sequence in result['sequences']:
        sequence.update(connection.execute(text(
            f'SELECT last_value, is_called FROM "catalogo".{quote(sequence["name"])}'
        )).mappings().one())
    return result


def check_inventory(before, after, regional_names=()):
    """Sólo admitir las cinco tablas complementarias como objetos adicionales."""
    filtered = {kind: [row for row in rows if not (
        kind == 'relations' and row['name'] in regional_names and row['kind'] == 'r'
    )] for kind, rows in after.items()}
    if canonical(before) != canonical(filtered):
        raise Rejected('Cambió inventario histórico (vistas/funciones/triggers/secuencias/extensiones)')
