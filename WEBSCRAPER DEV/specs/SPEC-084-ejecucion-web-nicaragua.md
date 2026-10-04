# SPEC-084: Ejecución desde la vista Nicaragua

Estado: Implementada localmente; publicación y revisión visual Ubuntu pendientes.

La vista DEV permite ejecutar las cinco tiendas o una selección explícita.
Una cola NC independiente serializa trabajos y permite consultar su progreso.
Las tiendas exitosas reemplazan sus resultados; las fallidas o no seleccionadas
conservan su última consulta con fecha por tienda. No utiliza PostgreSQL.
GT, autenticación y PROD quedan fuera del alcance.

Criterios: rechazar selecciones inválidas, mostrar ejecución y resultado por
tienda, conservar datos anteriores ante errores y permitir recargar la vista.

Incluye orden por nombre/precio y CSV de los resultados filtrados. Los precios
ausentes quedan al final y no se convierten en cero.

Validación: TypeScript y 226/226 pruebas Node aprobadas. Pruebas nuevas en
`src/specs/nc-web-jobs.test.ts`: selección inválida, aislamiento de tiendas,
rechazo de origen ajeno y conservación/reemplazo de snapshots.

La cola es local y en memoria; un reinicio pierde el seguimiento de trabajos.
La pantalla DEV todavía no ofrece autenticación real. La cobertura de fuentes
es la de SPEC-082, no una garantía de recorrer todo el sitio de cada comercio.
