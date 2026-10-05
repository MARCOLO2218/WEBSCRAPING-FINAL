# SPEC-088: Publicación visual Facenco en DEV

Estado: Preparada localmente; publicación Ubuntu pendiente.

Publicar vista-acceso-facenco.html, theme, imágenes y portal-access.js como
vista visual independiente; no reemplazar index.html antes de integrar auth.
La vista informa servicio no disponible al no existir /auth/me o /auth/login.
Publicar también responsive de catalogo-nicaragua.html; botones existentes NC
permanecen operativos. No publicar guardia/auth/migraciones con este lote.
GT, PostgreSQL y PROD sin cambios. El portal principal sigue en su estado publicado.

Validación estática: todos los assets referenciados existen; HTML NC conserva
IDs de los controles. Revisión visual Ubuntu pendiente por el usuario.

Actualización 2026-10-05: por solicitud del usuario, el enlace NC se rotula
«Ingresar a Nicaragua» en portal-facenco.html, index.html y la vista visual.
Conserva /catalogo-nicaragua.html y la habilitación por permisos del servidor.
Cambio de texto preparado localmente; publicación Ubuntu pendiente.
