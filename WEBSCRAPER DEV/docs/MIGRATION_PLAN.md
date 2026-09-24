# Plan de ordenamiento y migracion

## Estado vigente — código publicado y avances locales

SPEC-042 y SPEC-043 están completadas para la copia PostgreSQL `webscraper_dev`.
Se aplicó, verificó, repitió y revirtió a `037_countries`; la base original y PROD
no se migraron. Informe: `docs/SPEC-042-043_CIERRE_COPIA.md`.

El usuario autorizó publicar el código: `d89b97b` contiene SPEC-042/043 y
`ea417ed` contiene la preparación de SPEC-039. Confirmó la actualización Ubuntu
DEV a `ea417ed` y 86 pruebas Node + 137 Python aprobadas (dos avisos de
deprecación). No se ejecutó la migración original con esa actualización.

Trabajo reciente: SPEC-039, scraper de La Curacao Nicaragua (no trabajo visual),
cerrada para el lote piloto el 2026-09-23. Capturas HTML reales procesadas
offline: categoría superior p1/p2/p3 = 67 productos únicos de 68 anunciados;
Camas p1/p2/p3 = 53 SKU de 54. En ambos casos el usuario autorizó omitir el
producto no observado sólo en este lote; los lectores conservan
`count_mismatch` y no fabrican ni persisten registros. Las cuatro fuentes por
tamaño recibieron confirmación manual de página final, aunque sus HTML no tienen
señales para certificarlo automáticamente. Siete capturas de tamaño/Camas
contenían 53 URL canónicas únicas, sin duplicados ni diferencias observadas; la
vista previa local validó 53 candidatos sin conflictos. No activó NC, no abrió
red ni conectó a PostgreSQL. Ver `docs/SPEC-039_EVIDENCIA_DOM.md`. NC sigue fuera
del ejecutor GT y no está habilitado.

La migración original sigue siendo una etapa separada: backup/recuperación,
plan readonly fresco, ventana sin escritores y autorización expresa. No
reutilizar el hash calculado para `webscraper_dev`. Las autorizaciones de
publicación anteriores no autorizan migraciones ni nuevos commits automáticos.

## Incremento vigente — SPEC-046 bajo SPEC-034

SPEC-045 completada localmente para autenticación aislada. SPEC-046 implementa
límite por usuario/IP HMAC, reserva atómica propuesta y fail-closed; agrega
revisión 044 protegida y limpieza acotada. Verificación: 96 Node y 259 Python
(1 prueba PostgreSQL omitida, 2 avisos de deprecación conocidos). Sigue en progreso: SQLite no valida
La prueba PostgreSQL concurrente quedó preparada y exige `SPEC046_POSTGRES_TEST_URL`
a una base vacía `spec046_scratch_*`; no se ejecutó porque no hay motor local
activo. Router sin montar; 043/044 no ejecutadas, sin
usuarios ni bootstrap. Antes de exponer: ensayo PostgreSQL aislado, bootstrap
auditado, secreto HMAC estable, IP confiable tras proxy, limpieza periódica,
lectores regionales y cierre de rutas heredadas. No cambia interfaz ni conecta
rutas heredadas. Guía: `docs/AUTENTICACION_REGIONAL_DEV.md`.

Publicar código requiere revisar sólo los archivos del incremento; conservar
fuera los cambios ajenos existentes. No ejecutar migración original ni reinicios.

El resto de este archivo se conserva como **plan histórico**; sus prioridades,
estados y secuencias anteriores no describen el estado actual.

## Prioridad actualizada 2026-09-10 — SPEC-034

Migración solicitada a Nuxt/FastAPI/SQLAlchemy/Alembic con login y país obligatorio.
Administrador asigna países por usuario. Iniciales GT/HN/SV/NC; CR futuro permitido.
Orden: cerrar SPEC-033 -> baseline ORM sobre base existente -> aislamiento regional
y autenticación -> Nuxt -> cargas/trabajos autorizados -> proxy HTTPS y transición
en Ubuntu DEV. Esta prioridad histórica se concreta ahora en los incrementos de SPEC-034.
SPEC-032 validada por usuario en Ubuntu (70 Node); SPEC-033 local (74 Node/40 Python),
pendiente de publicar. Paridad real FastAPI continúa pendiente.

## Etapa 1 - Base segura

- [x] Crear vision del producto y arquitectura.
- [x] Crear catalogo tipado de tiendas y pais.
- [x] Agregar primeras especificaciones ejecutables.
- [x] Establecer registro permanente de specs y flujo de continuidad.
- [x] Registrar contratos actuales de la API.

## Etapa 2 - Modularizacion TypeScript

- [x] Extraer tipos y normalizacion de productos.
- [x] Extraer configuracion y calidad por tienda.
- [x] Separar persistencia PostgreSQL.
- [x] Separar cada scraper por tienda o familia tecnica.
- [x] Separar rutas, servicios y cola del servidor de catalogo.

## Etapa 3 - FastAPI en paralelo

- [x] Preparar comparador HTTP Node/FastAPI (SPEC-030; pruebas simuladas). Validación contra DEV real pendiente al reanudar la pausa.

- [x] Crear aplicacion FastAPI y pruebas Pytest (SPEC-024; salud local validada).
- [ ] Publicar endpoints de salud y lectura.
  - Lecturas implementadas y probadas localmente en SPEC-025; validación y publicación DEV pendientes.
- [x] Definir contratos OpenAPI de lectura (SPEC-027; pruebas locales, paridad operativa pendiente).
- [x] Implementar exportacion CSV FastAPI (SPEC-028; paridad con fixtures Node validada).
- [ ] Mover catalogo, filtros, resumen y Run ID.

## Etapa 4 - Trabajos y frontend

- [x] Carga de precios FACENCO desde pantalla con validación y respaldo (SPEC-026; validación operativa DEV pendiente).

- [ ] Incorporar cola externa y workers TypeScript.
- [ ] Mover creacion, progreso y cancelacion de ejecuciones.
- [ ] Separar y probar el frontend.
- [ ] Retirar el servidor Node anterior al completar la equivalencia.

## Etapa 5 - Regionalizacion

- [x] Catálogo central TypeScript de países/monedas y validación de pares (SPEC-032; publicación Ubuntu pendiente).
- La definición del formato Excel y el aislamiento de datos/API siguen pendientes.

- [ ] Definir formato de entrada y catálogo GT/GTQ, HN/HNL, SV/USD, NC/NIO (SPEC-029).
- [ ] Agregar modelo de pais y moneda en base de datos.
- [ ] Adaptar carga y lectores por país/moneda conservando revisión, confirmación y respaldo (SPEC-029).
- [ ] Implementar selector GT/HN/SV/NC y aislamiento de resultados al cambiar país.
- [ ] Agregar filtro de moneda compatible y recordar selecciones válidas por país en el navegador (SPEC-029; después del aislamiento API).
- [ ] Configurar acceso remoto a URL estable del servidor y verificar continuidad tras actualizaciones.
- [ ] Ejecutar piloto con Honduras y dos o tres tiendas.
- [ ] Incorporar El Salvador y Nicaragua progresivamente.
- [ ] Aplicar segmentacion por pais en consultas, ejecuciones y publicaciones.
