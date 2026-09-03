# Plan de ordenamiento y migracion

## Etapa 1 - Base segura

- [x] Crear vision del producto y arquitectura.
- [x] Crear catalogo tipado de tiendas y pais.
- [x] Agregar primeras especificaciones ejecutables.
- [x] Establecer registro permanente de specs y flujo de continuidad.
- [ ] Registrar contratos actuales de la API.

## Etapa 2 - Modularizacion TypeScript

- [ ] Extraer tipos y normalizacion de productos.
- [ ] Extraer configuracion y calidad por tienda.
- [ ] Separar persistencia PostgreSQL.
- [ ] Separar cada scraper por tienda o familia tecnica.
- [ ] Separar rutas, servicios y cola del servidor de catalogo.

## Etapa 3 - FastAPI en paralelo

- [ ] Crear aplicacion FastAPI y pruebas Pytest.
- [ ] Publicar endpoints de salud y lectura.
- [ ] Definir contratos OpenAPI compatibles con el frontend.
- [ ] Mover catalogo, filtros, resumen y Run ID.

## Etapa 4 - Trabajos y frontend

- [ ] Incorporar cola externa y workers TypeScript.
- [ ] Mover creacion, progreso y cancelacion de ejecuciones.
- [ ] Separar y probar el frontend.
- [ ] Retirar el servidor Node anterior al completar la equivalencia.

## Etapa 5 - Regionalizacion

- [ ] Agregar modelo de pais y moneda en base de datos.
- [ ] Ejecutar piloto con Honduras y dos o tres tiendas.
- [ ] Incorporar El Salvador, Nicaragua y Costa Rica progresivamente.
