#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
compose_file="$repo_root/compose.restore-test.yaml"
project_name="argus-restore-test"
report_root="$repo_root/restore-tests"

restore_compose() {
  docker compose --project-name "$project_name" --file "$compose_file" "$@"
}

if [ "${1:-}" = "cleanup" ]; then
  restore_compose down --volumes --remove-orphans
  echo "Ambiente isolado de restauração removido"
  exit 0
fi

restore_compose build restore-toolbox
backup_id="${1:-latest}"
if [ "$backup_id" = "latest" ]; then
  backup_id="$(restore_compose run --rm --no-deps restore-toolbox -c "jq -r '.id // empty' /backups/LAST_SUCCESS.json")"
fi
case "$backup_id" in
  ????????T??????Z) ;;
  *) echo "Uso: $0 [latest|ID_DO_BACKUP|cleanup]" >&2; exit 2 ;;
esac
case "$backup_id" in
  *[!0-9TZ]*) echo "ID de backup inválido" >&2; exit 2 ;;
esac

run_path="/backups/runs/$backup_id"
restore_compose run --rm --no-deps restore-toolbox -c "test -f '$run_path/COMPLETE' && test -f '$run_path/postgres.dump' && test -f '$run_path/metadata.json' && test -d '$run_path/clickhouse'"
base_backup_id="$(restore_compose run --rm --no-deps restore-toolbox -c "jq -r '.baseBackupId // empty' '$run_path/metadata.json'")"
if [ -n "$base_backup_id" ]; then
  case "$base_backup_id" in
    ????????T??????Z) ;;
    *) echo "Base incremental inválida: $base_backup_id" >&2; exit 2 ;;
  esac
  case "$base_backup_id" in
    *[!0-9TZ]*) echo "Base incremental inválida" >&2; exit 2 ;;
  esac
  restore_compose run --rm --no-deps restore-toolbox -c "test -f '/backups/runs/$base_backup_id/COMPLETE' && test -d '/backups/runs/$base_backup_id/clickhouse'"
fi

echo "Validando checksums do backup $backup_id"
restore_compose run --rm --no-deps restore-toolbox -c "cd '$run_path' && sha256sum --quiet -c checksums.sha256"
if [ -n "$base_backup_id" ]; then
  restore_compose run --rm --no-deps restore-toolbox -c "cd '/backups/runs/$base_backup_id' && sha256sum --quiet -c checksums.sha256"
fi
restore_compose run --rm --no-deps restore-toolbox -c "pg_restore --list '$run_path/postgres.dump' >/dev/null"

echo "Recriando exclusivamente os volumes argus-restore-test-*"
restore_compose down --volumes --remove-orphans
restore_compose up -d --wait restore-postgres restore-clickhouse

started_epoch="$(date +%s)"
restore_ok=false
finish() {
  if [ "$restore_ok" != true ]; then
    echo "Ensaio interrompido. Os containers e volumes argus-restore-test-* foram preservados para inspeção." >&2
  fi
}
trap finish EXIT INT TERM

echo "Restaurando PostgreSQL no volume isolado"
restore_compose exec -T restore-postgres sh -c '
  pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$1"
' sh "$run_path/postgres.dump"

echo "Restaurando ClickHouse no volume isolado"
restore_compose exec -T restore-clickhouse sh -c '
  set -eu
  backup_id="$1"
  query="DROP DATABASE IF EXISTS argus; RESTORE DATABASE argus FROM Disk('\''backups'\'', '\''runs/$backup_id/clickhouse'\'')"
  clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --multiquery --query "$query"
' sh "$backup_id"

echo "Restaurando e verificando o snapshot SQLite no volume isolado"
if restore_compose run --rm --no-deps restore-toolbox -c "test -f '$run_path/collector.sqlite.zst'"; then
  restore_compose run --rm --no-deps restore-toolbox -c "rm -f /restore/spool.sqlite && zstd -dc '$run_path/collector.sqlite.zst' > /restore/spool.sqlite"
elif restore_compose run --rm --no-deps restore-toolbox -c "test -f '$run_path/collector.sqlite'"; then
  restore_compose run --rm --no-deps restore-toolbox -c "rm -f /restore/spool.sqlite && cp '$run_path/collector.sqlite' /restore/spool.sqlite"
else
  echo "O backup não contém snapshot do coletor" >&2
  exit 1
fi
spool_integrity="$(restore_compose run --rm --no-deps restore-toolbox -c "sqlite3 -readonly /restore/spool.sqlite 'PRAGMA integrity_check;'")"
if [ "$spool_integrity" != "ok" ]; then
  echo "Falha na integridade do SQLite: $spool_integrity" >&2
  exit 1
fi

echo "Executando verificações de consistência"
pg_summary="$(restore_compose exec -T restore-postgres psql -U argus -d argus -At -F '|' -c "
  SELECT
    (SELECT count(*) FROM tenants),
    (SELECT count(*) FROM users),
    (SELECT count(*) FROM devices),
    (SELECT count(*) FROM collectors),
    (SELECT count(*) FROM query_audit),
    (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND NOT convalidated);
")"
ch_summary="$(restore_compose exec -T restore-clickhouse sh -c '
  clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database argus --query "
    SELECT concat(
      toString((SELECT count() FROM ingest_raw FINAL)), '\''|'\'',
      toString((SELECT uniqExact(raw_id) FROM ingest_raw FINAL)), '\''|'\'',
      toString((SELECT count() FROM cgnat_events FINAL)), '\''|'\'',
      toString((SELECT uniqExact(event_id) FROM cgnat_events FINAL)), '\''|'\'',
      toString((SELECT count() FROM server_metrics)), '\''|'\'',
      toString((SELECT count() FROM cgnat_events AS e LEFT ANTI JOIN ingest_raw AS r ON e.raw_id = r.raw_id)), '\''|'\'',
      toString((SELECT min(received_at) FROM ingest_raw)), '\''|'\'',
      toString((SELECT max(received_at) FROM ingest_raw))
    )
    FORMAT TSVRaw
  "
')"
ch_checks="$(restore_compose exec -T restore-clickhouse sh -c '
  clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database argus --query "CHECK TABLE ingest_raw; CHECK TABLE cgnat_events; CHECK TABLE server_metrics; CHECK TABLE ingest_batch_receipts" --multiquery --format TSVRaw
')"
if ! printf '%s\n' "$ch_checks" | awk -F '\t' '
  NF < 2 || $2 != "1" { failed = 1 }
  END { exit (NR > 0 && !failed) ? 0 : 1 }
'; then
  echo "CHECK TABLE do ClickHouse não confirmou todas as tabelas" >&2
  exit 1
fi
spool_summary="$(restore_compose run --rm --no-deps restore-toolbox -c "sqlite3 -readonly -separator '|' /restore/spool.sqlite \"SELECT count(*), sum(CASE WHEN state = 'pending' THEN 1 ELSE 0 END), sum(CASE WHEN state = 'batched' THEN 1 ELSE 0 END), sum(CASE WHEN state = 'acked' THEN 1 ELSE 0 END), COALESCE(sum(json_array_length(events_json)), 0) FROM raw_spool;\"")"

old_ifs="$IFS"
IFS='|'
set -- $pg_summary
pg_tenants="$1"; pg_users="$2"; pg_devices="$3"; pg_collectors="$4"; pg_queries="$5"; pg_unvalidated_fks="$6"
set -- $ch_summary
ch_raw="$1"; ch_unique_raw="$2"; ch_events="$3"; ch_unique_events="$4"; ch_metrics="$5"; ch_orphan_events="$6"; ch_first="$7"; ch_last="$8"
set -- $spool_summary
spool_records="$1"; spool_pending="$2"; spool_batched="$3"; spool_acked="$4"; spool_events="$5"
IFS="$old_ifs"

if [ "$pg_unvalidated_fks" -ne 0 ] || [ "$ch_raw" -ne "$ch_unique_raw" ] || [ "$ch_events" -ne "$ch_unique_events" ] || [ "$ch_orphan_events" -ne 0 ]; then
  echo "As verificações relacionais ou de unicidade falharam" >&2
  exit 1
fi

finished_epoch="$(date +%s)"
duration_seconds="$((finished_epoch - started_epoch))"
mkdir -p "$report_root"
report_path="$report_root/$backup_id.txt"
cat > "$report_path" <<EOF
LOGVAULT - RELATORIO DE RESTAURACAO ISOLADA
Status: SUCESSO
Backup: $backup_id
Base incremental: ${base_backup_id:-nao aplicavel}
Duracao da restauracao e validacao: ${duration_seconds}s

PostgreSQL
- tenants: $pg_tenants
- users: $pg_users
- devices: $pg_devices
- collectors: $pg_collectors
- query_audit: $pg_queries
- chaves estrangeiras nao validadas: $pg_unvalidated_fks

ClickHouse
- registros brutos: $ch_raw
- IDs brutos unicos: $ch_unique_raw
- eventos CGNAT: $ch_events
- IDs de evento unicos: $ch_unique_events
- metricas de servidor: $ch_metrics
- eventos sem registro bruto: $ch_orphan_events
- primeiro recebimento: $ch_first
- ultimo recebimento: $ch_last
- CHECK TABLE: aprovado

SQLite do coletor
- integrity_check: $spool_integrity
- registros: $spool_records
- pendentes: $spool_pending
- em lote: $spool_batched
- confirmados: $spool_acked
- eventos: $spool_events

Seguranca do ensaio
- projeto Docker: $project_name
- portas publicadas: nenhuma
- volume de backup: somente leitura
- dados ativos: nao montados, exceto a origem configurada de backup como leitura
EOF
chmod 0600 "$report_path"

restore_compose stop
restore_ok=true
trap - EXIT INT TERM
echo "Ensaio concluído com sucesso. Relatório: $report_path"
echo "Os volumes isolados foram preservados. Para removê-los: $0 cleanup"
