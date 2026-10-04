# SPEC-092: Limpieza conservando trabajo

Estado: Limpieza Windows en curso; publicación y Ubuntu pendientes.

Archivar DEV/repos en backups/local-cleanup (ignorado); comprobar cada archivo
por tamaño y SHA256 antes de retirar el original. Retirar proyectos ajenos del
árbol versionado mediante publicación explícita del usuario. No reescribir
historial ni borrar cambios pendientes, datos, .env, entornos o respaldo de DB.
Excluir repos/work/venv/cachés de futuras incorporaciones. Dependencias y dist
se mantienen mientras hay desarrollo/servicios activos. No modificar PROD.

Limpieza Windows: repos comprimido 114 MB -> 25 MB en archivo ignorado
repos-cf214b203f75400fbcbf89d8a09de679.zip; 131 archivos rastreados pendientes
de retirar mediante commit del usuario. work archivado íntegro en subcarpeta
versionada local-cleanup; cachés pytest DEV/backend eliminadas (regenerables).
No se borran entornos, dependencias, logs operativos ni evidencias de migración.
