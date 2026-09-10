# SPEC-037 — Catálogo de países en PostgreSQL existente

Estado: Implementada localmente; despliegue pendiente.

Validación: 74 pruebas Node y 63 Python aprobadas. Migración ejecutada en SQLite
mediante Alembic; PostgreSQL Ubuntu pendiente de aplicación por usuario.

Una sola tabla catalogo.paises en la misma base; id entero, codigo único,
nombre, moneda y habilitado. Semillas GT/GTQ, HN/HNL, SV/USD, NC/NIO.
Sólo GT habilitado operativamente, igual que SPEC-032. No usar enum de países:
se podrán agregar CR y otros por nuevas filas. No crea login ni selector todavía.

Migración 037_countries depende de 036_existing. Comando de vista previa sin
escrituras; --apply exige baseline vigente, esquema previo coincidente y crea
únicamente paises y semillas. No modifica tablas comerciales ni asigna historia.
Repetición no duplica semillas ni sobrescribe cambios. Rechaza versiones ajenas.
Transacción y bloqueo coordinado con baseline; no exponer SQL ni credenciales.

Pruebas: migración real Alembic aislada, unicidad, expansión CR, idempotencia,
rechazo de versión anterior incorrecta y preservación de tablas comerciales.
Asignación histórica, índices por país, usuarios y autorización quedan pendientes.
