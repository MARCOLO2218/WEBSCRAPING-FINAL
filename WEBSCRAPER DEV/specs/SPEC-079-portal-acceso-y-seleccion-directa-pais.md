# SPEC-079 — Portal de acceso y selección directa de país

Estado: implementación local; revisión visual y publicación DEV pendientes.

## Objetivo

Hacer que la entrada principal presente un acceso independiente y después un
selector de países. Guatemala no debe ser la portada ni se debe pasar por el
catálogo guatemalteco para llegar a otros países.

## Comportamiento

- `/` presenta el portal regional con login simulado y selección de país en la
  misma experiencia de entrada.
- El formulario sólo cambia de pantalla localmente; no transmite ni guarda los
  datos escritos y no autentica.
- El perfil demo `admin`/`superadmin` muestra todos los países; `usuario` muestra
  todas las tarjetas pero sólo permite entrar a Guatemala. Los demás se ven con
  acceso denegado. El perfil es una selección de presentación, no se deriva de
  una cuenta real.
- Guatemala abre `/catalogo-guatemala.html`, copia de la pantalla operativa
  existente para conservarla accesible mientras se prepara el enrutamiento real.
- Honduras y Nicaragua abren directamente sus vistas de evidencia piloto; El
  Salvador indica que está en preparación.
- `/demo-acceso-pais.html` queda como selector y evidencia piloto, sin formulario
  de login. Sus vistas HN/NC se pueden abrir mediante fragmento URL.
- Se mantienen rutas API y operaciones existentes. No se conecta auth, API,
  PostgreSQL ni scrapers nuevos.

## Límites

Este portal es una maqueta de experiencia. La autenticación y permisos reales,
la habilitación de HN/SV/NC y el enrutamiento regional operativo siguen
pendientes. `/catalogo-guatemala.html` es una copia estática y necesitará una
solución de ruta mantenible antes de adoptar este esquema como arquitectura
operativa.

## Pruebas

`src/specs/dev-preview-links.test.ts` verifica que la portada sea el portal, que
el login no transmita credenciales y que cada país tenga destino propio.
`src/specs/demo-acceso-pais.test.ts` protege la separación del login y apertura
directa de las vistas piloto.
