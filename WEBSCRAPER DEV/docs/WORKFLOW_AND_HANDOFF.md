# Continuidad y flujo de trabajo

## Ubicacion oficial

```text
C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV
```

El trabajo de arquitectura se realiza exclusivamente en DEV. PROD se mantiene estable hasta una promocion solicitada y aprobada por el usuario.

## Estado actual

- El sistema mantiene 19 tiendas de Guatemala.
- El backend y los scrapers siguen en TypeScript.
- El frontend actual permanece en `public/`.
- Se creo un catalogo central en `src/config/store-catalog.ts`.
- Las pruebas ejecutables viven en `src/specs/`.
- Las specs permanentes viven en `specs/`.
- Los contratos actuales de la API Node viven en `docs/API_CONTRACTS.md`.
- FastAPI es la arquitectura objetivo para la API, no una reescritura inmediata.

## Siguiente trabajo

Continuar desde el primer pendiente de `docs/MIGRATION_PLAN.md`. Los contratos de
la API actual ya estan registrados; el siguiente trabajo es extraer tipos y
normalizacion de productos mediante cambios pequenos con pruebas.

## Flujo local en Windows PowerShell

```powershell
cd "C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV"
npm install
npm test
npm run build
npm run catalog
```

Antes de confirmar cambios:

```powershell
cd "C:\Users\USER\source\repos\scraper 6"
git status
git diff --check
```

Agregar solamente los archivos informados por el task. No utilizar `git add .`.

```powershell
git add "WEBSCRAPER DEV/ruta/del/archivo"
git status
git commit -m "Descripcion concreta del cambio en DEV"
git push
```

## Actualizacion de Ubuntu DEV

```bash
cd "/home/administradorgt/WEBSCRAPING-FINAL"
git pull

cd "/home/administradorgt/WEBSCRAPING-FINAL/WEBSCRAPER DEV"
npm install
npm test
npm run build
pm2 restart webscraper-dev --update-env
pm2 logs webscraper-dev --lines 80
```

DEV utiliza el puerto 3030 y su propia configuracion `.env`.

## Promocion a PROD

Solo se realiza cuando el usuario lo solicita expresamente despues de validar DEV. Antes de copiar, identificar exactamente los archivos funcionales aprobados. Nunca copiar `.env`, datos locales, logs, `node_modules` ni archivos generados.

Despues de que el usuario suba los archivos aprobados a GitHub, actualizar Ubuntu PROD con:

```bash
cd "/home/administradorgt/WEBSCRAPING-FINAL"
git pull

cd "/home/administradorgt/WEBSCRAPING-FINAL/WEBSCRAPER PROD"
npm install
npm run build
pm2 restart webscraper-prod --update-env
pm2 logs webscraper-prod --lines 80
```

PROD utiliza el puerto 3031 y su propia configuracion `.env`.

## Reglas que no deben romperse

- La publicacion visual se protege por tienda durante tres horas.
- Una ejecucion con mayor cantidad puede publicarse antes de vencer la llave.
- El Run ID visual debe reflejar la ejecucion mas reciente de base de datos.
- Un fallo de una tienda no debe detener innecesariamente las demas.
- Las comparaciones regionales futuras deben hacerse dentro del mismo pais y moneda.
- Todo cambio se prueba primero en DEV.

## Texto para iniciar un nuevo chat

```text
Trabaja en C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV.
Lee AGENTS.md y todos los documentos de docs/ y specs/ antes de modificar codigo.
Continua desde el primer pendiente de docs/MIGRATION_PLAN.md. Conserva todas las specs,
incluso las completadas, y agrega o actualiza una spec por cada task. Trabaja solo en DEV;
no modifiques PROD, no copies .env y no ejecutes Git ni despliegues en Ubuntu. Dame esos
comandos separados para que yo los ejecute.
```
