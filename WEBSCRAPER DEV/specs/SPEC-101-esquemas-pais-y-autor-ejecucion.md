# SPEC-101: Esquemas por país y autor de ejecución

Estado: En progreso. Inventario preparado; migración y conexión operativa pendientes.

## Fase local de administración preparada

backend/catalog_api/db/administration_rehearsal.py: plan por defecto; origen
fijo catalogocomercial_identidad_101, destino fijo catalogocomercial_ensayo_101,
ambos dentro de tickets_it_db. Usa sudo -n y psql sin abrir acceso externo.
Sólo --apply --confirm-rehearsal con SHA256 de identidad exacto aplica DDL.
Copiar seis tablas administrativas con PK/FK/checks/índices de modelos actuales,
preservando ID, hash, niveles, grants, sesiones, intentos y auditoría; recrear
triggers append-only. Las FK se reescriben a administracion, no a catalogo.
No copiar tablas comerciales del snapshot de identidad sobre el ensayo actual.
Reservar schemas guatemala/nicaragua vacíos; no afirmar que ya hay tablas ni
productos separados. Rechazar cualquier esquema destino preexistente; una sola
transacción con lock_timeout/advisory lock, conteos de ensayo y sin reemplazos.
El SQL con hashes no se guarda ni imprime: viaja por stdin a psql.
Crear administracion.migraciones_ensayo como registro separado: no alterar la
revisión Alembic comercial ni declarar migrado el runtime auth 047.
Validación local: sintaxis Python; ejecución del plan y ensayo PostgreSQL pendientes.

## Respaldos identidad/NC confirmados por el usuario

- identidad-101-xQbBaObl/identidad_dev.dump, SHA256
  97e25a83aa962f1771d13fac17fe802a6ee3c2082425cdf5cd61cf717452c5ae.
- Restauración catalogocomercial_identidad_101: revisión 047, cinco cuentas,
  doce asignaciones. admin=superadmin; cramos/mloarca=admin;
  evaldez/lbarrientos=usuario. Los grants no habilitan países deshabilitados.
- nicaragua-101-Yor0gMCo/nicaragua-catalogo.json, SHA256
  647295e87a9b88e34aae2f048df9aa88aa6408dc781012f2198d9e2635ff7e76.
- Snapshot NC versión 1, NIO, 2026-10-21T15:45:47.079Z: 339 productos;
  Curacao 65, Gallo 39, Siman 77, Walmart 152, Maxi Pali 6.
  Con precio: 310; sin precio: 29. Conservar todos y origen/fecha por tienda.
  Este JSON no identifica al usuario que inició el scraping.

## Solicitud y destino

Una base webscraper_dev en catalogocomercial-dev-db (FACENCOADDONS,
Ubuntu-24.04/WSL2). Separar administración compartida de información comercial:
administracion, guatemala y nicaragua. No crear otra base por país.
No modificar NAS operativo ni PROD durante esta etapa.

Continuación autorizada: preparar localmente y consultar el NAS DEV actual;
aplicación al servidor nuevo pendiente de acceso. Las consultas de inventario
no requieren habilitar ni cambiar la contraseña del rol del servidor nuevo.
El NAS permanece operativo: no ejecutar allí el DDL de separación durante el
inventario. La copia nueva quedará desactualizada si continúan escrituras NAS;
el corte definitivo requiere respaldo nuevo y ventana sin escrituras.

## Evidencia recibida

Copia restaurada desde dump SHA256
861926d5930fa8fdca291f71bb06dc5b8007e3e0d7054e790e1cf93394c691e1.
Revisión 047_admin_level_event, 15 tablas catalogo, 180382 productos,
180382 clasificaciones regionales, cinco usuarios y 12 asignaciones.
La proyección 042 no debe asumirse sincronizada con todos los runs legacy.
NC publica JSON y todavía no persiste productos en PostgreSQL.

### Corrección de fuentes confirmada por consultas del usuario

El .env del catálogo activo del NAS apunta a 10.238.13.227:5432,
WEBSCRAPING_CAMAS_DEV, rol postgres y esquema catalogo. Consulta read-only:
189328 productos, último run 256 (130 productos, 2026-10-08). Siete objetos
visibles en information_schema.tables: cinco tablas y dos vistas comerciales.
La autenticación usa otra conexión, a webscraper_dev dentro de tickets_it_db.
Esta segunda base conserva 180382 productos y termina en run 246 (2026-09-21).
No confundir el respaldo restaurado de identidad/proyección con la fuente de
productos actual. La diferencia de conteos es 8946, pero no prueba por sí misma
que los IDs/contenidos anteriores coincidan: comparar UUID/huellas y snapshots
antes de incorporar datos. No hacer INSERT de delta por id > max(id) sin esa
comprobación. No sobrescribir usuarios/permisos con los de la fuente comercial.

scripts/backup-commercial-dev.mjs prepara un respaldo de la fuente comercial
exacta con manifiesto de conteos/columnas desde el mismo snapshot PostgreSQL.
Plan predeterminado read-only. --backup escribe archivos privados en el NAS,
no DDL/DML en la fuente. Requiere sudo -v previo para el cliente pg_dump 16
de tickets_it_db; transmite credencial por env-file temporal privado, no por
argumento ni log; elimina ese archivo al salir normalmente. Inventario legible
y SHA256 no sustituyen una restauración de ensayo. Ejecución NAS pendiente.

## Contrato de destino

### Ensayo comercial y equivalencia histórica recibidos

Respaldo comercial NAS: comercial-dev-o2fT1z/comercial_dev.dump,
SHA256 b04988f5695b7c6c2792388d2264df7895ca91698aa6c3861001e8802fb679b3.
Restaurado por el usuario en tickets_it_db/catalogocomercial_ensayo_101:
189328 productos, 255 runs, 19 publicaciones y run máximo 256.
El cluster no tiene rol postgres; primera restauración revirtió por propietario.
Reintento con --no-owner --no-privileges --single-transaction --exit-on-error
terminó correctamente. Conservar este tratamiento sólo para ensayo; permisos
de destino requieren configuración explícita posterior.

Comparación sobre el mismo cluster, runs id <= 246 y productos con run_id <= 246
o nulo, to_jsonb de fila completa ordenado por id:
- 245 runs: MD5 agregado 2b0e5c546a4ceaacfe2090e90f7cf083 en ambas bases.
- 180382 productos: MD5 agregado dae522a8f8973fa6c92f715b20be1661 en ambas.
Evidencia de equivalencia del contenido histórico compartido, no huella
criptográfica de seguridad. Extensión comercial observada: 10 runs y 8946 filas.
La identidad/permisos actuales y JSON NC necesitan respaldo propio antes de
combinar fuentes en scratch. Las bases operativas no se alteraron.

### Inventario NAS recibido (consulta read-only)

- Revisión 047_admin_level_event confirmada.
- public no contiene tablas; aloja pgcrypto. Conservar extensión y esquema
  durante la ampliación, sin DROP SCHEMA public CASCADE.
- productos_paises: GT/asignado 172532, SV/asignado 377,
  no_producto 3467 y revision 4006; total 180382. No descartar SV ni pendientes.
- scraping_runs: id bigint, run_uuid uuid no nulo, started_at timestamp sin zona,
  source_process, total_products, semana_run y semana_inicio; no tiene autor.
- usuarios.id varchar(36), no UUID nativo: FK nueva debe respetar este tipo.
- Historial con fecha sin zona: no asumir UTC ni convertirlo sin verificar el
  contrato original. Fechas de ejecución nuevas serán timestamptz.
- productos_catalogo mantiene precios texto y cuatro importes numeric(12,2),
  trigger calcular_precios_producto y registro_uuid único. Preservarlos.
- scraping_run_paises tiene PK compuesta run_id/pais_codigo; mantener historia
  mixta sin duplicar identidad ni totales globales al construir cubos.
- Falta contrastar conteo/IDs actuales legacy contra proyección regional 042:
  no tratar el conteo regional congelado como cobertura de todo el catálogo.

- administracion: identidad única de usuarios, países, asignaciones, sesiones,
  límites de login y auditoría. Mantener IDs, hashes de contraseñas y roles.
- Cada esquema comercial: tiendas, ejecuciones, productos y publicaciones.
  País/moneda explícitos y restricciones que impidan cruces accidentales.
- Autor manual obtenido en servidor desde la sesión autorizada al encolar;
  no aceptar un user_id enviado por el navegador como prueba de identidad.
- Persistir autor y UUID de ejecución antes de arrancar el worker; conservar
  atribución a través de cola, reinicios/reintentos y cierre fallido/parcial.
- FK hacia administracion.usuarios con borrado restringido; bloquear una cuenta
  no elimina su trazabilidad. No duplicar usuarios por país.
- Ejecución programada: cuenta de servicio explícita y origen programado.
  Importación histórica: origen histórico y autor nulo si no hay evidencia.
- No atribuir un histórico a admin ni deducir usuario a partir de tienda o fecha.
- Productos relacionados con ejecución y tienda; métricas por tienda separadas
  para evitar multiplicar conteos al construir cubos.
- Exponer vistas de reporting con país, moneda, usuario, ejecución, tienda,
  fechas, estado y conteos. No exponer hash de contraseña, sesión o credenciales.
- Importar snapshots NC conservando fecha/origen; no inventar historial ni autor.
- Clasificaciones revisión/no_producto permanecen en archivo de legado explícito;
  runs históricos mixtos conservan identidad y referencias por país. No asignar GT
  por defecto ni descartar SV/HN por estar deshabilitados en el portal.

## Etapas

1. Inventario read-only de schemas, extensión pgcrypto, columnas, FK, vistas,
   países/clasificaciones y conteos; salida real pendiente del servidor nuevo.
2. Diseñar mapeo verificable y migración versionada con backup, precondiciones,
   transacción, conteos/huellas e informe. Ensayar en otra base scratch.
3. Adaptar ORM/auth, SQL Node/Python, cola y workers al nuevo contrato. Migrar
   dependencias sin romper acceso ni ventanas de publicación existentes.
4. Importar NC e integrar escrituras y lecturas; restauración de tienda fallida
   debe conservar publicación anterior. Productos/run/publicación atómicos.
5. Validar aislamiento, permisos y reporting antes del corte de conexión.
6. Retirar objetos legacy sólo tras comprobar equivalencia y compatibilidad.
   public no se elimina por su nombre: inventariar extensiones y dependencias,
   conservarlo si se requiere, sin tablas comerciales de aplicación.

## Aceptación

Reconciliar productos, historia, usuarios y permisos; explicar toda diferencia.
No inferir autor histórico. Toda ejecución manual nueva debe tener autor válido.
Conservar fallos, reintentos y ejecución mixta sin duplicar métricas de cubos.
Demostrar que GT/NC no pueden leer/escribir el país ajeno sin autorización.
Login, administración y CSV/Excel siguen operativos tras corte coordinado.
No ejecutar DDL en el servidor hasta completar inventario y ensayo.

## Archivos y validación

backend/sql/101_inventario_esquemas.sql: sólo lectura, sin mostrar secretos.
scripts/backup-commercial-dev.mjs: comprobación sintáctica local; respaldo NAS
y restauración de ensayo pendientes. No se ejecutaron pruebas ni conexiones
remotas desde el agente. No hay migración DDL aplicada.
