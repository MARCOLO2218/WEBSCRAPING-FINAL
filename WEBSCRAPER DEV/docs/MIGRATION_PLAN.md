# Plan de ordenamiento y migracion

## Actualización de gestor de paquetes — 2026-09-27

SPEC-067 fija pnpm `11.25.0` para las instalaciones de WEBSCRAPER DEV. El
lockfile se generó desde `package-lock.json`; Windows y Ubuntu DEV usan
`corepack pnpm install --frozen-lockfile`. La suite Node se ejecuta con
`pnpm test`. PROD y sus instrucciones npm no forman parte de esta migración.

Actualización SPEC-068: el usuario pidió trasladar pnpm a Guatemala PROD después
de validar DEV en Ubuntu. La preparación local usará `WEBSCRAPER PROD` como
fuente independiente y su lockfile propio; no reutiliza el lockfile DEV. Ubuntu
DEV en `2e3ae00` instaló con Corepack/pnpm 11.25.0, pasó las 127 pruebas
disponibles en ese commit y compiló. La revisión local Windows cuenta pruebas
HN adicionales aún no publicadas. El reinicio PM2 quedó online; el despliegue
de PROD sigue separado y a cargo del usuario.

## Actualización de continuidad — 2026-09-26

El sprint `Demo DEV Nicaragua y acceso por país` quedó cerrado al 100% después
de la confirmación del usuario sobre el recorrido visual. El formulario sigue
siendo demostrativo; no autentica ni autoriza usuarios. SPEC-054 se actualizó a
4762a50 en Ubuntu DEV y la suite terminó con 127/127 pruebas; NC y las cinco
tiendas siguen apagadas y fuera del ejecutor normal.

SPEC-057 completó localmente un lector regional de solo lectura que exige el
`CountryContext` de SPEC-044 y une la proyección regional por país, tienda y
ejecución publicada. Suite: 290 Python aprobadas, una prueba PostgreSQL optativa
omitida, y 134 Node aprobadas. No está montado en FastAPI ni consultó PostgreSQL.
SPEC-058 completó localmente la fábrica de ruta `GET /api/countries/{country_code}/products`
con permisos por petición y sesión inyectada; tampoco está montada en `main.py`.
SPEC-059 ofrece la unión inyectable del `AuthRepository` y la sesión
request-scoped desde una `sessionmaker` explícita, sin cargar `.env` ni construir
engines. SPEC-060 comprueba localmente la integración con SQLite: GT asignado y
activo permite leer, NC apagado y la sesión revocada se rechazan. No prueba
PostgreSQL/Ubuntu ni monta las rutas operativas. El siguiente paso seguro es
preparar y revisar el plan separado de integración a la base DEV original;
después quedan configuración/auth operativa, HTTPS/proxy y cierre de rutas
heredadas.

Validación global al cierre de SPEC-060: 292 pruebas Python aprobadas, una
prueba PostgreSQL optativa omitida y 134 pruebas Node aprobadas. No se usaron
servicios ni datos fuera del entorno local.

SPEC-061 revisó estáticamente la integración futura. Los scripts de escritura
actuales bloquean cualquier destino que no sea `webscraper_dev`/`webscraper_user`;
el objetivo operativo aún no se identificó aquí. Además, la proyección regional
042 no se refresca con publicaciones posteriores. Por eso siguen pendientes un
plan específico autorizado, un ensayo scratch desde backup fresco y el diseño
de sincronización antes de montar el login o el lector.

SPEC-062 ya define el contrato de sincronización, sin cambiar el escritor.
SPEC-063/064 implementan y prueban el contrato común 038-v3; cualquier plan
regional debe regenerarse porque `C$` queda correctamente como NIO. La revisión
estática del 2026-09-26 definió mantener la clave visible `source_site`, rechazar
colisiones de tienda entre países, y verificar el backfill 042 junto con los
futuros deltas mediante un ledger append-only. No renombrar automáticamente
claves globales. FACENCO Excel queda como fuente complementaria separada,
filtrada por país/moneda e identificada por código con ámbito de país, sin
inventarle runs PostgreSQL. Falta decisión de negocio para precios con vigencia
ausente o vencida. Luego se puede implementar y probar dual-write transaccional en
fixtures/PostgreSQL scratch;
una migración/activación en la base DEV original seguirá requiriendo autorización
separada.

Incremento local SPEC-062 (2026-09-26): Node ya fusiona productos Excel y
PostgreSQL por país+código, con fallback por nombre sólo para el catálogo
Guatemala. Dos pruebas nuevas cubren códigos iguales entre países y homónimos.
La operación sigue limitada al catálogo Node actual; no implica lector regional.
Validación: `npm test`, 158/158.

Incremento siguiente: comparación de precios Node/Python acotada por país y
moneda. Validación actual: `npm test`, 159/159; pytest de catálogo/Excel, 8/8.

Después del cierre del sprint de demo, SPEC-065 registra seis tiendas candidatas
HN/SV, todas apagadas, con directorios y registros aislados. Walmart HN tiene un
primer cliente paginado VTEX, validado con fixtures para límites, moneda, host,
categoría y deduplicación. El piloto manual mostró que búsquedas por texto
mezclaban categorías: 21 URLs aceptadas e incluían mascotas y protectores frente
a 19 productos anunciados. El extractor ahora consulta la ruta de categoría VTEX
documentada y valida la ruta exacta por producto. El segundo piloto confirmó
19/19 productos únicos y 16/19 con precio; tres fichas no publicaron precio en
la respuesta. La cobertura objetivo queda validada, pero no integrar al ejecutor
hasta definir cómo se reportan esas ofertas sin precio. La Curacao HN tiene un
contrato HN/HNL aislado, pero sin lector DOM porque la categoría devuelve 403
desde este entorno. Suite local: 173/173.

Validación Windows al cierre de SPEC-064: `npm test` 156/156 y Pytest 293
aprobadas, una integración PostgreSQL optativa omitida y dos avisos preexistentes.

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
La concurrencia PostgreSQL se validó en `webscraper_dev` mediante un probe
acotado que eliminó sus filas temporales. Las revisiones 043/044 están aplicadas
y SPEC-048 creó un administrador global sin asignaciones ni sesiones. El router
sigue sin montar. Antes de exponer: secreto HMAC estable, IP confiable tras
proxy, limpieza periódica, lectores regionales y cierre de rutas heredadas. No
cambia interfaz ni conecta rutas heredadas. Guía:
`docs/AUTENTICACION_REGIONAL_DEV.md`.

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
