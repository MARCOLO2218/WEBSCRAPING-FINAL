-- Limpia de la base productos que entraron por error y no son de cama.
-- Ejecutar en la base DEV o PROD que corresponda.

DELETE FROM catalogo.productos_catalogo
WHERE
  lower(producto) LIKE '%samsung%' OR
  lower(producto) LIKE '%galaxy%' OR
  lower(producto) LIKE '%maybelline%' OR
  lower(producto) LIKE '%face studio%' OR
  lower(producto) LIKE '%sun kisser%' OR
  lower(producto) LIKE '%rubor%' OR
  lower(producto) LIKE '%paw patrol%' OR
  lower(producto) LIKE '%figura de accion%' OR
  lower(producto) LIKE '%figura de acciÃ³n%' OR
  lower(producto) LIKE '%helicoptero%' OR
  lower(producto) LIKE '%helicÃ³ptero%' OR
  lower(producto) LIKE '%juguete%' OR
  lower(producto) LIKE '%laptop%' OR
  lower(producto) LIKE '%celular%' OR
  lower(producto) LIKE '%telefono%' OR
  lower(producto) LIKE '%telÃ©fono%' OR
  lower(producto) LIKE '%televisor%';
