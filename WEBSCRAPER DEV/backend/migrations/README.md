# Adopción pendiente

No hay revisiones iniciales inventadas. El entorno impide upgrade/stamp antes de
revisar el inventario real de DEV. El auditor no modifica la base.

Después de revisar columnas, índices, claves, defaults, secuencias y posibles
tablas adicionales, se definirá una revisión baseline y su procedimiento de
adopción. Node todavía administra DDL: coordinar su retirada antes de dar a
Alembic la propiedad del esquema. No ejecutar autogenerate contra PROD.
