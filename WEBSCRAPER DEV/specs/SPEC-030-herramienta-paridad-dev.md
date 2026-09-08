# SPEC-030: Herramienta de comparación Node/FastAPI DEV

- Estado: Completada
- Fecha: 2026-09-07

## Objetivo

Preparar una herramienta reproducible de comparación HTTP sin ejecutar todavía
la validación contra PostgreSQL real, que permanece pausada.

## Comportamiento y aceptación

- CLI independiente con URLs explícitas de Node y FastAPI, timeout y casos JSON.
- Comparar GET products, summary y export.csv para cada caso, y latest-run.
- Los casos deben cubrir sin filtros, cada uno de los seis filtros y una combinación.
- Comparar JSON conservando orden de listas, campos, nulls y tipos (int/float
  equivalentes como números JSON). CSV exacto por bytes; validar MIME y descarga.
- Errores HTTP, JSON inválido y fallos de conexión nunca cuentan como paridad.
- Detectar cambios observables repitiendo cada lectura: marcar inestable si cambia.
- Reportar caso, ruta y categoría de diferencia sin imprimir cuerpos ni credenciales.
- Salida 0 para coincidencias; 1 para diferencias/inestabilidad/fallos; 2 para
  configuración inválida. Coincidir no sustituye la revisión de cobertura real.
- Pruebas con transporte HTTP simulado, sin base de datos ni servidores reales.

## Límites

Solo prepara la herramienta. No cambia API, frontend, Excel, PROD ni despliega.
No carga .env. Los GET existentes pueden inicializar snapshots en el servidor;
la ejecución real requiere reanudar la validación DEV. Lecturas secuenciales no
garantizan un snapshot transaccional: usar datos estables, sin scrapers ni cargas.

## Resultado

Herramienta implementada en backend/catalog_api/parity.py, casos ilustrativos en
backend/parity-cases.example.json, 11 pruebas nuevas en backend/tests/test_parity.py
y guía docs/PARIDAD_FASTAPI_DEV.md. npm test: 67 aprobadas; Pytest: 39 aprobadas
con dos avisos de dependencias. Completada únicamente la preparación y prueba
simulada de la herramienta; la paridad con PostgreSQL real permanece pendiente.
