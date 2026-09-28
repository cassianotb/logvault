#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
env_file="${ARGUS_DR_ENV_FILE:-$repo_root/.env.dr-lab}"
project_name="logvault-dr-two-node-test"
keep="${ARGUS_DR_KEEP_TEST:-false}"

[[ -r "$env_file" ]] || { echo "Ambiente de teste ausente: $env_file" >&2; exit 2; }
compose=(docker compose --project-name "$project_name" --file "$repo_root/compose.dr-two-node.yaml" --env-file "$env_file")

cleanup() {
  if [[ "$keep" != "true" ]]; then "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

pg() { "${compose[@]}" exec -T "$1" psql -U argus -d argus -Atqc "$2"; }
ch() {
  "${compose[@]}" exec -T "$1" sh -c \
    'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database argus --format TSVRaw --query "$1"' sh "$2"
}
wait_value() {
  local expected="$1" attempts="$2"; shift 2
  local value=""
  for ((i=1; i<=attempts; i++)); do
    value="$("$@" 2>/dev/null || true)"
    [[ "$value" == "$expected" ]] && return 0
    sleep 1
  done
  printf 'Esperado %s, obtido %s\n' "$expected" "${value:-vazio}" >&2
  return 1
}

"${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
"${compose[@]}" up -d --wait

probe="two-node-$(date +%s)-$$"
pg postgres-a 'CREATE TABLE IF NOT EXISTS dr_two_node_probe (id text PRIMARY KEY, created_at timestamptz DEFAULT now())' >/dev/null
pg postgres-a "INSERT INTO dr_two_node_probe(id) VALUES ('$probe')" >/dev/null
wait_value 1 30 pg postgres-b "SELECT count(*) FROM dr_two_node_probe WHERE id='$probe'"
[[ "$(pg postgres-a 'SELECT count(*) FROM pg_stat_replication WHERE state='\''streaming'\''')" -eq 1 ]]

tenant='00000000-0000-4000-8000-000000000001'
ch clickhouse-a "INSERT INTO server_metrics (tenant_id,server_id,sampled_at,memory_total_bytes,memory_used_bytes) VALUES ('$tenant','$probe',now64(3),1024,512)"
wait_value 1 60 ch clickhouse-b "SELECT count() FROM server_metrics FINAL WHERE server_id='$probe'"
wait_value 0 30 ch clickhouse-b "SELECT countIf(source_max_ms > watermark_ms) FROM dr_mirror_state FINAL"

"${compose[@]}" stop clickhouse-mirror postgres-a clickhouse-a >/dev/null
"${compose[@]}" exec -T --user postgres postgres-b sh -c 'pg_ctl -D "$PGDATA" promote --wait --timeout 60'
wait_value f 30 pg postgres-b 'SELECT pg_is_in_recovery()'
pg postgres-b "INSERT INTO dr_two_node_probe(id) VALUES ('${probe}-promoted')" >/dev/null
ch clickhouse-b "INSERT INTO server_metrics (tenant_id,server_id,sampled_at,memory_total_bytes,memory_used_bytes) VALUES ('$tenant','${probe}-promoted',now64(3),1024,700)"
[[ "$(pg postgres-b "SELECT count(*) FROM dr_two_node_probe WHERE id='${probe}-promoted'")" -eq 1 ]]
[[ "$(ch clickhouse-b "SELECT count() FROM server_metrics FINAL WHERE server_id='${probe}-promoted'")" -eq 1 ]]

printf 'Ensaio aprovado: duas VMs, streaming PostgreSQL, espelhamento ClickHouse e promoção do B.\n'
