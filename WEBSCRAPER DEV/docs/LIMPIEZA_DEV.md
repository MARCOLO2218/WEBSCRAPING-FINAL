# Limpieza DEV

Windows: repos ajenos archivados y verificados en backups/local-cleanup, trabajo
auxiliar conservado allí, cachés pytest retiradas. .gitignore excluye repos/work
venv/cachés. No borrar backup antes de revisar/recuperar ejercicios necesarios.
No mover ni borrar PROD, secretos, datos, entornos activos o evidencia DB.

Publicar solamente .gitignore, borrados DEV/repos y SPEC-092. No usar git add .
Los commits se mantienen: reducir checkout no borra blobs del historial.
Git puede compactar almacenamiento mediante git gc normal después de publicar;
no usar prune agresivo ni reescribir historial en esta limpieza.

Ubuntu: primero du -h --max-depth=1 sobre DEV y git status --short -- repos;
archivar repos antes de git pull si aún existe. La retirada rastreada por git
pull puede borrar proyectos, por lo que respaldo local obligatorio previamente.
Si repos tiene cambios, conservarlos con archivo y stash limitado a DEV/repos
por el usuario antes del pull. No aplicar stash de esos proyectos de nuevo en DEV.
Guardar respaldo de base /home/administradorgt/backups/webscraper fuera del repo.
Si contiene otros proyectos/bases, no borrar volúmenes Docker ni usar prune.
