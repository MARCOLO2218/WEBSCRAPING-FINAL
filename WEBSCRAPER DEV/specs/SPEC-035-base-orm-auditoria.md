# SPEC-035 — Base ORM y auditoría PostgreSQL

Estado: Herramientas implementadas; adopción de baseline pendiente de auditoría Ubuntu.

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

Validación local: 74 pruebas Node y 45 Python aprobadas. No se conectó a la base
operativa. Consulta piloto comprobada con SQLite; tipos compilados para PostgreSQL.
