#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
network="argus-dr-rehearsal_replication"
action="${1:-}"
target="${2:-}"
incident="${3:-}"

[[ "$target" == "dc-b" ]] || { echo "Destino inválido: $target" >&2; exit 2; }
[[ "$incident" =~ ^[A-Za-z0-9._-]{3,80}$ ]] || { echo "Incidente inválido" >&2; exit 2; }

active_api="$(docker compose --project-name argus --file "$repo_root/compose.yaml" ps -q api)"
web_b="$(docker compose --project-name argus-dr-rehearsal \
  --file "$repo_root/compose.dr-lab.yaml" --file "$repo_root/compose.dr-rehearsal.yaml" \
  --env-file "$repo_root/.env.dr-lab" --profile replication --profile application --profile monitoring ps -q web-b)"
[[ -n "$active_api" && -n "$web_b" ]] || { echo "API ativa ou Web B não encontrado" >&2; exit 1; }

case "$action" in
  activate)
    docker network disconnect "$network" "$active_api" >/dev/null 2>&1 || true
    docker network disconnect "$network" "$web_b" >/dev/null 2>&1 || true
    docker network connect --alias logvault.lab.test --alias ingest.lab.test "$network" "$web_b"
    ;;
  *) echo "Ação DNS de laboratório inválida: $action" >&2; exit 2 ;;
esac

gateway="$(docker compose --project-name argus-dr-rehearsal \
  --file "$repo_root/compose.dr-lab.yaml" --file "$repo_root/compose.dr-rehearsal.yaml" \
  --env-file "$repo_root/.env.dr-lab" --profile replication --profile application --profile monitoring ps -q dc-b-gateway)"
docker exec "$gateway" node -e \
  "fetch('http://logvault.lab.test/api/health/ready').then(r=>{if(!r.ok)process.exit(1);console.log('Rota logvault.lab.test transferida ao DC-B')}).catch(()=>process.exit(1))"
