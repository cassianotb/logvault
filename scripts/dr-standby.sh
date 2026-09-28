#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
env_file="${ARGUS_DR_ENV_FILE:-$repo_root/.env.dc-b}"
state_dir="${ARGUS_DR_STATE_DIR:-/var/lib/logvault/dr}"
pending_file="$state_dir/pending.env"
command_name="${1:-status}"
[[ $# -eq 0 ]] || shift
incident=""
fencing_reference=""

usage() {
  cat <<'EOF'
Uso: scripts/dr-standby.sh COMANDO [opções]

  status      mostra PostgreSQL, ClickHouse e serviços do DC-B
  preflight   confirma sincronismo sem promover ou iniciar tráfego
  prepare     cria autorização temporária para uma promoção
  promote     promove B após confirmação explícita de isolamento do A

Opções de prepare/promote:
  --incident ID
  --fencing-reference REFERENCIA

Fluxo seguro:
  scripts/dr-standby.sh prepare --incident INC-123 --fencing-reference TICKET-456
  ARGUS_DR_CONFIRM_PROMOTION='PROMOTE-DC-B:DESAFIO' \
  ARGUS_DR_FENCING_CONFIRMED='DC-A-ISOLATED:TICKET-456' \
    scripts/dr-standby.sh promote --incident INC-123

A promoção inicia os serviços no B, mas nunca altera DNS ou tráfego automaticamente.
EOF
}

die() { printf 'ERRO: %s\n' "$*" >&2; exit 2; }
[[ -r "$env_file" ]] || die "ambiente do DC-B não encontrado: $env_file"

compose() {
  ARGUS_DR_ENV_FILE="$env_file" docker compose --project-name logvault-dc-b \
    --file "$repo_root/compose.dc-b.yaml" --env-file "$env_file" "$@"
}

pg_value() { compose exec -T postgres-b psql -U argus -d argus -Atqc "$1"; }
ch_value() {
  compose exec -T clickhouse-b sh -c \
    'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database argus --format TSVRaw --query "$1"' sh "$1"
}

mirror_state() {
  ch_value "SELECT concat(toString(count()),'|',toString(countIf(source_max_ms > watermark_ms)),'|',toString(ifNull(max(if(source_max_ms>watermark_ms,(source_max_ms-watermark_ms)/1000,0)),0)),'|',toString(ifNull(dateDiff('second',max(last_success_at),now64(3)),999999))) FROM dr_mirror_state FINAL"
}

status() {
  local recovery state_rows pending source_lag heartbeat_age
  recovery="$(pg_value 'SELECT pg_is_in_recovery()' 2>/dev/null || printf indisponivel)"
  IFS='|' read -r state_rows pending source_lag heartbeat_age <<<"$(mirror_state 2>/dev/null || printf '0|3|0|999999')"
  printf 'Estado do Datacenter B\n'
  printf '  PostgreSQL: %s\n' "$([[ "$recovery" == t ]] && printf 'standby em recovery' || [[ "$recovery" == f ]] && printf 'promovido/primário' || printf 'indisponível')"
  printf '  ClickHouse: %s tabelas acompanhadas · %s pendentes · lag fonte %ss · heartbeat %ss\n' "$state_rows" "$pending" "$source_lag" "$heartbeat_age"
  printf '  Espelhamento: %s\n' "$([[ -n "$(compose ps --status running -q clickhouse-mirror)" ]] && printf ativo || printf parado)"
  printf '  API/Web: %s\n' "$([[ -n "$(compose --profile failover ps --status running -q api-b)" ]] && printf ativos || printf desligados)"
}

preflight() {
  local recovery state_rows pending source_lag heartbeat_age failures=0
  recovery="$(pg_value 'SELECT pg_is_in_recovery()' 2>/dev/null || true)"
  [[ "$recovery" == t ]] && printf '[OK] PostgreSQL B está em recovery\n' || { printf '[FALHA] PostgreSQL B não está em recovery\n'; failures=$((failures+1)); }
  IFS='|' read -r state_rows pending source_lag heartbeat_age <<<"$(mirror_state 2>/dev/null || printf '0|3|0|999999')"
  if [[ "$state_rows" -ge 3 && "$pending" -eq 0 ]]; then
    printf '[OK] ClickHouse B sem backlog conhecido; última confirmação há %ss\n' "$heartbeat_age"
    if [[ "$heartbeat_age" -gt 60 ]]; then
      printf '[AVISO] A fonte não responde recentemente; o RPO máximo observado é de aproximadamente %ss\n' "$heartbeat_age"
    fi
  else
    printf '[FALHA] ClickHouse B: tabelas=%s pendentes=%s heartbeat=%ss\n' "$state_rows" "$pending" "$heartbeat_age"
    failures=$((failures+1))
  fi
  [[ -z "$(compose --profile failover ps --status running -q api-b web-b proxy-b collector-b backup-b)" ]] \
    && printf '[OK] Serviços ativos permanecem desligados\n' \
    || { printf '[FALHA] Há serviços de produção ligados antes da promoção\n'; failures=$((failures+1)); }
  [[ "$failures" -eq 0 ]]
}

while (($#)); do
  case "$1" in
    --incident) incident="${2:-}"; shift 2 ;;
    --fencing-reference) fencing_reference="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done

case "$command_name" in
  status) status ;;
  preflight) preflight ;;
  prepare)
    [[ "$incident" =~ ^[A-Za-z0-9._-]{3,80}$ ]] || die "informe --incident"
    [[ "$fencing_reference" =~ ^[A-Za-z0-9._:/-]{3,160}$ ]] || die "informe --fencing-reference"
    preflight || die "pré-condições de promoção não atendidas"
    install -d -m 0700 "$state_dir"
    challenge="$(openssl rand -hex 12)"
    expires_epoch=$(( $(date +%s) + 900 ))
    printf 'incident=%s\nfencing_reference=%s\nchallenge=%s\nexpires_epoch=%s\n' \
      "$incident" "$fencing_reference" "$challenge" "$expires_epoch" >"$pending_file"
    chmod 0600 "$pending_file"
    printf 'Autorização válida por 15 minutos.\nDesafio: %s\n' "$challenge"
    printf 'Isole o DC-A antes de executar promote.\n'
    ;;
  promote)
    [[ -r "$pending_file" ]] || die "execute prepare primeiro"
    requested_incident="$incident"
    # shellcheck disable=SC1090
    source "$pending_file"
    [[ "$requested_incident" == "$incident" ]] || die "incidente não corresponde à autorização"
    [[ $(date +%s) -le "$expires_epoch" ]] || die "autorização expirada"
    [[ "${ARGUS_DR_CONFIRM_PROMOTION:-}" == "PROMOTE-DC-B:$challenge" ]] || die "confirmação de promoção inválida"
    [[ "${ARGUS_DR_FENCING_CONFIRMED:-}" == "DC-A-ISOLATED:$fencing_reference" ]] || die "isolamento do DC-A não confirmado"
    preflight || die "sincronismo perdido antes da promoção"
    compose stop clickhouse-mirror
    compose exec -T --user postgres postgres-b sh -c 'pg_ctl -D "$PGDATA" promote --wait --timeout 60'
    [[ "$(pg_value 'SELECT pg_is_in_recovery()')" == f ]] || die "PostgreSQL B não foi promovido"
    compose exec -T postgres-b psql -U argus -d argus -v ON_ERROR_STOP=1 -c \
      "UPDATE platform_continuity_settings SET enabled=false,last_test_status=NULL,last_test_error='DC-B promovido; reconstrução do DC-A pendente',updated_at=now() WHERE singleton=true" >/dev/null
    compose --profile failover up -d --build api-b web-b proxy-b collector-b backup-b
    rm -f "$pending_file"
    printf 'DC-B promovido e serviços iniciados.\n'
    printf 'O tráfego ainda NÃO foi alterado; execute a mudança de DNS/roteamento somente após validar o painel.\n'
    ;;
  -h|--help|help) usage ;;
  *) usage >&2; exit 2 ;;
esac
