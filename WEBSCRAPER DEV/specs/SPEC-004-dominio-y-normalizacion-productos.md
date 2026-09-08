# SPEC-004: Dominio y normalizacion de productos

- Estado: Completada
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Extraer los tipos de producto y las reglas comunes de normalizacion desde los
archivos principales para iniciar la modularizacion sin cambiar resultados.

## Comportamiento esperado

- El scraper y el servidor comparten tipos de producto desde un modulo de dominio.
- La limpieza de espacios y la normalizacion de mayusculas y acentos tienen una
  unica implementacion.
- Los marcadores vacios se convierten a `null` antes de persistir.
- Los rangos de precios en quetzales conservan el comportamiento existente.
- Las rutas, respuestas, filtros y scrapers mantienen su comportamiento.

## Fuera de alcance

- Cambiar reglas del filtro final de productos.
- Agregar paises, monedas o tiendas nuevas.
- Separar scrapers individuales o persistencia PostgreSQL.
- Modificar la base de datos, el frontend o PROD.

## Criterios de aceptacion

- Existe `src/domain/product.ts` como fuente compartida.
- `catalog-server.ts` y `scrape-facenco-energy.ts` usan el modulo nuevo.
- Hay pruebas de limpieza, normalizacion, valores vacios y precios.
- `npm test` y `npm run build` terminan correctamente.

## Implementacion

- `src/domain/product.ts`
- `src/specs/product-domain.test.ts`
- Integracion en `src/catalog-server.ts`
- Integracion en `src/scrape-facenco-energy.ts`
- Descubrimiento automatico de pruebas en `package.json`

## Pruebas

- Compactacion de espacios y saltos de linea.
- Comparacion insensible a mayusculas y acentos.
- Conversion de marcadores vacios a `null`.
- Extraccion de minimo y maximo desde precios GTQ.
- Suite existente de catalogo de tiendas y contratos API.
