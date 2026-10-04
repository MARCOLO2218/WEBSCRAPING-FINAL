# SPEC-083 — Vista de catálogo Nicaragua DEV

Estado: preparada localmente; publicación y validación Ubuntu pendientes.

## Alcance

Vista `catalogo-nicaragua.html` alimentada exclusivamente por resultados reales
NC/NIO del ejecutor. El portal enlaza directamente a ella. No conecta PostgreSQL,
auth regional ni acciones de scraping desde el navegador.

## Contrato

- `scrape:nc -- --publish-preview --summary` publica explícitamente un JSON en
  `public/nicaragua-catalogo.json` sólo tras éxito de las cinco tiendas.
- Reemplazo mediante archivo temporal y rename; fallo/vacío/selección parcial
  conserva la versión anterior. JSON y temporales se excluyen de Git.
- La ejecución normal continúa sin archivos. La publicación es un snapshot DEV,
  no persistencia comercial ni autorización para modificar PostgreSQL.
- Vista: fecha de consulta, filtros de tienda/búsqueda/sólo precio, fotos,
  importes NIO habitual/oferta y enlaces oficiales. Precio ausente e imagen
  ausente se muestran explícitamente. Actualizar vista relee el snapshot; no
  ejecuta scrapers. Sin snapshot, error legible y lista vacía.
- Explica cobertura verificada de categoría Curacao y acotada de otras tiendas.
- Siman conserva sólo porcentaje en discount; Maxi Palí descarta el icono
  `icon_sf.png` como foto y no inventa una imagen alternativa.
- Datos externos se insertan mediante textContent, nunca innerHTML.

## Validación

Build y 224/224 pruebas Node locales aprobadas. Publicar el código, ejecutar
`scrape:nc -- --publish-preview --summary` en Ubuntu y abrir la vista en DEV.
La interfaz operativa por tienda, exportación y persistencia siguen pendientes.
