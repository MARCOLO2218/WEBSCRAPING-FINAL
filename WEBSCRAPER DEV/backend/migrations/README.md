# Adopción preparada en SPEC-036

Actualización: 036_existing representa la auditoría Ubuntu v2 recibida. Usar
scripts/baseline-dev.mjs [--apply]; guía docs/BASELINE_DEV.md. Sólo registra la
versión y valida previamente. No admite upgrade/downgrade genéricos.
Node todavía administra DDL: coordinar su retirada antes de cambiar las tablas
comerciales con Alembic. No ejecutar contra PROD ni instalar sobre una base vacía.
