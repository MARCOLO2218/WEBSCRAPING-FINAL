# Plan de ordenamiento y migracion

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
