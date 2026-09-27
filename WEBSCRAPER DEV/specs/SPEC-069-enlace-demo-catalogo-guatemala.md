# SPEC-069: Enlace de la demo al catálogo operativo de Guatemala

Estado: Implementación local; validación DEV pendiente

## Objetivo

Tras la revisión visual de SPEC-066, conectar la selección Guatemala de la demo
con el catálogo operativo Node existente, conservando su interfaz, filtros,
datos y flujo de trabajo.

## Comportamiento

- La demo conserva su aviso de prototipo y el formulario no transmite datos.
- Al elegir Guatemala se navega al path raíz `/` del mismo servidor, donde vive
  el catálogo operativo existente.
- La demo deja de representar una pantalla GT ficticia como si fuera el
  catálogo. Honduras y Nicaragua continúan mostrando sólo evidencia de piloto y
  permanecen deshabilitadas para operación.
- No se agrega consulta regional, autenticación, ejecución de scrapers ni acceso
  a datos nuevos. El catálogo conserva exactamente sus rutas y formato actuales.

## Fuera de alcance

Login regional, aislamiento/consulta de nuevas tablas, cambios de API, formato
operativo, PostgreSQL, scrapers HN/NC, proxy, firewall y despliegue PROD.

## Criterios de aceptación

- El enlace GT apunta al catálogo raíz del mismo host.
- Las vistas piloto HN/NC y el aviso de prototipo siguen presentes.
- No se agregan llamadas fetch ni se transmiten credenciales desde la demo.
- La suite Node pasa y el build TypeScript compila.

## Archivos y validación

- `public/demo-acceso-pais.html`
- `src/specs/demo-acceso-pais.test.ts`
- `specs/README.md`
- `docs/MIGRATION_PLAN.md`
- `docs/DECISIONS.md`
- `docs/WORKFLOW_AND_HANDOFF.md`
- `docs/HANDOFF_2026-09-27.md`

Validar con `corepack pnpm test` y `corepack pnpm run build`; después publicar
únicamente por el flujo Windows → GitHub → Ubuntu DEV y pedir revisión del
catálogo operativo desde el enlace GT.
