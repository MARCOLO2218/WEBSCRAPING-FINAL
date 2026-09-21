# SPEC-040 — Corte pequeño de carga FACENCO

Estado: En progreso; preparación y validación DEV. PROD todavía sin modificar.

Actualización: usuario confirmó funcionamiento y SPEC-041 en Ubuntu DEV 9334ed1
y autorizó promoción. Adaptación local PROD preparada: panel y plantilla, módulo
de carga y catálogo de monedas, ruta en servidor monolítico y filtro Excel GT.
Sin cambios de esquema, workers, .env, Excel operativo ni package-lock.
PROD compila y pasan 3 pruebas de carga/preview/respaldo con archivos temporales.
Despliegue Ubuntu pendiente. PROD_FACENCO_SERVER.patch contiene sólo los cambios
del servidor de este corte para staging selectivo; se conserva el cambio local
previo de latest-run sin publicarlo. Usar git apply --cached --ignore-space-change
por finales de línea del archivo histórico. No git add del servidor completo.

## Objetivo y alcance candidato

El usuario solicita validar DEV y promover un corte pequeño antes de continuar
login/regionalización. Candidato: carga XLSX FACENCO (SPEC-026/031/033), panel con
revisión, confirmación, respaldo y plantilla descargable, validación país/moneda
y lectura exclusiva GT en el catálogo actual. No habilita consultas regionales.

## Hallazgos

ddd70bd fue descargado en Ubuntu según salida aportada. No aparece todavía el
mensaje de auditoría terminada. La auditoría no despliega cambios funcionales.
SPEC-033 mantiene archivos locales sin publicar. PROD usa servidor monolítico;
DEV usa módulos y contiene cambios de migración ajenos a este corte.

## Secuencia de aceptación

1. Publicar únicamente archivos de SPEC-033 enumerados en la entrega.
2. Ubuntu DEV: npm test, pytest y reinicio exclusivo webscraper-dev.
3. Validar descarga de plantilla, preview válido, rechazo de país/moneda
   incompatible, catálogo y CSV GT. Preview no modifica el Excel operativo.
   Confirmación/respaldo ya cubierta localmente con archivos temporales; una
   prueba operativa de confirmación debe usar el Excel completo vigente revisado,
   nunca la plantilla vacía ni datos de prueba que reemplacen precios reales.
4. Obtener estado de cambios de PROD Ubuntu y contrastarlo con Windows antes
   de preparar adaptación mínima. No sobrescribir modificaciones operativas.
5. Adaptar carga y lector GT al servidor PROD existente; verificar dependencias,
   puertos, pruebas y diff exacto. No copiar todo src/ ni public/ desde DEV.
6. Entregar manifiesto de archivos, respaldo/restauración de código y comandos
   de despliegue PROD sólo después de validación DEV. No modificar datos ni .env.

## Exclusiones

Auditorías 035–038, Alembic, catálogo PostgreSQL países, login, Nuxt, NC y
modularización completa. No migración de esquema PROD. El Excel regional sigue
siendo reemplazo global (advertido en pantalla); no habilita operadores regionales.

## Validación local

La suite completa existente debe pasar antes de entregar el candidato DEV.
Pendiente validación operativa Ubuntu y adaptación PROD; no marcar completada.
