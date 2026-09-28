#!/bin/sh
set -eu

backup_root="${ARGUS_BACKUP_ROOT:-/backups}"
retention_days="${ARGUS_BACKUP_RETENTION_DAYS:-15}"
full_interval_days="${ARGUS_BACKUP_FULL_INTERVAL_DAYS:-7}"
clickhouse_database="${ARGUS_CLICKHOUSE_DATABASE:-argus}"
api_group_id="${ARGUS_BACKUP_API_GROUP_ID:-1000}"

case "$retention_days" in
  ''|*[!0-9]*) echo "ARGUS_BACKUP_RETENTION_DAYS deve ser numérico" >&2; exit 1 ;;
esac
case "$full_interval_days" in
  ''|*[!0-9]*) echo "ARGUS_BACKUP_FULL_INTERVAL_DAYS deve ser numérico" >&2; exit 1 ;;
esac
if [ "$retention_days" -lt 1 ] || [ "$full_interval_days" -lt 1 ]; then
  echo "Retenção e intervalo de backup completo devem ser pelo menos 1 dia" >&2
  exit 1
fi
case "$clickhouse_database" in
  ''|*[!A-Za-z0-9_]*) echo "ARGUS_CLICKHOUSE_DATABASE contém caracteres inválidos" >&2; exit 1 ;;
esac
case "$api_group_id" in
  ''|*[!0-9]*) echo "ARGUS_BACKUP_API_GROUP_ID deve ser numérico" >&2; exit 1 ;;
esac

umask 077
mkdir -p "$backup_root"
exec 9>"$backup_root/.backup.lock"
if ! flock -w 600 9; then
  echo "Outro backup continua em execução após 10 minutos" >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
runs_root="$backup_root/runs"
run_dir="$runs_root/$timestamp"
completed=false

cleanup() {
  if [ "$completed" != true ] && [ -n "$run_dir" ]; then
    case "$run_dir" in
      "$runs_root"/*) rm -rf -- "$run_dir" ;;
    esac
  fi
}
trap cleanup EXIT INT TERM

mkdir -p "$run_dir"
chmod 0755 "$backup_root" "$runs_root"
chmod 0777 "$run_dir"

last_full_id=""
last_full_created_at=""
for metadata in $(find "$runs_root" -mindepth 2 -maxdepth 2 -type f -name metadata.json | sort -r); do
  candidate_dir="$(dirname "$metadata")"
  candidate_id="$(basename "$candidate_dir")"
  case "$candidate_id" in
    ????????T??????Z) ;;
    *) continue ;;
  esac
  if [ ! -f "$candidate_dir/COMPLETE" ] || [ ! -d "$candidate_dir/clickhouse" ]; then continue; fi
  candidate_type="$(jq -r '.backupType // "full"' "$metadata" 2>/dev/null || true)"
  if [ "$candidate_type" = "full" ]; then
    last_full_id="$candidate_id"
    last_full_created_at="$(jq -r '.createdAt // empty' "$metadata" 2>/dev/null || true)"
    break
  fi
done

backup_type="full"
base_backup_id=""
if [ -n "$last_full_id" ] && [ -n "$last_full_created_at" ]; then
  last_full_epoch="$(date -u -d "$last_full_created_at" +%s 2>/dev/null || printf '0')"
  current_epoch="$(date -u +%s)"
  if [ "$last_full_epoch" -gt 0 ] && [ $((current_epoch - last_full_epoch)) -lt $((full_interval_days * 86400)) ]; then
    backup_type="incremental"
    base_backup_id="$last_full_id"
  fi
fi

pg_dump "$ARGUS_POSTGRES_URL" \
  --format=custom \
  --compress=zstd:6 \
  --file="$run_dir/postgres.dump"

collector_present=false
if [ -r /var/lib/argus/spool.sqlite ]; then
  # VACUUM INTO keeps one read snapshot while the collector continues writing
  # in WAL mode. The sqlite3 `.backup` command may repeatedly restart pages
  # under sustained ingestion and never catch up with a busy spool.
  sqlite3 -readonly -cmd ".timeout 10000" /var/lib/argus/spool.sqlite \
    "VACUUM INTO '$run_dir/collector.sqlite'"
  zstd --quiet -T0 -6 --rm "$run_dir/collector.sqlite"
  collector_present=true
fi

backup_query="BACKUP DATABASE $clickhouse_database TO Disk('backups', 'runs/$timestamp/clickhouse')"
if [ "$backup_type" = "incremental" ]; then
  backup_query="$backup_query SETTINGS base_backup = Disk('backups', 'runs/$base_backup_id/clickhouse')"
fi
curl --fail-with-body --silent --show-error \
  --user "$ARGUS_CLICKHOUSE_USER:$ARGUS_CLICKHOUSE_PASSWORD" \
  --data-binary "$backup_query" \
  "${ARGUS_CLICKHOUSE_URL%/}/?wait_end_of_query=1"

postgres_bytes="$(wc -c < "$run_dir/postgres.dump" | tr -d ' ')"
collector_bytes=0
if [ "$collector_present" = true ]; then
  collector_bytes="$(wc -c < "$run_dir/collector.sqlite.zst" | tr -d ' ')"
fi
clickhouse_bytes="$(du -sk "$run_dir/clickhouse" | awk '{ print $1 * 1024 }')"

jq -n -c \
  --arg id "$timestamp" \
  --arg createdAt "$created_at" \
  --arg backupType "$backup_type" \
  --arg baseBackupId "$base_backup_id" \
  --argjson postgresBytes "$postgres_bytes" \
  --argjson clickhouseBytes "$clickhouse_bytes" \
  --argjson collectorBytes "$collector_bytes" \
  --argjson collectorIncluded "$collector_present" \
  '{id:$id, createdAt:$createdAt, backupType:$backupType,
    baseBackupId:(if $baseBackupId == "" then null else $baseBackupId end),
    postgresBytes:$postgresBytes, clickhouseBytes:$clickhouseBytes,
    collectorBytes:$collectorBytes, collectorIncluded:$collectorIncluded}' \
  > "$run_dir/metadata.json"
(cd "$run_dir" && {
  sha256sum postgres.dump
  if [ "$collector_present" = true ]; then sha256sum collector.sqlite.zst; fi
  sha256sum metadata.json
  find clickhouse -type f -exec sha256sum {} \;
}) > "$run_dir/checksums.sha256"
printf '%s\n' "$timestamp" > "$run_dir/COMPLETE"
chgrp -R "$api_group_id" "$run_dir"
find "$run_dir" -type d -exec chmod 0755 {} \;
find "$run_dir" -type f -exec chmod 0640 {} \;
cp "$run_dir/metadata.json" "$backup_root/LAST_SUCCESS.json"
chmod 0644 "$backup_root/LAST_SUCCESS.json"
completed=true

if [ -n "${ARGUS_BACKUP_REMOTE_TARGET:-}" ]; then
  if /usr/local/bin/backup-mirror.sh "$timestamp"; then
    rm -f "$backup_root/LAST_REMOTE_FAILURE.json"
  else
    remote_failed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '{"backupId":"%s","failedAt":"%s"}\n' "$timestamp" "$remote_failed_at" > "$backup_root/LAST_REMOTE_FAILURE.json"
    chmod 0644 "$backup_root/LAST_REMOTE_FAILURE.json"
    echo "Cópia externa do backup $timestamp falhou; a cópia local permanece válida" >&2
  fi
fi

find "$runs_root" -mindepth 1 -maxdepth 1 -type d -mtime "+$retention_days" -print | while IFS= read -r old_run; do
  case "$old_run" in
    "$runs_root"/*)
      old_type="$(jq -r '.backupType // "full"' "$old_run/metadata.json" 2>/dev/null || printf 'full')"
      if [ "$old_type" = "incremental" ]; then rm -rf -- "$old_run"; fi
      ;;
  esac
done

find "$runs_root" -mindepth 1 -maxdepth 1 -type d -mtime "+$retention_days" -print | while IFS= read -r old_run; do
  case "$old_run" in
    "$runs_root"/*)
      old_id="$(basename "$old_run")"
      old_type="$(jq -r '.backupType // "full"' "$old_run/metadata.json" 2>/dev/null || printf 'full')"
      if [ "$old_type" != "full" ]; then continue; fi
      referenced=false
      for metadata in "$runs_root"/*/metadata.json; do
        if [ ! -f "$metadata" ]; then continue; fi
        if [ "$(jq -r '.baseBackupId // empty' "$metadata" 2>/dev/null || true)" = "$old_id" ]; then
          referenced=true
          break
        fi
      done
      if [ "$referenced" = false ]; then rm -rf -- "$old_run"; fi
      ;;
  esac
done

echo "Backup $timestamp ($backup_type) concluído"
