# Vision del producto

## Proposito

El Catalogo Comercial Comparativo permite recopilar, conservar y comparar precios y disponibilidad de camas y colchones publicados por comercios de Centroamerica.

## Usuarios

- Usuario comercial: consulta productos, precios, disponibilidad y diferencias.
- Operador: ejecuta el scraper completo o por tiendas seleccionadas y revisa su estado.
- IT: instala accesos, configura ambientes y atiende conectividad y despliegues.
- Desarrollo: incorpora tiendas, mantiene extractores y evoluciona la plataforma.

## Alcance actual

- Guatemala, con 19 tiendas configuradas.
- Ambientes DEV y PROD independientes.
- Ejecucion completa o por tiendas seleccionadas.
- Persistencia en PostgreSQL, exportacion CSV y precios FACENCO complementados desde Excel.
- Publicacion protegida por tienda durante tres horas; una cantidad mayor puede publicarse antes.

## Vision regional

Una sola plataforma atendera Guatemala, Honduras, El Salvador, Nicaragua y Costa Rica. Toda tienda, ejecucion y producto pertenecera explicitamente a un pais. Las comparaciones se realizaran dentro del mismo pais y moneda.

## Principios

1. No perder comportamiento validado durante la reorganizacion.
2. Incorporar paises y tiendas mediante configuracion central y extractores aislados.
3. Separar interfaz, API, ejecucion de scrapers y persistencia.
4. Mantener trazabilidad mediante Run ID, pais, tienda, fecha y estado.
5. Proteger PROD: todo cambio se valida primero en DEV.

## Evolucion prevista

1. Modularizar el codigo TypeScript actual y agregar especificaciones.
2. Introducir FastAPI como API con endpoints documentados.
3. Ejecutar scrapers TypeScript como workers fuera del proceso web.
4. Incorporar cola, limites de concurrencia y observabilidad.
5. Agregar paises mediante pilotos controlados.
