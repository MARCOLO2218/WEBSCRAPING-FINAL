#!/usr/bin/env bash
# Ejecutar con bash. No modifica checkout, .env, infraestructura ni base original.
set -eu
if [ "$#" -ne 4 ]; then
  printf '%s\n' 'Uso: bash regional-copy-trial-ubuntu.sh RUTA_DEV BACKUP HOST HASH_PLAN' >&2
  exit 2
fi
proyecto=$1
respaldo=$2
host_copia=$3
huella=$4
if [ "$(basename "$proyecto")" != 'WEBSCRAPER DEV' ]; then
  printf '%s\n' 'Ruta debe corresponder a WEBSCRAPER DEV.' >&2
  exit 2
fi
python="$proyecto/backend/.venv/bin/python"
paquete=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
test -x "$python"
test -r "$respaldo"
sudo -v
evidencia=$(mktemp -d /tmp/spec043-ensayo-XXXXXXXX)
cd "$paquete/backend"
printf 'Evidencia del ensayo: %s/informes\n' "$evidencia"
resultado=0
"$python" -m catalog_api.db.regional_copy_trial \
  --host "$host_copia" --backup "$respaldo" --expected-hash "$huella" \
  --output-dir "$evidencia/informes" --confirm-copy-trial || resultado=$?
if [ "$resultado" -ne 0 ] && [ -f "$evidencia/informes/error.json" ]; then
  cat "$evidencia/informes/error.json"
fi
exit "$resultado"
