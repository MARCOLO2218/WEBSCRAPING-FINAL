# SPEC-027 - Contratos de lectura FastAPI

Estado: Completada

## Objetivo

Definir modelos verificables para productos, ultima ejecucion, resumen y error
en OpenAPI, sin cambiar el frontend Node ni acceder a la base real.

## Comportamiento

- Conservar nombres, nulls, identificadores string y etiquetas existentes.
- Documentar los seis filtros y respuestas 200/500.
- Los cuatro rangos numericos opcionales permanecen ausentes si no existen.
- Conservar columnas adicionales de PostgreSQL durante la transicion.
- Validar la salida dentro del manejo de errores para responder el error generico
  500 sin exponer datos internos cuando el repositorio incumpla el contrato.
- Mantener GET como unico metodo de lectura en FastAPI.

## Fuera de alcance

Despliegue, paridad con PostgreSQL real, exportacion CSV, paises, autenticacion,
cambio de frontend y modificaciones de Node o PROD.

## Aceptacion

Pruebas de esquemas OpenAPI, respuestas no vacias, nulls, campos opcionales,
identificadores grandes, filtros, metodos y errores. Ejecutar Pytest y npm test.

## Resultado

Modelos en backend/catalog_api/models.py; rutas en main.py y pruebas en
backend/tests/test_contracts.py. Pytest: 21 aprobadas (dos advertencias de
dependencias). npm test: 67 aprobadas, incluyendo build. No se conecto a la base
real ni se desplego. La compatibilidad operativa permanece pendiente.
