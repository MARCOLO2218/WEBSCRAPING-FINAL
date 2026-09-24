# SPEC-044 — Política de acceso por usuario y país

Estado: Completada localmente — política y dependencias preparatorias
Fecha: 2026-09-23
Deriva de SPEC-034; conserva SPEC-037/038/042/043.

## Objetivo y frontera

Implementar la política de autorización que usará el login regional: sesión
vigente, usuario activo, país explícito habilitado y asignación vigente para la
acción solicitada. Incorporar dependencias FastAPI reutilizables y probarlas en
una aplicación de prueba con proveedores en memoria.

No montar estas dependencias en la API heredada, todavía sin aislamiento de
datos. No crear login, credenciales, sesiones reales, tablas ni migraciones en
esta SPEC. No habilitar países ni consultar PostgreSQL. La protección de la
aplicación en operación continúa pendiente; este módulo es una base probada.

## Contrato

- El servidor obtiene sesión y asignaciones actuales desde un proveedor de
  confianza en cada petición. El navegador sólo aporta una cookie opaca
  `catalog_session`; nunca usuario, rol o asignaciones aceptadas como autoridad.
- Sin sesión, revocada, vencida o usuario desactivado: 401. Proveedor ausente o
  fallido: 503 genérico sin exponer credenciales, token ni mensaje interno.
- El país se solicita explícitamente en el parámetro de ruta `country_code`.
  Sin elección o código mal formado: 400. No hay GT ni país recordado por defecto.
  País desconocido, deshabilitado, sin asignación o acción sin permiso: 403.
- `lector`: consultar y exportar. `operador`: lo anterior, cargar precios de su
  país y ejecutar scrapers de su país. Roles y acciones desconocidos se deniegan.
- Administración global: gestionar usuarios/asignaciones. No concede consulta
  ni modificación automática del catálogo de países no asignados.
- Recursos consultados por ID exigen país comprobado del lado servidor; null,
  `revision` sin país comprobado o un país distinto se deniegan. El proveedor de
  datos debe filtrar también por país antes de devolver resultados. Productos
  sólo con clasificación `asignado`; `revision` y `no_producto` se deniegan incluso
  ante un país rellenado erróneamente.
- El contexto autorizado es inmutable y propio de cada petición. Dos pestañas
  pueden usar países diferentes sin cambiar una selección global en la sesión.
- La lista del selector incluye sólo países habilitados y asignados. Tener uno
  no evita la elección explícita. Nuevos países no otorgan acceso automático.
  Se conserva `NC` como código del negocio; no hay catálogo cerrado de cuatro.
- El adaptador futuro debe leer usuario/sesión/asignaciones/países de forma
  coherente y fresca por petición, sin reutilizar roles guardados en la cookie.

## Aceptación y pruebas

Probar usuarios distintos, rol por país, exportación, operaciones, administración,
revocación entre peticiones, expiración exacta, usuario desactivado, país
deshabilitado, país nuevo y recursos ajenos o sin país. Rechazar cabeceras/query
que intenten suplantar usuario/rol/país. El repositorio no debe consultarse ante
una autorización denegada. Rechazar el acceso si falta el adaptador o falla.

Pruebas Python con objetos y rutas de prueba en memoria; sin red externa ni DB.
`npm test` antes de la suite Python para conservar la prueba de paridad CSV.

## Siguiente incremento y punto de parada

Preparar autenticación real (almacenamiento de usuarios/asignaciones/sesiones,
hash de contraseñas, rotación, logout, CSRF y límites de intentos) en otra SPEC
pequeña. Después integrar lectores aislados y cerrar accesos heredados antes de
activar el login. Nuxt/login/selector será una entrega visual posterior.

La base DEV original permanece en su estado actual: no ejecutar SPEC-042/043 ni
otras migraciones sin confirmación explícita. Publicación Git y Ubuntu siguen
el flujo del usuario. No tocar PROD.

## Resultado — 2026-09-23

- 67 casos de política y 26 casos de dependencias HTTP: 93 nuevas pruebas.
- `npm test`: compilación TypeScript correcta, 96 aprobadas, 0 fallos.
- `backend/.venv/Scripts/python.exe -m pytest tests -q`: 230 aprobadas, 0 fallos;
  persisten los dos avisos previos de Starlette sobre httpx y BlockingPortal.
- Revisión independiente del código sin fallos de autorización identificados.
  Se evitó StrEnum para conservar el requisito documentado Python 3.10+; la suite
  se ejecutó con el entorno local existente, no con una matriz de versiones.
- No se ejecutaron conexiones al PostgreSQL existente, migraciones, Git de
  escritura, despliegues ni operaciones en Ubuntu/PROD. Sin credenciales reales.

La SPEC-034 completa sigue en progreso. Cerrar esta pieza no significa disponer
de login, aislamiento operativo ni pantalla regional: esos requisitos tienen
los siguientes incrementos descritos en `docs/ACCESO_REGIONAL_DEV.md`.

## Archivos del incremento

Nuevos:

- `backend/catalog_api/access/__init__.py`
- `backend/catalog_api/access/policy.py`
- `backend/catalog_api/access/dependencies.py`
- `backend/tests/test_access_policy.py`
- `backend/tests/test_access_dependencies.py`
- `specs/SPEC-044-politica-acceso-regional.md`
- `docs/ACCESO_REGIONAL_DEV.md`

Actualizados: SPEC-034, specs/README, docs/ARCHITECTURE, PRODUCT_VISION, DECISIONS,
MIGRATION_PLAN y WORKFLOW_AND_HANDOFF. Se aclaró en docs/SPEC-039_EVIDENCIA_DOM que
una diferencia de uno en cada conjunto no demuestra dos productos ausentes
distintos. Cambios previos ajenos permanecen fuera de este incremento.
