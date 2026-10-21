-- SPEC-101: ejecutar únicamente en la copia DEV del servidor nuevo.
\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT current_database(), current_user;
SELECT version_num FROM catalogo.alembic_version;
SELECT nspname AS esquema FROM pg_namespace
WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY 1;
SELECT e.extname, n.nspname AS esquema, e.extversion
FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1;
SELECT n.nspname AS esquema, c.relname AS objeto, c.relkind AS tipo
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','catalogo','administracion','guatemala','nicaragua')
ORDER BY 1,2;
SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema IN ('catalogo','administracion','guatemala','nicaragua')
ORDER BY table_schema,table_name,ordinal_position;
SELECT conrelid::regclass AS tabla, conname,
       pg_get_constraintdef(oid) AS definicion
FROM pg_constraint WHERE contype='f' AND connamespace IN
(SELECT oid FROM pg_namespace WHERE nspname='catalogo') ORDER BY 1,2;
SELECT schemaname,viewname,definition FROM pg_views
WHERE schemaname='catalogo' ORDER BY viewname;
SELECT pais_codigo,estado,count(*) AS productos
FROM catalogo.productos_paises GROUP BY pais_codigo,estado ORDER BY 1,2;
SELECT pais_codigo,count(*) AS asociaciones_ejecucion
FROM catalogo.scraping_run_paises GROUP BY pais_codigo ORDER BY 1;
SELECT pais_codigo,estado,count(*) AS publicaciones
FROM catalogo.publicaciones_paises GROUP BY pais_codigo,estado ORDER BY 1,2;
COMMIT;
