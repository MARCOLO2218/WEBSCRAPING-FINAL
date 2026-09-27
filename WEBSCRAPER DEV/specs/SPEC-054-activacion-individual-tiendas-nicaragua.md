# SPEC-054 - Activación individual de tiendas Nicaragua

Estado: Implementación local validada. La suite Node pasó 127/127; Nicaragua y todas sus tiendas permanecen deshabilitadas. Validación Ubuntu DEV pendiente.

## Objetivo

Permitir que el registro aislado de scrapers NC seleccione sólo tiendas habilitadas en el catálogo central, conservando un interruptor general de país cerrado por defecto.

## Criterios de aceptación

- Sin habilitación explícita del país, el registro devuelve una lista vacía.
- Con el país habilitado, sólo registra tiendas NC con `enabled: true` en `STORE_CATALOG`.
- Cada tienda se puede habilitar o apagar mediante su propio indicador del catálogo; una tienda apagada no se incluye aunque las demás estén encendidas.
- El orden de ejecución permanece estable y las entradas de países distintos se ignoran.
- No se conecta el registro al ejecutor principal ni se cambia el catálogo operativo: NC y sus cinco tiendas siguen apagadas.

## Implementación y validación

Implementado en `src/scrapers/nc/registry.ts`. Las pruebas cubren el cierre general, filtro por tienda/país y orden estable (`src/specs/nicaragua-scraper-registry.test.ts`). `npm test`: 127/127 aprobadas. El registro continúa aislado y no está conectado al ejecutor principal; falta repetir la suite en Ubuntu DEV.
