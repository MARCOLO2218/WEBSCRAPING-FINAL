import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const demoHtml = await readFile(new URL('../../public/demo-acceso-pais.html', import.meta.url), 'utf8');

test('demo regional presenta el flujo de ingreso simulado y selección de país en español', () => {
  assert.match(demoHtml, /<html lang="es">/);
  assert.match(demoHtml, /PROTOTIPO DE PRESENTACIÓN · NO AUTENTICA USUARIOS NI EJECUTA SCRAPERS/);
  assert.match(demoHtml, /<h2 id="loginTitle">Iniciar sesión<\/h2>/);
  assert.match(demoHtml, /<h1 id="countryTitle">Elige un país<\/h1>/);
  assert.match(demoHtml, /data-country="GT"/);
});

test('formulario y botones de demo no transmiten credenciales ni ejecutan servicios', () => {
  assert.match(demoHtml, /id="demoLogin"/);
  assert.match(demoHtml, /event\.preventDefault\(\);\s*showStage\('countryStage'\)/);
  assert.doesNotMatch(demoHtml, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon|localStorage|sessionStorage/i);
});

test('Nicaragua queda deshabilitada para operación y permite abrir sólo el resumen piloto', () => {
  assert.match(demoHtml, /<button class="country-button" type="button" disabled>Acceso operativo pendiente<\/button>/);
  assert.match(demoHtml, /id="openNcReport"/);
  assert.match(demoHtml, /databaseWrites: false/);
  assert.match(demoHtml, /Los módulos y el país siguen deshabilitados\./);
});

test('Honduras muestra evidencia de piloto sin presentarse como catálogo conectado', () => {
  assert.match(demoHtml, /<span class="country-symbol">HN<\/span>/);
  assert.match(demoHtml, /id="openHnPreview"/);
  assert.match(demoHtml, /id="hnPreviewStage"/);
  assert.match(demoHtml, /<strong>19<\/strong>/);
  assert.match(demoHtml, /<strong>16 \/ 19<\/strong>/);
  assert.match(demoHtml, /La Curacao Honduras/);
  assert.match(demoHtml, /Diunsa Honduras/);
  assert.match(demoHtml, /Ver categoría Walmart HN/);
  assert.match(demoHtml, /Ver categoría La Curacao HN/);
  assert.match(demoHtml, /Ver categoría Diunsa HN/);
  assert.match(demoHtml, /sin consulta en vivo/);
  assert.match(demoHtml, /deshabilitado y fuera del ejecutor normal/);
});

test('demo usa los colores azul WMS de la aplicación', () => {
  assert.match(demoHtml, /--primary: #062f5f/);
  assert.match(demoHtml, /--primary-dark: #03264f/);
  assert.match(demoHtml, /--accent: #5ec7ed/);
  assert.match(demoHtml, /--primary-soft: #e7f7fd/);
});
