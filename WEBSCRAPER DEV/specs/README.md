# Registro permanente de specs

Este directorio conserva las especificaciones funcionales y tecnicas del producto. Una spec permanece aqui aunque su task ya este terminado.

## Estados permitidos

- `Propuesta`: todavia requiere definicion o aprobacion.
- `En progreso`: implementacion activa exclusivamente en DEV.
- `Completada`: implementada, probada y conservada como referencia.
- `Bloqueada`: necesita una decision, acceso o dependencia externa.

## Reglas

1. Crear o actualizar una spec antes de realizar un cambio significativo.
2. Describir objetivo, comportamiento esperado, fuera de alcance y criterios de aceptacion.
3. Registrar archivos afectados y pruebas asociadas al finalizar.
4. No eliminar una spec completada; si cambia el comportamiento, agregar una revision o una nueva spec.
5. Las pruebas automatizadas ejecutables viven en `src/specs/` y no sustituyen la explicacion funcional.

## Indice

| Spec | Estado | Descripcion |
|---|---|---|
| `SPEC-001-base-arquitectura.md` | Completada | Base documental, catalogo central de tiendas y primeras pruebas. |
