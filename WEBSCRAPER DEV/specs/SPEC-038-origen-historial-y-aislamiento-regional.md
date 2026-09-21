# SPEC-038 — Origen del historial y aislamiento regional

Estado: En progreso. Primera entrega: auditoría readonly; evidencia Ubuntu pendiente.

Actualización: informe Ubuntu recibido y revisado en docs/SPEC-038_REVISION_INFORME.md.
173772 productos; sin anomalías referenciales detectadas. Origen de Sleep Gallery
requiere detalle de rutas antes de backfill. Auditor ampliado, migración pendiente.

## Revisión por evidencia detallada (prevalece sobre el diseño inicial inferior)

Informe completo recibido: 178723 productos, 244 ejecuciones, capturado el
2026-09-21 09:46:13 -06:00. Sin anomalías referenciales reportadas. Se identifican
377 filas de producto Sleep Gallery /sv/producto/ con precios USD en ejecuciones
2,3,4,5,6,11,13,14,15,16,17,18,19. El nombre histórico Guatemala no prueba su país.
Quedan 130 filas del portal sin esa evidencia concordante (navegación, enlaces,
URLs malformadas u otros casos). No reasignarlas por nombre ni borrarlas.

Se sustituye la propuesta de país único obligatorio en scraping_runs por una
relación scraping_run_paises(run_id,pais_codigo), PK compuesta y FK a runs/paises.
Productos y publicaciones referencian el par (run_id,pais_codigo). Una ejecución
histórica conserva ID/UUID aunque contenga varios países; workers futuros reciben
un solo país explícito y crean su asociación. Ninguna autorización se concede
por run_id solo: consultar productos exige país y permiso.

Antes del backfill final se necesita clasificación completa, incluyendo filas
sin producto real; mantenerlas pendientes de revisión sin exponerlas como datos
de otro país. No crear país ficticio ni habilitar SV por encontrar historia SV.
No aplicar NOT NULL hasta resolver el tratamiento de pendientes. Los índices,
claves de publicación y lectores deben seguir este modelo, no el país único
de ejecución planteado inicialmente. La política de publicación sigue por
(pais_codigo,store_key); conservar IDs y precios textuales originales.

history_resolution.py genera plan offline parcial, sin conectar a DB. Resultado
reproducible del informe recibido en docs/SPEC-038_PLAN_EXCEPCIONES.json; contiene
IDs propuestos y pendientes, no SQL ejecutable ni autorización para migrar.

## Clasificación integral antes de migración

regional_classification.py clasifica cada fila original (no sólo muestras):
asignado, revision o no_producto. Nunca borra filas ni habilita países. Rutas
regionales explícitas o dominios nacionales conocidos sustentan país; fuentes
genéricas requieren combinación tienda/origen registrada y precio monetario
concordante. Conflictos de moneda, origen desconocido y evidencia insuficiente
quedan en revisión. Menús regionales, redes sociales y cuentas se separan de
productos antes de derivar país. No convertir campos numéricos históricos.

regional-plan-dev.mjs ofrece resumen readonly compacto con conteos, ejemplos,
ejecuciones mixtas y publicaciones pendientes. Toda fila tiene resultado; sin
embargo clasificar una fila como revisión no equivale a resolverla. La huella
del conjunto de filas y reglas permite identificar el informe que se revisó,
sin autorizar automáticamente aplicación ni garantizar frescura posterior.

El modelo candidato regional_schema.py define productos con país nullable y
estado explícito durante transición, asociación ejecución/país y publicaciones
con clave país/tienda. Se prueba aislado; no modifica los modelos ni migraciones
del esquema 037. Se aplicará sólo con lectores/escritores compatibles y una
política explícita para pendientes. Las pruebas ORM no sustituyen validación
PostgreSQL real. Esta entrega no cambia todavía consultas del catálogo.

## Objetivo

Relacionar productos, ejecuciones y publicaciones con países del catálogo en la
misma base, conservando IDs, UUIDs, historia y resultados GT. SPEC-036 y SPEC-037
ya están aplicadas; no volver a registrar baseline.

## Secuencia y criterios de aceptación

1. Ejecutar `node scripts/history-origin-dev.mjs` en Ubuntu DEV. Leer todos los
   productos en una transacción readonly con snapshot consistente; informar
   tienda, orígenes de ambas URLs, rutas de ejemplo sin parámetros, run_id,
   source_process, ejecuciones vacías, referencias huérfanas y UUID discordantes.
   La auditoría no asigna país ni considera un dominio prueba suficiente.
2. Revisar la evidencia y resolver fuentes ambiguas, productos sin ejecución,
   ejecuciones vacías o mixtas y publicaciones sin ejecución. No asignar GT por
   defecto ni dividir una ejecución histórica cambiando su identidad.
3. Preparar migración 037 -> 038 transaccional con precondiciones que vuelvan a
   verificar la evidencia antes del backfill. Añadir pais_codigo referenciado a
   paises; unicidad (pais_codigo,id) en runs y FK compuesta desde productos y
   publicaciones. Productos sin run_id conservan esa nulabilidad. Publicaciones
   pasan a PK (pais_codigo,store_key). Sin default global GT; sin borrar historia.
4. Retirar DDL heredado de worker y lectores Node/FastAPI en la misma entrega que
   migre el esquema. La actualización requiere pausar escritores DEV, migrar y
   arrancar las versiones compatibles. Mantener la regla de publicación de 3 h.
5. Escrituras de workers con país explícito validado; lecturas, latest-run,
   resumen, filtros, comparaciones y CSV limitados por país en SQL. Actualizar
   llamadores actuales para enviar GT explícitamente; rechazar país ausente o
   deshabilitado. No habilitar otros países todavía.
6. Índices candidatos: productos (pais_codigo,fecha_scraping DESC,id DESC),
   productos (pais_codigo,run_id), runs (pais_codigo,id DESC). Evaluar EXPLAIN
   real y paginación SQL sin alterar resultados antes de fijar índices finales.
7. Probar aislamiento entre países, FK cruzadas, migración repetida, bloqueo
   ante evidencia nueva/ambigua y paridad GT; npm test y suite Python completas.

## Fuera de alcance de esta entrega

Login, usuarios, permisos y Nuxt siguen como siguientes etapas de SPEC-034.
El filtro de país no sustituye autorización. No modificar PROD, .env ni Excel.
No activar una migración ni cambiar consultas productivas antes de revisar la
evidencia real. Esta primera entrega no completa el aislamiento regional.

## Archivos y validación

- backend/catalog_api/db/history_origin.py: inventario de datos readonly.
- scripts/history-origin-dev.mjs: entrada DEV sin opción de escritura.
- backend/tests/test_history_origin.py: evidencia, URLs y anomalías.
- docs/SPEC-038_DEV.md: ejecución y siguiente paso.
