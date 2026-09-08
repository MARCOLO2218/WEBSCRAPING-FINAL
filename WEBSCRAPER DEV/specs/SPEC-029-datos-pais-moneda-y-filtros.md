# SPEC-029: Datos por país, moneda y filtros recordados

- Estado: Propuesta
- Ambiente: DEV
- Fecha: 2026-09-07
- Relación: desarrollo incremental de SPEC-003; conserva el flujo de SPEC-026.

## Objetivo

Extender el formato de datos por país y moneda, permitir su selección en filtros
y recordar las opciones del usuario. Esta entrega registra el requisito; no
implementa cambios en Excel, API, base de datos ni pantalla.

## Catálogo solicitado

| País | Código interno | Moneda | Nombre |
|---|---|---|---|
| Guatemala | GT | GTQ | Quetzal |
| Honduras | HN | HNL | Lempira |
| El Salvador | SV | USD | Dólar estadounidense |
| Nicaragua | NC | NIO | Córdoba |

NC se conserva como código interno del negocio. Los importes mantienen su moneda
original: seleccionar un filtro no convierte ni reetiqueta precios.

## Comportamiento esperado

- Asociar país y moneda explícitos a los datos; mantener compatibilidad con los
  registros y el formato histórico de Guatemala, mediante una transición documentada.
- Validar la combinación país/moneda en el servidor y en la carga de datos.
  No basta con agregar opciones visuales. Rechazar inconsistencias con errores claros.
- Ofrecer selección de país y moneda en el catálogo; las opciones de moneda
  corresponden al país elegido. Inicialmente existe una moneda por país.
- Aplicar el contexto a productos, tiendas, filtros, resumen, Run ID y CSV.
  Los países sin datos muestran un estado vacío y nunca resultados de GT.
- Recordar el último país y las opciones de filtros de cada país en el mismo
  navegador. Al volver o recargar, restaurar únicamente valores todavía válidos.
- Limpiar selecciones incompatibles y descartar respuestas del país anterior.
  Si el almacenamiento local no está disponible, la pantalla debe seguir funcionando.
- Conservar en las cargas la revisión previa, errores por fila/campo, confirmación,
  respaldo y reemplazo atómico de SPEC-026.
- No mezclar países o monedas en comparaciones ni complementar productos de un
  país con precios FACENCO de otro.

## Definición pendiente antes de implementar el formato

Precisar si el archivo de entrada será un único XLSX con columna país, hojas por
país o archivos separados. La referencia del usuario a “formato de data” no
resolvió esta elección. Las listas desplegables de Excel se definirán con esa
estructura; el requisito de filtros del catálogo queda registrado por separado.
Recordar opciones se interpreta como persistencia de selecciones por navegador,
no como historial de auditoría de modificaciones de precios.

## Orden y dependencias

1. Mantener primero la validación pendiente de paridad Node/FastAPI y carga DEV.
   La conexión a PostgreSQL real continúa pausada por el usuario.
2. Al iniciar regionalización, definir el formato y el catálogo central país/moneda.
3. Preparar migración compatible GT/GTQ, restricciones, índices y aislamiento
   de persistencia, lecturas, publicaciones y trabajos según SPEC-003.
4. Adaptar carga y lectores del formato de datos sin perder validaciones ni respaldos.
5. Implementar filtros y memoria de selecciones una vez que la API aísle los datos.
6. Validar el conjunto en DEV antes de incorporar Tiendas Relax HN u otras tiendas.

La numeración registra el requisito y no lo adelanta a las dependencias del plan.
SPEC-030 prepara la herramienta de paridad; la validación real sigue pendiente.

## Criterios de aceptación y pruebas previstas

- GT conserva precios, historial y resultados existentes.
- Se aceptan GT/GTQ, HN/HNL, SV/USD y NC/NIO; se rechazan pares incompatibles.
- Fixtures con productos de igual nombre en distintos países no se cruzan.
- Carga inválida y preview no reemplazan datos; confirmación conserva respaldo.
- API, resumen y exportación respetan país/moneda, incluso sin resultados.
- Recargar restaura filtros; cambiar de país recupera sus opciones válidas;
  respuestas tardías y almacenamiento local inválido no contaminan la selección.
- Ejecutar npm test, luego Pytest y validación de navegador con datos de prueba.
  La validación con base real requiere reanudar expresamente el trabajo pausado.

## Fuera de alcance

Conversión de divisas, tipos de cambio, nuevos scrapers, despliegues, cambios en
PROD y modificación de archivos operativos durante esta entrega documental.

## Áreas previstas para implementación

Catálogos en src/config, persistencia, lectores y carga FACENCO, consultas Node
y FastAPI, contratos, exportaciones, public/ y pruebas Node/Python. Los archivos
exactos y la evidencia se registrarán al implementar cada etapa.
