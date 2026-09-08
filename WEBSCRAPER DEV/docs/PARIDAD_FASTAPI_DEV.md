# Comparación Node/FastAPI en DEV — SPEC-030

Herramienta preparada; paridad operativa todavía no validada. No ejecutar contra
la base real hasta reanudar la validación pausada y elegir Windows o Ubuntu DEV.

## Preparación de la validación real

Ambos servidores deben usar la misma base DEV y el mismo archivo de precios.
Mantener detenidas las cargas y ejecuciones del scraper durante la comparación.
La herramienta solo envía GET, pero las rutas existentes pueden inicializar
snapshots en PostgreSQL. No carga ni imprime .env ni configura los servidores.

Copiar backend/parity-cases.example.json a un archivo de trabajo y reemplazar los
valores ilustrativos por filtros que existan en DEV. Incluir casos adicionales
para FACENCO, otras tiendas, precios nulos y resultados vacíos conocidos. Cada
caso tiene name único y params. Se exigen sin filtros, seis filtros individuales
y combinación de los seis. Mantener datos no vacíos representativos: una serie
de respuestas vacías coincidentes no prueba el complemento FACENCO ni cobertura.

## Windows PowerShell (cuando se reanude)

Desde WEBSCRAPER DEV/backend, con ambos procesos DEV iniciados y configurados:

```powershell
.\.venv\Scripts\python.exe -m catalog_api.parity --node-url http://localhost:3030 --api-url http://127.0.0.1:8000 --cases parity-cases.example.json
```

El ejemplo utiliza los puertos locales documentados. Sustituir el archivo por
los casos preparados para la base; no tomar sus valores como datos verificados.

## Ubuntu DEV (ejecución manual por el usuario)

Desde WEBSCRAPER DEV/backend, en el propio servidor con ambos procesos listos:

```bash
.venv/bin/python -m catalog_api.parity --node-url http://127.0.0.1:3030 --api-url http://127.0.0.1:8000 --cases parity-cases.example.json
```

No se requiere exponer el puerto 8000 ni desplegar un servicio nuevo para usar
la herramienta. No se han ejecutado estos comandos contra servicios reales.

## Interpretación

- coincide: JSON equivalente (orden de objetos irrelevante, listas conservadas)
  o CSV idéntico por bytes. Tipos string, boolean y número no son intercambiables.
- diferente: respuestas válidas y estables con contenido distinto.
- inestable: alguna respuesta cambió entre sus dos lecturas; repetir con datos estables.
- error: conexión, estado HTTP, contenido o cabecera de descarga inválidos.

Salida 0: todos coinciden; 1: fallo, diferencia o inestabilidad; 2: configuración
inválida. El informe no contiene cuerpos, valores de filtros ni URLs. Los nombres
de casos sí se muestran: no incluir secretos en ellos. JSON usa comparación
numérica exacta; diferencias de redondeo se revisan, no se silencian con tolerancias.
No normaliza fechas o campos omitidos: diferencias de contrato quedan visibles.

La repetición no garantiza una transacción entre servidores ni detecta toda
actualización concurrente. Registrar ambiente, fecha, cobertura, conteos y revisión
manual FACENCO antes de declarar paridad operativa. Guardar el informe, si se
necesita, en una ruta nueva de trabajo evitando sobrescribir archivos existentes.

## Pruebas sin base real

Ejecutar npm test desde DEV y después, desde backend:

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
```

Las pruebas de la herramienta usan httpx.MockTransport; no arrancan servidores,
no conectan PostgreSQL y no ejecutan scrapers reales.
