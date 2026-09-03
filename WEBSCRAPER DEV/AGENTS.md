# Instrucciones permanentes de WEBSCRAPER DEV

## Alcance

- Trabajar solamente dentro de `C:\Users\USER\source\repos\scraper 6\WEBSCRAPER DEV`.
- No modificar `WEBSCRAPER PROD` sin una solicitud expresa del usuario.
- No copiar `.env` entre DEV y PROD.
- Preservar cambios existentes del usuario y no restaurar respaldos eliminados.

## Inicio de cada tarea

1. Leer completamente `docs/PRODUCT_VISION.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/MIGRATION_PLAN.md` y `docs/WORKFLOW_AND_HANDOFF.md`.
2. Revisar `specs/README.md`, `src/specs/` y el estado de Git.
3. Continuar desde el primer pendiente aplicable del plan; no reiniciar el proyecto desde cero.

## Specs y documentacion viva

- Todo cambio funcional, correccion o refactorizacion debe tener una spec escrita y, cuando sea viable, una prueba automatizada.
- Las specs completadas nunca se borran: se marcan `Completada` y se conservan como historial.
- Actualizar la vision, arquitectura, plan y decisiones cuando el cambio afecte su contenido.
- Un refactor no debe cambiar resultados observables sin que una spec lo autorice.

## Validacion

- Ejecutar `npm test` antes de entregar cambios.
- Mantener compatibles `npm run build`, `npm test`, `npm start` y `npm run catalog` durante la migracion.
- FastAPI se introducira gradualmente; los scrapers TypeScript/Playwright se conservaran inicialmente como workers.

## Git y despliegues

- El usuario ejecuta `git add`, `git commit`, `git push`, `git pull` y comandos de Ubuntu/PM2.
- Entregar comandos exactos y separados para Windows PowerShell y Ubuntu DEV.
- No usar `git add .`; agregar solamente los archivos del task para no mezclar cambios ajenos.
- No promover a PROD hasta que el usuario lo solicite despues de validar DEV.
