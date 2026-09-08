# SPEC-028 - Exportacion CSV FastAPI

Estado: Completada

## Objetivo y comportamiento

Implementar GET /api/export.csv reutilizando CatalogRepository.products y los
seis filtros actuales. Conservar las 20 columnas, su orden, UTF-8 con BOM,
comillas dobles en todas las celdas, escape de comillas y saltos LF del exportador
Node. Null y campos ausentes se exportan vacios. Sin filas se conserva la cabecera
y la linea vacia final del comportamiento existente. Nombre de descarga:
catalogo_comercial_comparativo.csv. Errores: JSON generico 500, no CSV parcial.

## Limites

Solo DEV. Sin cambios de interfaz, dependencias, archivos de datos o PROD.
No ejecutar consultas reales ni despliegues. Se conserva la consulta actual,
incluido el complemento Excel posterior al filtro SQL. No se modifican celdas
que empiecen con signos de formula: esta es paridad del formato existente, no
un endurecimiento de seguridad para abrir contenido no confiable en Excel.
La respuesta se construye en memoria como Node; streaming queda fuera de alcance.

## Aceptacion

Pruebas de bytes contra el exportador Node con fixtures, valores vacios,
acentos, comas, comillas, saltos, numeros y orden. Pruebas HTTP de filtros,
cabeceras, OpenAPI, metodo GET y error. Ejecutar Pytest y npm test.

## Resultado

Implementado en backend/catalog_api/export.py y main.py; pruebas en
backend/tests/test_export.py. npm test: 67 aprobadas (incluye build). Pytest:
28 aprobadas, dos advertencias de dependencias. Fixtures comparados byte a byte
contra dist/server/catalog-service.js. Sin consultas reales ni despliegue;
paridad operativa pendiente. Las pruebas de paridad requieren npm run build
antes de Pytest y Node disponible, sin nuevas dependencias Python.
