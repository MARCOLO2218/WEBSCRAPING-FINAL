# SPEC-008: Motor compartido de extraccion visual

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Extraer del archivo principal el motor visual compartido por varios scrapers de
Guatemala antes de mover las tiendas consumidoras a modulos independientes.

## Comportamiento esperado

- La navegacion y lectura visual generica viven bajo `src/scrapers/shared/`.
- El motor sigue usando los mismos filtros finales para Guatemala y quetzales.
- La Curacao, Elektra, Cemaco, Dormilandia, Dormisuenos y Bodegangas conservan
  sus llamadas actuales al motor.
- No cambian selectores, limites, paginacion ni formatos de producto.

## Fuera de alcance

- Habilitar Honduras o Tiendas Relax.
- Cambiar filtros de producto o moneda.
- Mover extractores especializados de MAX, Walmart o Siman.
- Modificar base de datos, frontend o PROD.

## Criterios de aceptacion

- Existe un modulo reutilizable para el motor visual.
- El archivo principal deja de contener sus implementaciones.
- Los 19 scrapers GT permanecen registrados.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `src/scrapers/shared/visual-engine.ts`
- Dependencias explicitas de navegacion, filtrado y extraccion de tarjetas.
- Tipos compartidos ampliados en `src/scrapers/types.ts`.
- Integracion mediante `createVisualScraperEngine` en el ejecutor.
- `src/specs/visual-engine-boundary.test.ts`.

## Pruebas

- Las tres funciones del motor existen en el modulo compartido.
- El ejecutor principal ya no declara esas implementaciones.
- El ejecutor construye y consume el motor compartido.
- El registro conserva las 19 tiendas de Guatemala.
