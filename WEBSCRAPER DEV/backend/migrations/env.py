"""Bloqueo temporal hasta contrastar y aprobar el baseline real de DEV."""
raise RuntimeError(
    "Baseline pendiente de auditoría Ubuntu DEV (SPEC-035). "
    "Ejecuta python -m catalog_api.db.audit; no usar upgrade/stamp todavía."
)
