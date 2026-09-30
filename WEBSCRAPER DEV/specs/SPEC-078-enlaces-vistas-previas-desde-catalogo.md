# SPEC-078 — Enlaces a las vistas previas desde el catálogo DEV

Estado: implementación local; build y Node 208/208 aprobados; publicación DEV pendiente.

## Objetivo

Hacer visibles las demos de login/países y usuarios/permisos desde la pantalla que abre el acceso directo actual de DEV.

## Alcance

- Agregar una franja de navegación debajo del estado del catálogo con enlaces a `/demo-acceso-pais.html` y `/admin-usuarios-demo.html`.
- Indicar de forma visible que son simulaciones: login no autentica y acciones de usuario no persisten.
- Mantener intactas las acciones existentes de consulta, scraper y carga de precios.
- Ajustar el diseño para pantallas estrechas.
- No montar autenticación real ni conectar API, cookies o PostgreSQL.

## Aceptación

1. El acceso directo al catálogo muestra ambos enlaces.
2. Cada enlace abre el archivo de demostración correspondiente.
3. El texto diferencia con claridad las demos de funciones operativas.
4. No cambia el comportamiento de los controles del catálogo.

## Prueba

`src/specs/dev-preview-links.test.ts` comprueba destinos, avisos y reglas CSS responsive.

Validación local: compilación TypeScript y suite Node 208/208. Ubuntu aún no
recibió estos cambios.
