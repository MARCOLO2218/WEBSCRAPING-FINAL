# SPEC-036 — Registro del esquema existente en Alembic

Estado: Implementada localmente; aplicación Ubuntu pendiente.

Validación: 74 pruebas Node y 60 Python aprobadas; registro probado en SQLite,
comparador probado contra referencia Ubuntu. Ejecución PostgreSQL real pendiente.

Se conserva la misma base y sus tres tablas comerciales. El informe Ubuntu v2
recibido confirma columnas, restricciones, índices, defaults y secuencias.
El ORM añade gen_random_uuid() a los dos UUID obligatorios.

El comando baseline comprueba el inventario contra una referencia congelada
de ese informe. Por defecto sólo revisa; --apply registra 036_existing en
catalogo.alembic_version. Nunca crea ni altera tablas comerciales ni toca IDs.
Rechaza diferencias y revisiones previas desconocidas. Segunda aplicación no hace
cambios. Validación y stamp comparten transacción; bloqueo de DDL con ACCESS SHARE
y timeout corto. No habilitar upgrade/downgrade genéricos aún.

Alcance de validación: metadatos inventariados, no filas, triggers, vistas ni
rendimiento. Países/usuarios requieren la siguiente migración y no se crean aquí.
Node sigue administrando su DDL heredado; se retirará antes de cambiarlo.

Pruebas: referencias alteradas deben bloquear adopción; UUID por servidor en DDL;
registro Alembic aislado e idempotente; suites Node/Python. Ubuntu lo ejecuta usuario.
