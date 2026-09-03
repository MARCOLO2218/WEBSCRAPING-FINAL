# SPEC-003: Regionalizacion para cuatro paises

- Estado: Propuesta
- Ambiente: DEV
- Fecha: 2026-09-03

## Objetivo

Definir como extender la plataforma desde Guatemala hacia Honduras, El Salvador
y Nicaragua sin duplicar innecesariamente la aplicacion ni mezclar datos entre
paises. Costa Rica queda expresamente fuera del alcance.

## Alcance territorial

| Codigo | Pais | Estado inicial |
|---|---|---|
| `GT` | Guatemala | Operativo; 19 tiendas actuales |
| `HN` | Honduras | Primer piloto futuro |
| `SV` | El Salvador | Incorporacion posterior al piloto |
| `NI` | Nicaragua | Incorporacion posterior al piloto |

## Separacion propuesta de codigo

- Un catalogo central definira paises, codigos ISO, moneda y configuracion comun.
- El catalogo de tiendas asociara cada tienda a un `countryCode`.
- Los scrapers se separaran primero por pais y despues por tienda o familia
  tecnica, sin crear cuatro copias completas del servidor.
- API, cola, persistencia y frontend seguiran siendo componentes compartidos y
  recibiran el pais como parte explicita de cada operacion.
- La separacion se hara gradualmente en DEV y con pruebas antes de mover
  comportamiento a PROD.

Estructura objetivo orientativa:

```text
src/
  config/countries.ts
  config/stores.ts
  scrapers/
    gt/
    hn/
    sv/
    ni/
  services/
  persistence/
  api/
```

La estructura es una direccion de diseno y puede ajustarse durante la
modularizacion sin cambiar el alcance funcional.

## Estrategia de base de datos recomendada

Usar una sola base de datos regional. No se propone crear cuatro bases en esta
etapa.

- Tabla o catalogo `countries`: codigo, nombre, moneda y estado.
- Cada tienda pertenece a un pais mediante una clave foranea.
- Cada ejecucion conserva el pais y solo admite tiendas de ese pais.
- Cada producto o snapshot queda relacionado con la tienda y la ejecucion; el
  pais debe poder validarse sin ambiguedad.
- Consultas, restricciones unicas e indices se disenaran con el pais como parte
  de la segmentacion.
- Las comparaciones y publicaciones nunca mezclaran paises ni monedas.
- La migracion asignara `GT` a los registros actuales antes de exigir el pais en
  registros nuevos.

Cuatro bases independientes solo se evaluaran si existe una obligacion legal,
infraestructura separada por pais, equipos operativos totalmente independientes
o un problema de escala demostrado. Esa alternativa aumenta respaldos,
migraciones, conexiones, monitoreo y reportes que deben mantenerse por separado.

## Comportamiento esperado

- El usuario selecciona un pais antes de consultar o ejecutar tiendas.
- Solo aparecen tiendas habilitadas para el pais elegido.
- Un trabajo no puede contener tiendas de paises distintos.
- Run ID, resultados, CSV y publicaciones se identifican por pais.
- Los precios conservan moneda y no se comparan entre monedas diferentes.
- Guatemala continua funcionando durante la migracion.

## Fuera de alcance

- Agregar ahora tiendas o scrapers de Honduras, El Salvador o Nicaragua.
- Ejecutar migraciones de base de datos.
- Cambiar endpoints, frontend o comportamiento de PROD.
- Implementar FastAPI dentro de esta spec de diseno.

## Orden propuesto de implementacion

1. Extraer tipos y normalizacion de productos conforme a la Etapa 2 actual.
2. Crear y probar el catalogo de paises y monedas.
3. Preparar una migracion compatible que marque los datos existentes como `GT`.
4. Hacer obligatorio el pais en tiendas, trabajos, consultas y publicaciones.
5. Separar los scrapers actuales bajo el modulo de Guatemala.
6. Probar Honduras con dos o tres tiendas.
7. Incorporar El Salvador y Nicaragua de forma progresiva.

## Criterios de aceptacion futuros

- Solo existen como paises habilitados `GT`, `HN`, `SV` y `NI`.
- Todos los datos actuales quedan asociados a Guatemala sin perder historial.
- Las pruebas impiden seleccionar tiendas o comparar productos de paises distintos.
- Los endpoints y exportaciones filtran por pais.
- `npm test` y `npm run build` continuan funcionando.

## Archivos afectados en esta definicion

- `docs/PRODUCT_VISION.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/MIGRATION_PLAN.md`
- `specs/README.md`
- `specs/SPEC-003-regionalizacion-cuatro-paises.md`

## Pruebas

No se agregan pruebas ejecutables todavia porque esta spec permanece en estado
`Propuesta` y no modifica el comportamiento del sistema.
