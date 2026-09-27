# SPEC-068 — Migrar el gestor de paquetes de Guatemala PROD a pnpm

Estado: Preparación local autorizada; despliegue productivo pendiente.

## Objetivo

Llevar a Guatemala PROD la misma disciplina de dependencias validada en DEV,
manteniendo el funcionamiento actual de la aplicación y haciendo explícito que
la publicación/reinstalación de PROD es un paso operativo separado.

## Alcance

- Fijar pnpm `11.25.0` en el package manifest de PROD.
- Generar el lockfile desde el `package-lock.json` propio de PROD antes de
  retirarlo, sin copiar el lockfile de DEV.
- Actualizar README y el lanzador PowerShell para instalación con lockfile
  congelado y ejecución con pnpm.
- Conservar scripts `start`, `catalog`, `build` y `scrape`; PM2 puede mantener
  `npm run catalog` durante transición.
- Validar instalación congelada y build desde el checkout local de PROD.

## Fuera de alcance

No copiar ni modificar `.env`, Excel de precios, respaldos, datos, PostgreSQL,
PM2 ni el servidor Ubuntu PROD. No publicar ni reiniciar el servicio como parte
de este cambio local.

## Criterios de aceptación

- `pnpm install --frozen-lockfile` funciona con la definición PROD.
- `pnpm run build` compila el código PROD local sin conexión a PostgreSQL.
- No queda un lockfile npm paralelo en PROD.
- El lanzador y el README usan pnpm y Corepack, no descargan dependencias con npm.
- El rollback productivo consiste en revertir el commit de gestor antes de
  volver a `npm ci`; la decisión de desplegar sigue a cargo del usuario.

## Archivos previstos

`WEBSCRAPER PROD/package.json`, `WEBSCRAPER PROD/pnpm-lock.yaml`,
`WEBSCRAPER PROD/README.md`, `WEBSCRAPER PROD/iniciar_catalogo_oculto.ps1`,
este archivo y el índice permanente de specs.
