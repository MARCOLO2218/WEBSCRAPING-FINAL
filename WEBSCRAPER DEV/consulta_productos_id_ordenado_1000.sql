SELECT *
FROM (
    SELECT
        id,
        run_id,
        semana_run,
        semana_inicio,
        sitio_fuente,
        marca,
        linea,
        categoria,
        producto,
        disponibilidad,
        precio_regular,
        precio_oferta,
        descuento,
        cuotas,
        url_producto,
        url_fuente,
        titulo,
        descripcion,
        garantia,
        beneficios,
        url_imagen,
        texto_imagen,
        fecha_scraping,
        creado_en,
        registro_uuid,
        run_uuid
    FROM catalogo.productos_catalogo
    ORDER BY id DESC
    LIMIT 1000
) ultimos_registros
ORDER BY id ASC;
