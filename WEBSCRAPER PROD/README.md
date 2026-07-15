# Scraper de camas

Scraper en TypeScript + Playwright para extraer productos desde:

- https://camasfacenco.com/
- https://camasolympiaonline.com/gt/
- https://lacolchoneria.com.gt/
- https://paises.sleepgalleryca.com/
- https://mattress.com.gt/
- https://www.bedsndreams.com/
- https://www.furniturecity.com.gt/mattress-colchones/

Los archivos generados son:

```text
output/comparacion_colchones.csv
output/comparacion_colchones.xlsx
```

El archivo `.xlsx` ya trae la primera fila inmovilizada para que los encabezados no se muevan al bajar.

## Instalacion

```bash
npm install --no-audit
npx playwright install chromium
```

## Ejecucion

```bash
npm start
```

Para abrir el CSV en Excel:

```bash
start excel output\comparacion_colchones.csv
```

## Archivo principal

El codigo principal esta en:

```text
src\scrape-facenco-energy.ts
```

## Donde cambiar URLs existentes

Al inicio de `src\scrape-facenco-energy.ts` estan estas constantes:

```ts
const FACENCO_SOURCE_URL = 'https://camasfacenco.com/';
const OLYMPIA_SOURCE_URL = 'https://camasolympiaonline.com/gt/';
const LA_COLCHONERIA_SOURCE_URL = 'https://lacolchoneria.com.gt/';
const SLEEP_GALLERY_SOURCE_URL = 'https://paises.sleepgalleryca.com/';
const MATTRESS_SOURCE_URL = 'https://mattress.com.gt/';
const BEDS_DREAMS_SOURCE_URL = 'https://www.bedsndreams.com/';
const FURNITURE_CITY_SOURCE_URL = 'https://www.furniturecity.com.gt/mattress-colchones/';
```

Si solo cambia la URL de una tienda que ya existe, modifica una de esas constantes.

## Donde cambiar el CSV generado

En `src\scrape-facenco-energy.ts`, cambia esta constante:

```ts
const OUTPUT_FILE = resolve('output/comparacion_colchones.csv');
const OUTPUT_XLSX_FILE = resolve('output/comparacion_colchones.xlsx');
```

## Donde esta el main

El `main` esta al final de `src\scrape-facenco-energy.ts`:

```ts
async function main(): Promise<void> {
```

Dentro del `main` esta este bloque:

```ts
const rows = [
  ...await scrapeFacenco(page, scrapedAt),
  ...await scrapeOlympia(page, scrapedAt),
  ...await scrapeLaColchoneria(page, scrapedAt),
  ...await scrapeSleepGallery(page, scrapedAt),
  ...await scrapeMattress(page, scrapedAt),
  ...await scrapeBedsDreams(page, scrapedAt),
  ...await scrapeFurnitureCity(page, scrapedAt),
];
```

Ese bloque une todos los scrapers.

## Como agregar una tienda nueva

No basta con agregar solo la URL. Cada sitio tiene HTML diferente, por eso normalmente tambien se necesita una funcion nueva para leer sus productos.

Pasos:

1. Agrega la URL al inicio del archivo:

```ts
const NUEVA_TIENDA_SOURCE_URL = 'https://ejemplo.com/';
```

2. Crea una funcion nueva:

```ts
async function scrapeNuevaTienda(page: Page, scrapedAt: string): Promise<CsvProduct[]> {
  await goto(page, NUEVA_TIENDA_SOURCE_URL);
  // Aqui va la logica de extraccion de productos de esa pagina.
  return [];
}
```

3. Agrega la funcion dentro del `main`:

```ts
const rows = [
  ...await scrapeFacenco(page, scrapedAt),
  ...await scrapeOlympia(page, scrapedAt),
  ...await scrapeLaColchoneria(page, scrapedAt),
  ...await scrapeSleepGallery(page, scrapedAt),
  ...await scrapeMattress(page, scrapedAt),
  ...await scrapeBedsDreams(page, scrapedAt),
  ...await scrapeFurnitureCity(page, scrapedAt),
  ...await scrapeNuevaTienda(page, scrapedAt),
];
```

## Titulos del CSV

Los encabezados del CSV salen en español:

- Sitio fuente
- Marca
- Linea
- Categoria
- Producto
- Disponibilidad
- Precio regular
- Precio oferta
- Descuento
- Cuotas
- URL producto
- URL fuente
- Titulo
- Descripcion
- Garantia
- Beneficios
- URL imagen
- Texto imagen
- Fecha scraping

Estos titulos se configuran en `src\scrape-facenco-energy.ts`, en el objeto:

```ts
const columnHeaders
```
