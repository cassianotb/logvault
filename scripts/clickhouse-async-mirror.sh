#!/usr/bin/env bash
set -Eeuo pipefail

primary_host="${ARGUS_DR_SITE_A_HOST:?ARGUS_DR_SITE_A_HOST obrigatório}"
primary_port="${ARGUS_DR_PRIMARY_CLICKHOUSE_NATIVE_PORT:-9000}"
primary_user="${ARGUS_DR_PRIMARY_CLICKHOUSE_USER:-argus}"
primary_password="${ARGUS_DR_PRIMARY_CLICKHOUSE_PASSWORD:?senha do ClickHouse A obrigatória}"
standby_host="${ARGUS_DR_STANDBY_CLICKHOUSE_HOST:-clickhouse-b}"
standby_user="${ARGUS_CLICKHOUSE_USER:-argus}"
standby_password="${ARGUS_CLICKHOUSE_PASSWORD:?senha do ClickHouse B obrigatória}"
interval_seconds="${ARGUS_DR_MIRROR_INTERVAL_SECONDS:-5}"
chunk_ms="$(( ${ARGUS_DR_MIRROR_CHUNK_SECONDS:-3600} * 1000 ))"
overlap_ms="${ARGUS_DR_MIRROR_OVERLAP_MS:-1000}"

[[ "$primary_host" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]*$ ]] || { echo 'Host primário inválido' >&2; exit 2; }
[[ "$primary_port" =~ ^[0-9]+$ && "$interval_seconds" =~ ^[0-9]+$ && "$chunk_ms" -gt 0 ]] || { echo 'Parâmetros numéricos inválidos' >&2; exit 2; }
[[ "$primary_password" =~ ^[A-Fa-f0-9]{16,256}$ && "$standby_password" =~ ^[A-Fa-f0-9]{16,256}$ ]] || { echo 'Credenciais de replicação inválidas' >&2; exit 2; }

ch() {
  clickhouse-client --host "$standby_host" --user "$standby_user" --password "$standby_password" \
    --database argus --format TSVRaw --query "$1"
}

remote_table() {
  printf "remote('%s:%s','argus','%s','%s','%s')" \
    "$primary_host" "$primary_port" "$1" "$primary_user" "$primary_password"
}

sync_table() {
  local table="$1" timestamp_column="$2" remote source_min source_max watermark lower upper now_ms
  remote="$(remote_table "$table")"
  source_min="$(ch "SELECT ifNull(toUnixTimestamp64Milli(min($timestamp_column)),0) FROM $remote")" || return 2
  source_max="$(ch "SELECT ifNull(toUnixTimestamp64Milli(max($timestamp_column)),0) FROM $remote")" || return 2
  watermark="$(ch "SELECT ifNull(argMax(watermark_ms,version),0) FROM dr_mirror_state WHERE table_name='$table'")" || return 2
  [[ "$source_min" =~ ^[0-9]+$ && "$source_max" =~ ^[0-9]+$ && "$watermark" =~ ^[0-9]+$ ]] || return 2
  now_ms="$(( $(date +%s) * 1000 ))"

  if (( source_max == 0 )); then
    ch "INSERT INTO dr_mirror_state VALUES ('$table',0,0,fromUnixTimestamp64Milli($now_ms),'',fromUnixTimestamp64Milli($now_ms))" || return 2
    return 0
  fi
  if (( watermark == 0 )); then watermark=$(( source_min > 0 ? source_min - 1 : 0 )); fi
  upper=$source_max
  if (( source_max - watermark > chunk_ms )); then upper=$((watermark + chunk_ms)); fi
  lower=$watermark
  if (( watermark >= source_max && watermark > overlap_ms )); then lower=$((watermark - overlap_ms)); fi

  ch "INSERT INTO $table SELECT * FROM $remote WHERE toUnixTimestamp64Milli($timestamp_column) > $lower AND toUnixTimestamp64Milli($timestamp_column) <= $upper SETTINGS max_execution_time=0" || return 2
  now_ms="$(( $(date +%s) * 1000 ))"
  ch "INSERT INTO dr_mirror_state VALUES ('$table',$upper,$source_max,fromUnixTimestamp64Milli($now_ms),'',fromUnixTimestamp64Milli($now_ms))" || return 2
  (( upper >= source_max ))
}

until ch 'SELECT 1' >/dev/null 2>&1; do sleep 2; done

while true; do
  caught_up="true"
  had_error="false"
  for table_spec in 'ingest_raw ingested_at' 'cgnat_events ingested_at' 'server_metrics ingested_at' 'ingest_batch_receipts committed_at'; do
    read -r table timestamp_column <<<"$table_spec"
    if sync_table "$table" "$timestamp_column"; then
      :
    else
      result=$?
      caught_up="false"
      [[ "$result" -eq 1 ]] || had_error="true"
    fi
  done
  if [[ "$caught_up" == "true" || "$had_error" == "true" ]]; then sleep "$interval_seconds"; fi
done
