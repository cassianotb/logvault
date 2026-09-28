#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
project_name="argus-dr-rehearsal"
env_file="${ARGUS_DR_ENV_FILE:-$repo_root/.env.dr-lab}"

usage() {
  cat <<'EOF'
Uso: scripts/dr-rehearsal.sh COMANDO

Comandos:
  config            valida os manifests
  start-source      inicia PostgreSQL A restaurado, Keeper e ClickHouse A/B
  start-standby     cria/atualiza a role e inicia PostgreSQL B
  validate-postgres valida recovery, streaming, contagens e um probe A -> B
  migrate-clickhouse migra a cópia restaurada e sincroniza o ClickHouse B
  monitor-start     conecta a API ativa ao gateway da cópia real ensaiada
  monitor-validate  valida os endpoints privados a partir da API ativa
  start-api-b       inicia a API B sem publicar portas (somente após promoção)
  status            mostra todos os serviços do ensaio
  stop              para o ensaio e preserva volumes
  cleanup           remove somente volumes/redes próprios; preserva restore-test

Pré-requisitos:
  1. scripts/restore-test.sh ID_DO_BACKUP
  2. .env.dr-lab com credenciais exclusivas

A migração e o cutover ClickHouse permanecem deliberadamente manuais porque
exigem comparação dos dados e confirmação da janela.
EOF
}

if [ ! -r "$env_file" ]; then
  echo "Arquivo de ambiente não encontrado: $env_file" >&2
  exit 2
fi

dr_compose() {
  docker compose \
    --project-name "$project_name" \
    --file "$repo_root/compose.dr-lab.yaml" \
    --file "$repo_root/compose.dr-rehearsal.yaml" \
    --env-file "$env_file" \
    --profile replication \
    --profile application \
    --profile monitoring \
    "$@"
}

active_api_container() {
  docker compose --project-name argus --file "$repo_root/compose.yaml" ps -q api
}

disconnect_active_api() {
  api_container="$(active_api_container 2>/dev/null || true)"
  if [ -n "$api_container" ]; then
    docker network disconnect "${project_name}_replication" "$api_container" >/dev/null 2>&1 || true
  fi
}

start_monitor() {
  registration="$repo_root/artifacts/dc-b-simulation/registration.env"
  test -r "$registration" || { echo "Pacote de cadastro do DC-B não encontrado" >&2; exit 1; }
  pg_password="$(sed -n 's|^ARGUS_DR_POSTGRES_STANDBY_URL=postgresql://argus_monitor:\([^@]*\)@.*|\1|p' "$registration")"
  ch_password="$(sed -n 's/^ARGUS_DR_CLICKHOUSE_STANDBY_PASSWORD=//p' "$registration")"
  test -n "$pg_password" && test -n "$ch_password"

  dr_compose exec -T postgres-a psql -U argus -d argus --set ON_ERROR_STOP=1 \
    --set "monitor_password=$pg_password" <<'SQL' >/dev/null
SELECT format(
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'argus_monitor')
    THEN 'ALTER ROLE argus_monitor WITH LOGIN PASSWORD %L'
    ELSE 'CREATE ROLE argus_monitor WITH LOGIN PASSWORD %L'
  END,
  :'monitor_password'
)
\gexec
GRANT pg_monitor TO argus_monitor;
GRANT CONNECT ON DATABASE argus TO argus_monitor;
SQL
  dr_compose exec -T postgres-b psql -U argus -d argus -Atqc 'SELECT pg_reload_conf()' >/dev/null
  dr_compose exec -T -e MONITOR_PASSWORD="$ch_password" clickhouse-b sh -c '
    clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --multiquery --query "
      CREATE USER IF NOT EXISTS argus_monitor IDENTIFIED WITH sha256_password BY '\''$MONITOR_PASSWORD'\'';
      ALTER USER argus_monitor IDENTIFIED WITH sha256_password BY '\''$MONITOR_PASSWORD'\'';
      GRANT SELECT ON system.replicas TO argus_monitor;
      GRANT SELECT ON argus.* TO argus_monitor;
    "
  ' >/dev/null
  dr_compose up -d --wait dc-b-gateway
  api_container="$(active_api_container)"
  test -n "$api_container"
  docker network disconnect argus-dr-lab_replication "$api_container" >/dev/null 2>&1 || true
  if ! docker inspect --format '{{json .NetworkSettings.Networks}}' "$api_container" | grep -q "${project_name}_replication"; then
    docker network connect --alias logvault.lab.test --alias ingest.lab.test \
      "${project_name}_replication" "$api_container"
  fi
  echo "API ativa conectada ao gateway da cópia real ensaiada"
}

validate_monitor() {
  api_container="$(active_api_container)"
  docker exec "$api_container" node -e \
    "fetch('http://dc-b-gateway:8080/health/ready').then(async r=>{const b=await r.json();if(!r.ok||b.mode!=='dc-b-simulation')process.exit(1)}).catch(()=>process.exit(1))"
  echo "Gateway privado da cópia real acessível pela API ativa"
}

postgres_value() {
  service="$1"
  query="$2"
  dr_compose exec -T "$service" psql -U argus -d argus -Atqc "$query"
}

clickhouse_value() {
  service="$1"
  query="$2"
  dr_compose exec -T "$service" sh -c \
    'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database argus --format TSVRaw --query "$1"' \
    sh "$query"
}

validate_postgres() {
  test "$(postgres_value postgres-a 'SELECT pg_is_in_recovery()')" = f
  test "$(postgres_value postgres-b 'SELECT pg_is_in_recovery()')" = t
  test "$(postgres_value postgres-a "SELECT count(*) FROM pg_stat_replication WHERE state = 'streaming'")" -eq 1
  counts_a="$(postgres_value postgres-a "SELECT concat_ws('|',(SELECT count(*) FROM tenants),(SELECT count(*) FROM users),(SELECT count(*) FROM collectors),(SELECT count(*) FROM devices))")"
  counts_b="$(postgres_value postgres-b "SELECT concat_ws('|',(SELECT count(*) FROM tenants),(SELECT count(*) FROM users),(SELECT count(*) FROM collectors),(SELECT count(*) FROM devices))")"
  test "$counts_a" = "$counts_b"
  probe_id="pg-copy-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  postgres_value postgres-a 'CREATE TABLE IF NOT EXISTS dr_replication_probe (probe_id text PRIMARY KEY, source text NOT NULL, inserted_at timestamptz NOT NULL DEFAULT now())' >/dev/null
  postgres_value postgres-a "INSERT INTO dr_replication_probe (probe_id, source) VALUES ('$probe_id', 'restored-copy')" >/dev/null
  attempt=0
  while [ "$attempt" -lt 20 ]; do
    [ "$(postgres_value postgres-b "SELECT count(*) FROM dr_replication_probe WHERE probe_id='$probe_id'")" -eq 1 ] && break
    attempt=$((attempt + 1)); sleep 1
  done
  test "$attempt" -lt 20
  echo "PostgreSQL restaurado: streaming aprovado, contagens A/B=$counts_a"
}

migrate_clickhouse() {
  if [ "${ARGUS_DR_CONFIRM_CLICKHOUSE_MIGRATION:-}" != "MIGRATE-RESTORED-COPY" ]; then
    echo "Use ARGUS_DR_CONFIRM_CLICKHOUSE_MIGRATION=MIGRATE-RESTORED-COPY" >&2
    exit 2
  fi
  existing="$(clickhouse_value clickhouse-a "SELECT count() FROM system.tables WHERE database='argus' AND (name LIKE '%_dr' OR name LIKE '%_local_backup')")"
  test "$existing" -eq 0 || {
    echo "Tabelas de migração já existem; operação interrompida para inspeção" >&2
    exit 1
  }
  dr_compose exec -T clickhouse-a sh -c \
    'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --multiquery' \
    <"$repo_root/infra/dr/clickhouse/002_rehearsal_migration.sql"

  for table in ingest_raw cgnat_events server_metrics; do
    partitions="$(clickhouse_value clickhouse-a "SELECT DISTINCT partition FROM system.parts WHERE active AND database='argus' AND table='$table' ORDER BY partition")"
    for partition in $partitions; do
      echo "Anexando $table partição $partition"
      clickhouse_value clickhouse-a "ALTER TABLE argus.${table}_dr ATTACH PARTITION ID '$partition' FROM argus.$table" >/dev/null
    done
  done

  for table in ingest_raw cgnat_events server_metrics; do
    clickhouse_value clickhouse-b "SYSTEM SYNC REPLICA argus.$table" >/dev/null
  done

  raw_a="$(clickhouse_value clickhouse-a "SELECT concat(toString(count()),'|',toString(sum(cityHash64(raw_id,raw_sha256)))) FROM ingest_raw_dr FINAL")"
  raw_b="$(clickhouse_value clickhouse-b "SELECT concat(toString(count()),'|',toString(sum(cityHash64(raw_id,raw_sha256)))) FROM ingest_raw FINAL")"
  events_a="$(clickhouse_value clickhouse-a "SELECT concat(toString(count()),'|',toString(sum(cityHash64(event_id,raw_id)))) FROM cgnat_events_dr FINAL")"
  events_b="$(clickhouse_value clickhouse-b "SELECT concat(toString(count()),'|',toString(sum(cityHash64(event_id,raw_id)))) FROM cgnat_events FINAL")"
  test "$raw_a" = "$raw_b"
  test "$events_a" = "$events_b"

  clickhouse_value clickhouse-a "RENAME TABLE
    argus.ingest_raw TO argus.ingest_raw_local_backup,
    argus.ingest_raw_dr TO argus.ingest_raw,
    argus.cgnat_events TO argus.cgnat_events_local_backup,
    argus.cgnat_events_dr TO argus.cgnat_events,
    argus.server_metrics TO argus.server_metrics_local_backup,
    argus.server_metrics_dr TO argus.server_metrics" >/dev/null

  clickhouse_value clickhouse-a "SYSTEM SYNC REPLICA argus.ingest_raw" >/dev/null
  clickhouse_value clickhouse-a "SYSTEM SYNC REPLICA argus.cgnat_events" >/dev/null
  clickhouse_value clickhouse-a "SYSTEM SYNC REPLICA argus.server_metrics" >/dev/null
  echo "ClickHouse restaurado: migração e fingerprints A/B aprovados (raw=$raw_a; eventos=$events_a)"
}

case "${1:-}" in
  config)
    dr_compose config --quiet
    echo "Manifestos do ensaio real válidos"
    ;;
  start-source)
    docker volume inspect argus-restore-test-postgres-data argus-restore-test-clickhouse-data >/dev/null
    dr_compose up -d --wait postgres-a clickhouse-a clickhouse-b
    ;;
  start-standby)
    dr_compose exec -T postgres-a /dr-replication-init/050_replication_role.sh
    dr_compose up -d --wait postgres-b
    ;;
  validate-postgres)
    validate_postgres
    ;;
  migrate-clickhouse)
    migrate_clickhouse
    ;;
  monitor-start)
    start_monitor
    ;;
  monitor-validate)
    validate_monitor
    ;;
  start-api-b)
    if [ "$(dr_compose exec -T postgres-b psql -U argus -d argus -Atqc 'SELECT pg_is_in_recovery()')" != f ]; then
      echo "PostgreSQL B ainda não foi promovido; a API B não será iniciada" >&2
      exit 1
    fi
    dr_compose up -d --no-deps api-b
    ;;
  status)
    dr_compose ps
    ;;
  stop)
    disconnect_active_api
    dr_compose stop
    ;;
  cleanup)
    if [ "${ARGUS_DR_CONFIRM_CLEANUP:-}" != "REMOVE-ARGUS-DR-REHEARSAL" ]; then
      echo "Use ARGUS_DR_CONFIRM_CLEANUP=REMOVE-ARGUS-DR-REHEARSAL" >&2
      exit 2
    fi
    disconnect_active_api
    dr_compose down --volumes --remove-orphans
    echo "Recursos próprios do ensaio removidos; volumes restore-test preservados"
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
