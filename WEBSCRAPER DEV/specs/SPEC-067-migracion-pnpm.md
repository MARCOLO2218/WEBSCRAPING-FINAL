# SPEC-067 — Migrar instalación Node de DEV a pnpm

Estado: Completada localmente; pendiente de que el usuario publique y valide Ubuntu DEV.

## Objetivo

Fijar pnpm como gestor reproducible de dependencias JavaScript del proyecto
DEV, conservando comandos de aplicación y evitando modificar PROD.

## Alcance

- Fijar una versión exacta de pnpm mediante `packageManager` en `package.json`.
- Generar `pnpm-lock.yaml` desde el lockfile npm existente.
- Usar pnpm en scripts internos, instrucciones de desarrollo y validación.
- Mantener `npm start`, `npm run catalog` y demás scripts disponibles para
  compatibilidad durante la transición.
- No tocar archivos `.env`, configuración PostgreSQL ni `WEBSCRAPER PROD`.

## Criterios de aceptación

- `pnpm install --frozen-lockfile` completa usando el lockfile comprometible.
- `pnpm test` compila y aprueba la suite.
- `pnpm start`, `pnpm run catalog` y scripts equivalentes mantienen sus nombres.
- La versión de pnpm queda fijada y el flujo de Ubuntu DEV documentado.
- Se conserva un único lockfile de Node activo para evitar resoluciones distintas.

## Archivos previstos

`package.json`, `pnpm-lock.yaml`, instrucciones permanentes, documentación de
flujo y este índice/spec. npm no se elimina del entorno y PROD no se modifica.

## Validación local

- `pnpm import` convirtió el lockfile npm; `pnpm-lock.yaml` fija la resolución.
- `pnpm install --frozen-lockfile` completó correctamente.
- `pnpm test`: 176 pruebas aprobadas.
- `npm test`: 176 pruebas aprobadas como compatibilidad temporal.
- `pnpm --version`: 11.25.0. `corepack pnpm --version` no pudo verificarse en
  este sandbox porque Corepack intentó crear su caché en una ruta global sin
  permiso; las instrucciones Ubuntu/Windows usan Corepack para aplicar el pin.
- pnpm 11 requiere Node.js 22 o superior; la versión del servidor Ubuntu no se
  verificó, por lo que su actualización debe comenzar con `node --version`.
- No se ejecutaron comandos Ubuntu ni se modificó PROD.
