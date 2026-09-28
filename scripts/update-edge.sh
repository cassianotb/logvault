#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
cd "$repo_root"
test -f .env.edge || { echo ".env.edge não encontrado" >&2; exit 1; }

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git pull --ff-only
fi
docker compose --env-file .env.edge -f compose.edge.yaml up -d --build
docker compose --env-file .env.edge -f compose.edge.yaml ps
