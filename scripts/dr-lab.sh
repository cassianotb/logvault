#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
compose_file="$repo_root/compose.dr-lab.yaml"
project_name="argus-dr-lab"
env_file="${ARGUS_DR_ENV_FILE:-$repo_root/.env.dr-lab}"

usage() {
  cat <<'EOF'
Uso: scripts/dr-lab.sh COMANDO

Comandos:
  init                 cria .env.dr-lab com segredos aleatórios (uma única vez)
  config               valida o manifesto sem iniciar containers
  start                inicia PostgreSQL, ClickHouse e Keeper isolados
  status               mostra o estado do laboratório
  validate             testa replicação PostgreSQL e ClickHouse
  monitor-start        inicia o gateway B e conecta a API ativa à rede isolada
  monitor-validate     valida a conectividade da API ativa com o gateway B
  enroll               cadastra automaticamente o DC-B simulado no LogVault
  exercise-postgres    para o primário A e promove o standby B
  exercise-clickhouse  interrompe o nó A e valida escrita/catch-up pelo nó B
  stop                 para os containers e preserva os volumes
  logs                 mostra os logs recentes
  cleanup              remove containers e volumes, com confirmação explícita

Antes de usar, copie .env.dr-lab.example para .env.dr-lab e altere as senhas.
EOF
}

init_env() {
  if [ -e "$env_file" ]; then
    echo "Arquivo já existe e não será sobrescrito: $env_file" >&2
    exit 2
  fi
  command -v openssl >/dev/null 2>&1 || {
    echo "openssl é necessário para gerar as credenciais do laboratório" >&2
    exit 2
  }
  old_umask="$(umask)"
  umask 077
  temp_file="${env_file}.tmp.$$"
  trap 'rm -f "$temp_file"' EXIT HUP INT TERM
  {
    echo '# Credenciais geradas automaticamente para o laboratório isolado.'
    printf 'ARGUS_DR_POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'ARGUS_DR_POSTGRES_REPLICATION_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'ARGUS_DR_CLICKHOUSE_PASSWORD=%s\n' "$(openssl rand -hex 24)"
  } >"$temp_file"
  chmod 0600 "$temp_file"
  mv "$temp_file" "$env_file"
  trap - EXIT HUP INT TERM
  umask "$old_umask"
  echo "Credenciais exclusivas criadas em $env_file (modo 0600)"
}

require_env() {
  if [ ! -r "$env_file" ]; then
    echo "Arquivo de ambiente não encontrado: $env_file" >&2
    echo "Copie .env.dr-lab.example para .env.dr-lab e altere as senhas." >&2
    exit 2
  fi
}

dr_compose() {
  docker compose \
    --project-name "$project_name" \
    --file "$compose_file" \
    --env-file "$env_file" \
    --profile replication \
    "$@"
}

dr_monitor_compose() {
  docker compose \
    --project-name "$project_name" \
    --file "$compose_file" \
    --env-file "$env_file" \
    --profile replication \
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

start_monitor_gateway() {
  dr_monitor_compose up -d --wait dc-b-gateway
  api_container="$(active_api_container)"
  test -n "$api_container" || {
    echo "Container da API ativa não encontrado" >&2
    exit 1
  }
  if ! docker inspect --format '{{json .NetworkSettings.Networks}}' "$api_container" | grep -q "${project_name}_replication"; then
    docker network connect "${project_name}_replication" "$api_container"
  fi
  echo "Gateway B iniciado e API ativa conectada somente à rede de replicação do laboratório"
}

validate_monitor_gateway() {
  api_container="$(active_api_container)"
  test -n "$api_container"
  docker exec "$api_container" node -e \
    "fetch('http://dc-b-gateway:8080/health/ready').then(async r => { if (!r.ok) process.exit(1); const body = await r.json(); if (body.mode !== 'dc-b-simulation') process.exit(1); }).catch(() => process.exit(1))"
  echo "API ativa alcança o gateway privado do DC-B simulado"
}

postgres_value() {
  service="$1"
  query="$2"
  dr_compose exec -T "$service" psql \
    --username argus --dbname argus --tuples-only --no-align --command "$query"
}

clickhouse_value() {
  service="$1"
  query="$2"
  dr_compose exec -T "$service" sh -c \
    'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database argus --format TSVRaw --query "$1"' \
    sh "$query"
}

wait_for_value() {
  description="$1"
  expected="$2"
  attempts="$3"
  shift 3
  attempt=1
  while [ "$attempt" -le "$attempts" ]; do
    value="$("$@" 2>/dev/null || true)"
    if [ "$value" = "$expected" ]; then
      return 0
    fi
    sleep 1
    attempt=$((attempt + 1))
  done
  echo "Tempo esgotado aguardando $description; esperado=$expected obtido=${value:-vazio}" >&2
  return 1
}

validate_postgres() {
  echo "Validando PostgreSQL"
  primary_recovery="$(postgres_value postgres-a 'SELECT pg_is_in_recovery();')"
  standby_recovery="$(postgres_value postgres-b 'SELECT pg_is_in_recovery();')"
  streaming_replicas="$(postgres_value postgres-a "SELECT count(*) FROM pg_stat_replication WHERE application_name = 'walreceiver' AND state = 'streaming';")"

  test "$primary_recovery" = f
  test "$standby_recovery" = t
  test "$streaming_replicas" -eq 1

  probe_id="pg-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  postgres_value postgres-a '
    CREATE TABLE IF NOT EXISTS dr_replication_probe
    (
      probe_id text PRIMARY KEY,
      source text NOT NULL,
      inserted_at timestamptz NOT NULL DEFAULT now()
    );
  ' >/dev/null
  dr_compose exec -T postgres-a psql --username argus --dbname argus \
    --command "INSERT INTO dr_replication_probe (probe_id, source) VALUES ('$probe_id', 'dca');" >/dev/null

  wait_for_value "probe PostgreSQL no DC-B" 1 20 \
    postgres_value postgres-b "SELECT count(*) FROM dr_replication_probe WHERE probe_id = '$probe_id';"

  lag_bytes="$(postgres_value postgres-a "SELECT COALESCE(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn), 0)::bigint FROM pg_stat_replication WHERE application_name = 'walreceiver';")"
  echo "PostgreSQL: OK (primário=A, standby=B, streaming=1, atraso=${lag_bytes:-0} bytes)"
}

validate_clickhouse() {
  echo "Validando ClickHouse"
  replicas_a="$(clickhouse_value clickhouse-a "SELECT count() FROM system.replicas WHERE database = 'argus'")"
  replicas_b="$(clickhouse_value clickhouse-b "SELECT count() FROM system.replicas WHERE database = 'argus'")"
  readonly_a="$(clickhouse_value clickhouse-a "SELECT count() FROM system.replicas WHERE database = 'argus' AND is_readonly")"
  readonly_b="$(clickhouse_value clickhouse-b "SELECT count() FROM system.replicas WHERE database = 'argus' AND is_readonly")"

  test "$replicas_a" -eq 4
  test "$replicas_b" -eq 4
  test "$readonly_a" -eq 0
  test "$readonly_b" -eq 0

  probe_id="ch-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  clickhouse_value clickhouse-a "INSERT INTO dr_replication_probe (probe_id, source) VALUES ('$probe_id', 'dca')" >/dev/null
  clickhouse_value clickhouse-b "SYSTEM SYNC REPLICA argus.dr_replication_probe" >/dev/null
  wait_for_value "probe ClickHouse no DC-B" 1 20 \
    clickhouse_value clickhouse-b "SELECT count() FROM dr_replication_probe WHERE probe_id = '$probe_id'"

  queue_a="$(clickhouse_value clickhouse-a "SELECT sum(queue_size) FROM system.replicas WHERE database = 'argus'")"
  queue_b="$(clickhouse_value clickhouse-b "SELECT sum(queue_size) FROM system.replicas WHERE database = 'argus'")"
  echo "ClickHouse: OK (4 tabelas replicadas por nó, somente-leitura=0, filas A=$queue_a/B=$queue_b)"
}

validate_all() {
  validate_postgres
  validate_clickhouse
  echo "Laboratório: replicações validadas com sucesso"
}

exercise_clickhouse() {
  validate_clickhouse
  probe_id="ch-failover-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  echo "Interrompendo somente o ClickHouse A"
  dr_compose stop clickhouse-a
  clickhouse_value clickhouse-b "INSERT INTO dr_replication_probe (probe_id, source) VALUES ('$probe_id', 'dcb')" >/dev/null
  test "$(clickhouse_value clickhouse-b "SELECT count() FROM dr_replication_probe WHERE probe_id = '$probe_id'")" -eq 1

  echo "Reiniciando o ClickHouse A e aguardando catch-up"
  dr_compose up -d --wait clickhouse-a
  clickhouse_value clickhouse-a "SYSTEM SYNC REPLICA argus.dr_replication_probe" >/dev/null
  wait_for_value "catch-up ClickHouse no DC-A" 1 30 \
    clickhouse_value clickhouse-a "SELECT count() FROM dr_replication_probe WHERE probe_id = '$probe_id'"
  echo "ClickHouse: exercício de indisponibilidade e recuperação aprovado"
}

exercise_postgres() {
  if [ "${ARGUS_DR_CONFIRM_PROMOTION:-}" != "PROMOTE-POSTGRES-B" ]; then
    echo "A promoção exige ARGUS_DR_CONFIRM_PROMOTION=PROMOTE-POSTGRES-B" >&2
    exit 2
  fi

  validate_postgres
  echo "Interrompendo somente o PostgreSQL A"
  started_at="$(date +%s)"
  dr_compose stop postgres-a
  dr_compose exec -T postgres-b sh -c \
    'exec gosu postgres pg_ctl --pgdata "$PGDATA" promote --wait --timeout 30'

  test "$(postgres_value postgres-b 'SELECT pg_is_in_recovery();')" = f
  probe_id="pg-failover-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  postgres_value postgres-b \
    "INSERT INTO dr_replication_probe (probe_id, source) VALUES ('$probe_id', 'dcb');" >/dev/null
  test "$(postgres_value postgres-b "SELECT count(*) FROM dr_replication_probe WHERE probe_id = '$probe_id';")" -eq 1
  finished_at="$(date +%s)"

  echo "PostgreSQL: promoção do DC-B e escrita aprovadas em $((finished_at - started_at))s"
  echo "O laboratório agora está promovido em B. Recrie os volumes antes de repetir o cenário A->B."
}

command="${1:-}"
case "$command" in
  init)
    init_env
    ;;
  config)
    require_env
    dr_compose config --quiet
    echo "Manifesto do laboratório válido"
    ;;
  start)
    require_env
    dr_compose up -d --wait
    echo "Laboratório iniciado sem portas publicadas no host"
    ;;
  status)
    require_env
    dr_compose ps
    ;;
  validate)
    require_env
    validate_all
    ;;
  monitor-start)
    require_env
    start_monitor_gateway
    ;;
  monitor-validate)
    require_env
    validate_monitor_gateway
    ;;
  enroll)
    require_env
    start_monitor_gateway
    validate_monitor_gateway
    "$repo_root/scripts/dr-enroll-simulation.sh"
    ;;
  exercise-clickhouse)
    require_env
    exercise_clickhouse
    ;;
  exercise-postgres)
    require_env
    exercise_postgres
    ;;
  stop)
    require_env
    disconnect_active_api
    dr_compose stop
    echo "Laboratório parado; volumes preservados"
    ;;
  logs)
    require_env
    dr_compose logs --tail=200
    ;;
  cleanup)
    require_env
    if [ "${ARGUS_DR_CONFIRM_CLEANUP:-}" != "REMOVE-ARGUS-DR-LAB" ]; then
      echo "A remoção exige ARGUS_DR_CONFIRM_CLEANUP=REMOVE-ARGUS-DR-LAB" >&2
      exit 2
    fi
    disconnect_active_api
    dr_monitor_compose down --volumes --remove-orphans
    echo "Containers, redes e volumes exclusivos de $project_name removidos"
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
