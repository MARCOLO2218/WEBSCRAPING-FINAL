# Registro de decisiones

## ADR-001: Refactorizacion incremental

- Estado: aceptada.
- Decision: ordenar el sistema actual por etapas, sin reescritura total.
- Motivo: conservar el conocimiento y las correcciones acumuladas en 19 tiendas.

## ADR-002: Catalogo central de tiendas

- Estado: implementada en DEV.
- Decision: `src/config/store-catalog.ts` es la fuente de nombres habilitados para validar ejecuciones seleccionadas.
- Motivo: evitar listas distintas entre API, interfaz y scraper y preparar la dimension pais.

## ADR-003: FastAPI como destino, no como cambio inmediato

- Estado: planificada.
- Decision: FastAPI sustituira gradualmente las responsabilidades de API; los extractores TypeScript se conservaran inicialmente como workers.
- Motivo: obtener contratos OpenAPI y modularidad sin reescribir de inmediato los scrapers Playwright.

## ADR-004: Cambios primero en DEV

- Estado: permanente.
- Decision: ninguna etapa se aplica a PROD antes de compilar, probar y validar funcionalmente en DEV.
- Motivo: proteger la operacion estable mientras evoluciona la arquitectura.

## ADR-005: Alcance regional de cuatro paises

- Estado: aceptada.
- Decision: la plataforma atendera Guatemala, Honduras, El Salvador y Nicaragua; Costa Rica queda fuera del alcance.
- Motivo: concentrar la expansion regional en los cuatro paises definidos por el negocio.

## ADR-006: Una base regional segmentada por pais

- Estado: propuesta.
- Decision: usar una sola base de datos y asociar pais y moneda a tiendas, ejecuciones, productos y publicaciones.
- Motivo: mantener una operacion general, facilitar reportes regionales y evitar cuatro esquemas y migraciones duplicadas. La aplicacion debera exigir filtros, restricciones e indices por pais.
