# SPEC-082 — Ejecutor Nicaragua independiente

Estado: implementación local; validación Ubuntu pendiente.

## Objetivo

Unificar las cinco tiendas confirmadas por el usuario en `pnpm run scrape:nc`,
independiente del ejecutor GT y sin persistencia. Es la primera integración de
los pilotos; catálogo web, exportación y escritura regional siguen pendientes.

## Contrato

- Por defecto recorre La Curacao, El Gallo, Siman, Walmart y Maxi Palí en serie.
- `--stores=siman,walmart` selecciona tiendas por alias; rechaza desconocidas
  antes de abrir Chromium. Continúa tras fallo por tienda; vacía/fallo implica
  resultado parcial y código de salida 1.
- Unifica filas completas con país NC, moneda NIO, tienda, identidad y valores
  numéricos separados del texto de precio. Rechaza moneda y procedencia ajenas,
  conserva precio ausente como null y deduplica por URL dentro de cada tienda.
- La Curacao usa su lector/collector estricto y verifica categoría/total.
  Las otras tiendas mantienen sus límites actuales y reportan cobertura acotada,
  sin prometer exhaustividad comercial. Maxi Palí conserva sus seis URLs.
- Reutiliza adaptadores del piloto existente mediante función exportada sin
  ejecución al importar; conserva su CLI anterior. Un navegador por ejecución,
  una página por tienda y cierre en finally.
- Walmart marca «No disponible» si el API informa IsAvailable=false o stock 0;
  stock desconocido queda explícito. Precio cero no se convierte en oferta.
- Sólo consola: no archivos, PostgreSQL, .env, GT, servidores o PROD.

## Pruebas

Normalización NIO, ausencias, procedencia, identidad, deduplicación, selección,
rechazo anticipado, continuidad tras fallo y tienda vacía. Se amplía el caso
Walmart sin stock. Build y suite Node deben aprobar antes de publicar.
