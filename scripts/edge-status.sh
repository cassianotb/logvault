#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
cd "$repo_root"
test -f .env.edge || { echo ".env.edge não encontrado" >&2; exit 1; }

docker compose --env-file .env.edge -f compose.edge.yaml ps
docker compose --env-file .env.edge -f compose.edge.yaml exec -T collector node --input-type=module -e '
  import Database from "better-sqlite3";
  const db = new Database(process.env.ARGUS_SPOOL_PATH, { readonly: true });
  const rows = db.prepare(`SELECT state, count(*) AS records,
    COALESCE(sum(json_array_length(events_json)), 0) AS events
    FROM raw_spool GROUP BY state ORDER BY state`).all();
  const integrity = db.pragma("quick_check", { simple: true });
  console.log(JSON.stringify({ integrity, spool: rows }, null, 2));
  db.close();
'
