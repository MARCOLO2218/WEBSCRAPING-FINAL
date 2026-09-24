# Registro de decisiones

## ADR-016: Límite compartido y fail-closed del login

- Estado: preparación local SPEC-046; sin integración PostgreSQL operativa.
- Contadores por HMAC (usuario normalizado e IP del socket), con upsert y bloqueo
  de fila PostgreSQL para compartir estado entre workers. SQLite sólo prueba
  comportamiento, no concurrencia PostgreSQL.
- Umbrales provisionales: 8 intentos/cuenta y 30/IP por ventana de 15 min; el
  siguiente intento bloquea por 15 min. Respuesta 429 genérica; login exitoso
  borra sólo el contador de cuenta y conserva el límite compartido de IP.
- No confiar en `X-Forwarded-For`; una IP compartida de proxy se comporta como una
  sola IP hasta configurar un resolvedor de proxy confiable.
- Sin clave HMAC estable o base de límites disponible, no hay autenticación.
  La clave debe tener al menos 32 bytes y compartirse entre workers; cambiarla
  invalida la asociación con contadores existentes. Definir rotación antes de
  producción. Antes de exposición: proxy confiable definido, tarea horaria de
  limpieza por lotes, migraciones 043/044 aprobadas y bootstrap seguro.

## ADR-015: Sesiones preparadas, autenticación aún no operativa

- Estado: implementación local aislada bajo SPEC-045; no desplegada ni migrada.
- Contraseñas Argon2id; cookie opaca revocable almacenada como SHA-256, CSRF
  double-submit con hash servidor y Origin HTTPS exacto.
- Roles y países se releen por solicitud; país nuevo no concede asignación.
  No hay usuario o contraseña predeterminados.
- Revisión 043 crea tres tablas y depende de 042. Upgrade/downgrade requieren
  flags específicos; no ejecutar antes de autorización y ventana coordinada.
- Router fuera de `main.py`. Antes de exponerlo hacen falta rate-limit
  distribuido, bootstrap administrativo auditado, HTTPS/proxy, cierre de rutas
  heredadas y lectores regionales. SQLite no prueba PostgreSQL/Ubuntu.

## ADR-014: Permisos regionales por petición antes del login operativo

- Estado: implementación local preparatoria en SPEC-044.
- Validar sesión/usuario vigentes, país explícito habilitado, asignación y acción.
  Sin proveedor de identidad real, el adaptador FastAPI deniega; no hay usuario
  de desarrollo ni país GT por defecto. Sin datos persistentes en esta entrega.
- Lector: consultar/exportar. Operador: además cargas y scrapers de su país.
  Administrador global gestiona acceso, sin bypass de asignaciones comerciales.
- Contextos inmutables por petición; el proveedor debe releer permisos actuales,
  de modo que revocar país, sesión o usuario afecte la siguiente petición.
- Recursos por ID requieren país obtenido en servidor. Productos de catálogo
  sólo si están asignados; revision/no_producto nunca se convierten en GT.
- No aplicar esta dependencia a lecturas heredadas como aparente aislamiento:
  aún carecen de país y algunas hacen DDL/INSERT durante GET. Primero sesiones
  reales, lectores aislados, CSRF y cierre coordinado de accesos heredados.
- Reutilizar catalogo.paises y los criterios 038/042/043. No crear countries ni
  volver a asignar globalmente GT como planteaba la versión inicial de SPEC-034.

## ADR-013: Ampliación regional complementaria antes de activar lectores

- Estado: implementada y validada en copia PostgreSQL por SPEC-042/043;
  rollback a 037 comprobado. Original/PROD no migradas. Ver informe de cierre.
- La PK store_key heredada y el DDL Node siguen activos. Alterarlos ahora cambia
  el contrato de los escritores y expone publicaciones con pendientes.
- Crear cinco tablas complementarias, una clasificación por producto original
  y una evaluación por publicación. Conservar historia y países sin UPDATE.
- Asociaciones ejecución/país conservan runs mixtas GT/SV. PK/FK y huella integral
  impiden duplicados o reasignación silenciosa. Datos sin evidencia siguen nulos.
- Países habilitados, permisos y consumo de estas tablas no cambian. El modelo
  candidato de SPEC-038 expresa destino; 042 es sólo la fase de ampliación.
- Revisión monetaria adicional bloquea posibles falsos positivos de 038-v2
  (C$ frente a $, o monedas mezcladas). No modificar el informe cerrado.
- Rollback exacto sólo si no hubo cambios posteriores; nunca restauración
  indiscriminada sobre un sistema que siguió escribiendo.

## ADR-012: Conservar ejecuciones históricas con varios países

- Estado: diseño de SPEC-038 respaldado por auditoría; implementación DB pendiente.
- Evidencia: 377 productos con ruta SV y precios USD en 13 ejecuciones con GT.
- Decisión: asociar ejecuciones y países mediante scraping_run_paises; no dividir
  ejecuciones ni cambiar IDs. País por producto y publicación; FK al par run/país.
- Pendientes de origen no se asignan por el nombre de tienda ni se eliminan.
  Habilitación y autorización de país son independientes de su presencia histórica.

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
- Decision inicial: Guatemala, Honduras, El Salvador y Nicaragua. Actualización 2026-09-10: Costa Rica se admite como expansión futura (SPEC-034), no se activa ahora.
- Motivo: concentrar la expansion regional en los cuatro paises definidos por el negocio.

## ADR-006: Una base regional segmentada por pais

- Estado: propuesta.
- Decision: usar una sola base de datos y asociar pais y moneda a tiendas, ejecuciones, productos y publicaciones.
- Motivo: mantener una operacion general, facilitar reportes regionales y evitar cuatro esquemas y migraciones duplicadas. La aplicacion debera exigir filtros, restricciones e indices por pais.

## ADR-007: Abreviaturas internas de pais

- Estado: aceptada.
- Decision: usar `GT` para Guatemala, `HN` para Honduras, `SV` para El Salvador y `NC` para Nicaragua dentro de la plataforma.
- Motivo: conservar las abreviaturas definidas por el negocio para filtros, configuracion y segmentacion.

## ADR-008: Entrada estable y selección de país

- Estado: aceptada; implementación regional pendiente.
- Decisión: una URL del servidor y un selector GT/HN/SV/NC; la migración interna no exige recrear accesos ni instalar runtimes en equipos usuarios.
- El acceso local actual no cumple aún el modo remoto: se verificará la URL pública y se adaptará en una siguiente implementación.

## ADR-009: Piloto FastAPI independiente

- Estado: implementación inicial DEV, SPEC-024.
- Decisión: backend/catalog_api, puerto interno 8000 en loopback, configuración CATALOG_API_* y entorno virtual independiente. Node continúa sirviendo el catálogo mientras se prueban endpoints nuevos.

## ADR-010: Monedas regionales y selecciones recordadas

- Estado: requisito registrado; implementación propuesta en SPEC-029.
- Decisión: GT/GTQ, HN/HNL, SV/USD y NC/NIO. Los filtros conservan la moneda original sin convertir importes.
- Recordar país y filtros válidos por país en el mismo navegador; validar aislamiento en API antes de habilitar la pantalla regional.
- La estructura concreta del formato de entrada queda pendiente de definición; se conserva el flujo de revisión, confirmación y respaldo.

## ADR-011: Nuxt, ORM y login regional

- Migración solicitada: mismo proyecto y PostgreSQL, Nuxt, FastAPI por capas y
  SQLAlchemy/Alembic. Login y selección de país obligatorios.
- Confirmado 2026-09-10: administrador asigna países por usuario. Validación en API.
- Catálogo ampliable, incluyendo CR a futuro. Implementación pendiente en SPEC-034.
