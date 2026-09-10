# SPEC-037 — Una base, catálogo regional extensible

Requisito: publicar y registrar SPEC-036 siguiendo BASELINE_DEV.md primero.
Esta entrega crea catalogo.paises y cuatro filas: GT/GTQ, HN/HNL, SV/USD, NC/NIO.
Sólo GT habilitado, como el catálogo actual. CR podrá agregarse sin alterar el
tipo de columna. No crea otras bases ni cambia productos o IDs existentes.
No asigna el historial a Guatemala sin verificar origen. No hay cambio visual.

## Windows PowerShell

Desde la raíz del repositorio, después de publicar SPEC-036:

```powershell
git add -- "WEBSCRAPER DEV/backend/catalog_api/db/countries.py" "WEBSCRAPER DEV/backend/catalog_api/db/country_models.py" "WEBSCRAPER DEV/backend/migrations/env.py" "WEBSCRAPER DEV/backend/migrations/versions/037_countries.py" "WEBSCRAPER DEV/backend/tests/test_countries_migration.py" "WEBSCRAPER DEV/scripts/countries-dev.mjs" "WEBSCRAPER DEV/specs/SPEC-037-tabla-paises.md" "WEBSCRAPER DEV/docs/PAISES_DB_DEV.md"
git diff --cached --check
git diff --cached --stat
git commit -m "Agrega catalogo de paises a la misma base DEV"
git push origin main
```

## Ubuntu

```bash
cd "$HOME/WEBSCRAPING-FINAL"
git pull --ff-only origin main
cd "WEBSCRAPER DEV"
node scripts/countries-dev.mjs
```

Si pull muestra conflicto, detenerse sin descartar cambios locales.
Si muestra listo_para_crear_paises:

```bash
node scripts/countries-dev.mjs --apply
```

Esperado aplicado, revision 037_countries. Repetir devuelve ya_aplicado sin
duplicar semillas. No usar baseline --apply después de esta migración: ese
comando sólo reconoce el estado inicial. No reiniciar PM2 ni instalar dependencias.
Con error, compartir salida. No usar stamp para saltar el requisito de SPEC-036.

## Validación y siguiente etapa

Migración probada con Alembic/SQLite; aplicación PostgreSQL real pendiente.
Se comprobó preservación de una tabla existente, unicidad y expansión CR.
Sigue verificar origen del historial y adaptar escrituras, publicaciones y
consultas para país; después usuarios y autorización. La tabla sola no aísla
datos ni habilita acceso regional. Índices de productos dependerán de esas consultas.
