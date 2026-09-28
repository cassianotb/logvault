#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
project_name="argus-dr-rehearsal"
env_file="${ARGUS_DR_ENV_FILE:-$repo_root/.env.dr-lab}"
state_dir="${ARGUS_DR_FAILOVER_STATE_DIR:-$repo_root/artifacts/dr-failover-assistant}"
pending_file="$state_dir/pending.env"
audit_file="$state_dir/audit.jsonl"

usage() {
  cat <<'EOF'
Uso: scripts/dr-failover.sh COMANDO [opções]

Comandos:
  status      mostra papéis, saúde e estado do failover
  preflight   executa somente as verificações, sem alterar serviços
  prepare     gera uma autorização temporária para um incidente
  fence-lab   para somente o DC-A restaurado do laboratório
  execute     promove B e inicia API/Web após duas confirmações explícitas
  resume      retoma apenas a troca de rota após promoção já concluída

Opções de prepare:
  --incident ID                 identificador do incidente
  --fencing-reference REFERENCIA ticket ou evidência planejada de isolamento

Para executar uma autorização preparada:
  ARGUS_DR_CONFIRM_FAILOVER='PROMOTE-DC-B:DESAFIO' \
  ARGUS_DR_FENCING_CONFIRMED='DC-A-ISOLATED:REFERENCIA' \
    scripts/dr-failover.sh execute --incident ID

O desafio expira em 15 minutos. Em produção, o fencing é externo. O comando
fence-lab existe apenas para o ensaio isolado e exige confirmação própria.
EOF
}

[[ -r "$env_file" ]] || { echo "Ambiente DR não encontrado: $env_file" >&2; exit 2; }

dr_compose() {
  docker compose --project-name "$project_name" \
    --file "$repo_root/compose.dr-lab.yaml" \
    --file "$repo_root/compose.dr-rehearsal.yaml" \
    --env-file "$env_file" --profile replication --profile application --profile monitoring "$@"
}

pg_value() {
  dr_compose exec -T "$1" psql -U argus -d argus -Atqc "$2"
}

ch_value() {
  dr_compose exec -T "$1" sh -c \
    'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database argus --format TSVRaw --query "$1"' \
    sh "$2"
}

service_running() {
  [[ -n "$(dr_compose ps --status running -q "$1")" ]]
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/[[:cntrl:]]/ /g'
}

audit() {
  local action="$1" result="$2" detail="$3"
  mkdir -p "$state_dir"; chmod 0700 "$state_dir"
  printf '{"at":"%s","action":"%s","result":"%s","detail":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(json_escape "$action")" \
    "$(json_escape "$result")" "$(json_escape "$detail")" >>"$audit_file"
  chmod 0600 "$audit_file"
}

read_pending() {
  [[ -r "$pending_file" ]] || { echo "Nenhuma autorização de failover pendente" >&2; exit 2; }
  incident_saved="$(sed -n 's/^incident=//p' "$pending_file")"
  fencing_saved="$(sed -n 's/^fencing_reference=//p' "$pending_file")"
  challenge_saved="$(sed -n 's/^challenge=//p' "$pending_file")"
  expires_saved="$(sed -n 's/^expires_epoch=//p' "$pending_file")"
  state_saved="$(sed -n 's/^status=//p' "$pending_file")"
  [[ "$incident_saved" =~ ^[A-Za-z0-9._-]{3,80}$ ]]
  [[ "$fencing_saved" =~ ^[A-Za-z0-9._:/-]{3,160}$ ]]
  [[ "$challenge_saved" =~ ^[a-f0-9]{24}$ ]]
  [[ "$expires_saved" =~ ^[0-9]{10,}$ ]]
}

status() {
  local pg_a="indisponível" pg_b="indisponível" ch_b="indisponível"
  if service_running postgres-a; then pg_a="$(pg_value postgres-a 'SELECT CASE WHEN pg_is_in_recovery() THEN '\''standby'\'' ELSE '\''primary'\'' END')"; fi
  if service_running postgres-b; then pg_b="$(pg_value postgres-b 'SELECT CASE WHEN pg_is_in_recovery() THEN '\''standby'\'' ELSE '\''primary'\'' END')"; fi
  if service_running clickhouse-b; then
    ch_b="$(ch_value clickhouse-b "SELECT concat(toString(count()), ' tabela(s); readonly=', toString(sum(is_readonly)), '; fila=', toString(sum(queue_size))) FROM system.replicas WHERE database='argus'")"
  fi
  printf 'DC-A PostgreSQL: %s\nDC-B PostgreSQL: %s\nDC-B ClickHouse: %s\n' "$pg_a" "$pg_b" "$ch_b"
  printf 'API B: %s\nWeb B: %s\n' "$(service_running api-b && printf ligada || printf desligada)" "$(service_running web-b && printf ligado || printf desligado)"
  if [[ -r "$pending_file" ]]; then
    read_pending
    printf 'Autorização: %s (incidente %s, expira %s)\n' "$state_saved" "$incident_saved" "$(date -d "@$expires_saved" -u +%Y-%m-%dT%H:%M:%SZ)"
  else
    printf 'Autorização: nenhuma\n'
  fi
}

preflight() {
  local failures=0 pg_b_recovery ch_tables ch_readonly ch_expired ch_queue ch_active
  if ! service_running postgres-b; then echo '[FALHA] PostgreSQL B não está em execução'; failures=$((failures + 1))
  else
    pg_b_recovery="$(pg_value postgres-b 'SELECT pg_is_in_recovery()')"
    if [[ "$pg_b_recovery" == t ]]; then echo '[OK] PostgreSQL B está em recovery'
    else echo '[FALHA] PostgreSQL B não está em recovery; promoção já ocorreu ou papel inesperado'; failures=$((failures + 1)); fi
  fi
  if ! service_running clickhouse-b; then echo '[FALHA] ClickHouse B não está em execução'; failures=$((failures + 1))
  else
    IFS='|' read -r ch_tables ch_readonly ch_expired ch_queue ch_active <<<"$(ch_value clickhouse-b "SELECT concat(toString(count()),'|',toString(sum(is_readonly)),'|',toString(sum(is_session_expired)),'|',toString(sum(queue_size)),'|',toString(min(active_replicas))) FROM system.replicas WHERE database='argus'")"
    if [[ "${ch_tables:-0}" -gt 0 && "${ch_readonly:-1}" -eq 0 && "${ch_expired:-1}" -eq 0 && "${ch_queue:-1}" -eq 0 && "${ch_active:-0}" -ge 2 ]]; then
      echo "[OK] ClickHouse B: $ch_tables tabelas, filas zeradas e $ch_active réplicas ativas"
    else
      echo "[FALHA] ClickHouse B: tabelas=${ch_tables:-?}, readonly=${ch_readonly:-?}, sessão expirada=${ch_expired:-?}, fila=${ch_queue:-?}, réplicas=${ch_active:-?}"
      failures=$((failures + 1))
    fi
  fi
  if service_running api-b || service_running web-b; then echo '[FALHA] API/Web B já estão ligados antes da promoção'; failures=$((failures + 1))
  else echo '[OK] API e Web B permanecem desligados'; fi
  if [[ "$failures" -ne 0 ]]; then audit preflight failed "$failures bloqueio(s)"; return 1; fi
  audit preflight success 'pré-condições técnicas aprovadas'
  echo 'Preflight aprovado. Nenhuma alteração foi executada.'
}

verify_lab_fence() {
  ! service_running postgres-a && ! service_running clickhouse-a && ! service_running keeper-1
}

preflight_promote() {
  local failures=0 pg_b_recovery ch_tables ch_readonly ch_expired ch_queue ch_active
  if verify_lab_fence; then echo '[OK] DC-A restaurado isolado (PostgreSQL, ClickHouse e Keeper A parados)'
  else echo '[FALHA] fencing verificável do DC-A restaurado não foi concluído'; failures=$((failures + 1)); fi
  if ! service_running postgres-b; then echo '[FALHA] PostgreSQL B não está em execução'; failures=$((failures + 1))
  else
    pg_b_recovery="$(pg_value postgres-b 'SELECT pg_is_in_recovery()')"
    [[ "$pg_b_recovery" == t ]] && echo '[OK] PostgreSQL B pronto para promoção' || { echo '[FALHA] PostgreSQL B não está em recovery'; failures=$((failures + 1)); }
  fi
  if ! service_running clickhouse-b; then echo '[FALHA] ClickHouse B não está em execução'; failures=$((failures + 1))
  else
    IFS='|' read -r ch_tables ch_readonly ch_expired ch_queue ch_active <<<"$(ch_value clickhouse-b "SELECT concat(toString(count()),'|',toString(sum(is_readonly)),'|',toString(sum(is_session_expired)),'|',toString(sum(queue_size)),'|',toString(min(active_replicas))) FROM system.replicas WHERE database='argus'")"
    if [[ "${ch_tables:-0}" -gt 0 && "${ch_readonly:-1}" -eq 0 && "${ch_expired:-1}" -eq 0 && "${ch_queue:-1}" -eq 0 && "${ch_active:-0}" -ge 1 ]]; then
      echo "[OK] ClickHouse B gravável com quorum Keeper e $ch_active réplica(s) ativa(s)"
    else
      echo "[FALHA] ClickHouse B após fencing: tabelas=${ch_tables:-?}, readonly=${ch_readonly:-?}, sessão expirada=${ch_expired:-?}, fila=${ch_queue:-?}, réplicas=${ch_active:-?}"
      failures=$((failures + 1))
    fi
  fi
  if service_running api-b || service_running web-b; then echo '[FALHA] API/Web B já estão ligados antes da promoção'; failures=$((failures + 1))
  else echo '[OK] API e Web B permanecem desligados'; fi
  [[ "$failures" -eq 0 ]] || { audit preflight-promote failed "$failures bloqueio(s)"; return 1; }
  audit preflight-promote success 'fencing e pré-condições de promoção aprovados'
}

incident=""; fencing_reference=""
command_name="${1:-}"; [[ -n "$command_name" ]] && shift || true
while (($#)); do
  case "$1" in
    --incident) incident="${2:-}"; shift 2 ;;
    --fencing-reference) fencing_reference="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Opção desconhecida: $1" >&2; exit 2 ;;
  esac
done

case "$command_name" in
  status) status ;;
  preflight) preflight ;;
  prepare)
    [[ "$incident" =~ ^[A-Za-z0-9._-]{3,80}$ ]] || { echo 'Informe --incident com 3 a 80 caracteres seguros' >&2; exit 2; }
    [[ "$fencing_reference" =~ ^[A-Za-z0-9._:/-]{3,160}$ ]] || { echo 'Informe --fencing-reference sem espaços' >&2; exit 2; }
    preflight
    mkdir -p "$state_dir"; chmod 0700 "$state_dir"
    challenge="$(openssl rand -hex 12)"; expires_epoch="$(( $(date +%s) + 900 ))"
    printf 'incident=%s\nfencing_reference=%s\nchallenge=%s\nexpires_epoch=%s\nstatus=pending\n' \
      "$incident" "$fencing_reference" "$challenge" "$expires_epoch" >"$pending_file"
    chmod 0600 "$pending_file"
    audit prepare pending "incidente=$incident; fencing=$fencing_reference"
    printf 'Autorização preparada por 15 minutos.\nDesafio: %s\n' "$challenge"
    printf 'Revise o RPO, isole o DC-A e use as duas confirmações descritas em --help.\n'
    ;;
  fence-lab)
    [[ "$incident" =~ ^[A-Za-z0-9._-]{3,80}$ ]] || { echo 'Informe --incident' >&2; exit 2; }
    read_pending
    [[ "$state_saved" == pending && "$incident" == "$incident_saved" ]] || { echo 'Autorização não corresponde ao incidente' >&2; exit 2; }
    [[ "$(date +%s)" -le "$expires_saved" ]] || { echo 'Autorização expirada' >&2; exit 2; }
    [[ "${ARGUS_DR_CONFIRM_LAB_FENCE:-}" == "STOP-RESTORED-DC-A:$challenge_saved" ]] || { echo 'Confirmação de fencing do laboratório inválida' >&2; exit 2; }
    dr_compose stop postgres-a clickhouse-a keeper-1
    verify_lab_fence || { audit fence-lab failed 'serviços A ainda ativos'; exit 1; }
    sed -i 's/^status=.*/status=fenced/' "$pending_file"
    audit fence-lab success "incidente=$incident"
    echo 'DC-A restaurado isolado; ambiente ativo do LogVault não foi alterado.'
    ;;
  execute)
    [[ "$incident" =~ ^[A-Za-z0-9._-]{3,80}$ ]] || { echo 'Informe --incident' >&2; exit 2; }
    read_pending
    [[ "$state_saved" == fenced && "$incident" == "$incident_saved" ]] || { echo 'Autorização não corresponde ao incidente ou fencing não concluído' >&2; exit 2; }
    [[ "$(date +%s)" -le "$expires_saved" ]] || { audit execute blocked 'autorização expirada'; echo 'Autorização expirada' >&2; exit 2; }
    [[ "${ARGUS_DR_CONFIRM_FAILOVER:-}" == "PROMOTE-DC-B:$challenge_saved" ]] || { audit execute blocked 'confirmação de promoção inválida'; echo 'Confirmação de promoção inválida' >&2; exit 2; }
    [[ "${ARGUS_DR_FENCING_CONFIRMED:-}" == "DC-A-ISOLATED:$fencing_saved" ]] || { audit execute blocked 'fencing não confirmado'; echo 'Fencing do DC-A não confirmado' >&2; exit 2; }
    preflight_promote
    audit execute started "incidente=$incident"
    dr_compose exec -T --user postgres postgres-b sh -c 'pg_ctl -D "$PGDATA" promote --wait --timeout 60'
    [[ "$(pg_value postgres-b 'SELECT pg_is_in_recovery()')" == f ]] || { audit execute failed 'PostgreSQL B não promoveu'; exit 1; }
    dr_compose exec -T postgres-b psql -U argus -d argus -v ON_ERROR_STOP=1 \
      <"$repo_root/infra/postgres/037_continuity_routing.sql" >/dev/null
    dr_compose up -d --no-deps --wait api-b web-b
    if [[ -n "${ARGUS_DR_DNS_HOOK:-}" ]]; then
      [[ "$ARGUS_DR_DNS_HOOK" = /* && -x "$ARGUS_DR_DNS_HOOK" ]] || { audit execute failed 'hook DNS inválido'; echo 'ARGUS_DR_DNS_HOOK deve ser um executável absoluto' >&2; exit 1; }
      "$ARGUS_DR_DNS_HOOK" activate dc-b "$incident"
      final_state=completed
    else
      final_state=services_ready_dns_pending
    fi
    sed -i "s/^status=.*/status=$final_state/" "$pending_file"
    audit execute "$final_state" 'PostgreSQL promovido; API e Web B saudáveis'
    echo "Failover: $final_state"
    ;;
  resume)
    [[ "$incident" =~ ^[A-Za-z0-9._-]{3,80}$ ]] || { echo 'Informe --incident' >&2; exit 2; }
    read_pending
    [[ "$incident" == "$incident_saved" ]] || { echo 'Autorização não corresponde ao incidente' >&2; exit 2; }
    [[ "${ARGUS_DR_CONFIRM_FAILOVER:-}" == "PROMOTE-DC-B:$challenge_saved" ]] || { echo 'Confirmação de promoção inválida' >&2; exit 2; }
    [[ "${ARGUS_DR_FENCING_CONFIRMED:-}" == "DC-A-ISOLATED:$fencing_saved" ]] || { echo 'Fencing do DC-A não confirmado' >&2; exit 2; }
    verify_lab_fence || { echo 'DC-A restaurado não está isolado' >&2; exit 1; }
    [[ "$(pg_value postgres-b 'SELECT pg_is_in_recovery()')" == f ]] || { echo 'PostgreSQL B ainda não foi promovido' >&2; exit 1; }
    service_running api-b && service_running web-b || { echo 'API/Web B não estão em execução' >&2; exit 1; }
    [[ -n "${ARGUS_DR_DNS_HOOK:-}" && "$ARGUS_DR_DNS_HOOK" = /* && -x "$ARGUS_DR_DNS_HOOK" ]] || { echo 'Hook DNS inválido' >&2; exit 2; }
    "$ARGUS_DR_DNS_HOOK" activate dc-b "$incident"
    sed -i 's/^status=.*/status=completed/' "$pending_file"
    audit resume completed 'rota transferida após promoção já concluída'
    echo 'Failover: completed'
    ;;
  -h|--help|help|'') usage ;;
  *) usage >&2; exit 2 ;;
esac
