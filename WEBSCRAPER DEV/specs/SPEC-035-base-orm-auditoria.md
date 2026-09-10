# SPEC-035 — Base ORM y auditoría PostgreSQL

Auditoría Ubuntu recibida: las tres tablas existen. Se ajusta el modelo a
scraping_runs.run_uuid NOT NULL y productos_catalogo.registro_uuid NOT NULL.
productos_catalogo.run_uuid permanece nullable. Las demás columnas coinciden;
claves e índices informados coinciden con los declarados. Defaults y secuencias
siguen pendientes: baseline_validated=false no es un error ni aprobación de migración.

Estado: Herramientas implementadas; adopción de baseline pendiente de auditoría Ubuntu.

## Ampliación de auditoría
Corrección tras fallo remoto de versión 2: tipar explícitamente parámetros TEXT
de format y emitir SQLSTATE/etapa sin mensaje del driver. Causa remota aún no
confirmada; evitar atribuir un fallo de consulta a credenciales.
Incluir defaults, identity, columnas calculadas, checks, lista de tablas del
esquema y secuencias asociadas a los IDs. Leer configuración desde pg_sequence,
sin consultar valores de registros ni ejecutar nextval/setval. No certificar
baseline automáticamente: los defaults deben revisarse con la salida real.

## Objetivo
Preparar SQLAlchemy 2 y Alembic en el backend existente, preservando datos e IDs.
La primera entrega inventaría únicamente metadatos de las tres tablas existentes.
No cambia rutas ni activa Nuxt/login todavía (SPEC-034).

## Contrato
- Mapeo ORM separado de los modelos HTTP Pydantic.
- Configuración PG existente, credenciales nunca impresas.
- Auditoría en transacción PostgreSQL READ ONLY: columnas, tipos, claves e índices.
- Comparación de columnas/tipos/nulabilidad contra el modelo declarado en Node.
- Sin create_all, upgrade, stamp ni modificación de datos en la herramienta.
- Alembic permanece bloqueado hasta revisar el inventario real y definir baseline.
- Pruebas locales no conectan a PostgreSQL operativo.

## Aceptación
Pruebas de tipos PostgreSQL, configuración, diferencias de esquema y consulta ORM;
regresión Node/Python. Validación real y baseline son pendientes explícitos.

Validación local: 74 pruebas Node y 47 Python aprobadas. No se conectó a la base
operativa. Consulta piloto comprobada con SQLite; tipos compilados para PostgreSQL.
