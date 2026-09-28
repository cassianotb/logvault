#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
cd "$repo_root"
test -f .env.edge || { echo ".env.edge não encontrado" >&2; exit 1; }

if [ "${1:-}" = "--purge-data" ]; then
  if [ "${ARGUS_CONFIRM_PURGE:-}" != "PURGE-EDGE-DATA" ]; then
    echo "Para apagar o spool use ARGUS_CONFIRM_PURGE=PURGE-EDGE-DATA $0 --purge-data" >&2
    exit 2
  fi
  docker compose --env-file .env.edge -f compose.edge.yaml down --volumes
  echo "Coletor e volume argus-edge-data removidos definitivamente"
else
  docker compose --env-file .env.edge -f compose.edge.yaml down
  echo "Coletor removido; o volume argus-edge-data foi preservado"
fi
