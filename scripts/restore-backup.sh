#!/bin/sh
set -eu

backup_id="${1:-}"
case "$backup_id" in
  ????????T??????Z) ;;
  *) echo "Uso: ARGUS_CONFIRM_RESTORE=RESTORE-<ID> $0 <ID>" >&2; exit 2 ;;
esac
case "$backup_id" in
  *[!0-9TZ]*) echo "ID de backup inválido" >&2; exit 2 ;;
esac
if [ "${ARGUS_CONFIRM_RESTORE:-}" != "RESTORE-$backup_id" ]; then
  echo "Restauração não autorizada. Defina ARGUS_CONFIRM_RESTORE=RESTORE-$backup_id." >&2
  exit 2
fi

backup_path="/backups/runs/$backup_id"
docker compose exec -T postgres test -f "$backup_path/COMPLETE"
docker compose exec -T postgres test -f "$backup_path/postgres.dump"
docker compose exec -T clickhouse test -d "/var/lib/clickhouse/backups/runs/$backup_id/clickhouse"
base_backup_id="$(sed -n 's/.*"baseBackupId":"\([0-9TZ]*\)".*/\1/p' "$backup_path/metadata.json")"
if [ -n "$base_backup_id" ]; then
  case "$base_backup_id" in
    ????????T??????Z) ;;
    *) echo "Base incremental inválida" >&2; exit 2 ;;
  esac
  docker compose exec -T postgres test -f "/backups/runs/$base_backup_id/COMPLETE"
  docker compose exec -T clickhouse test -d "/var/lib/clickhouse/backups/runs/$base_backup_id/clickhouse"
fi
docker compose exec -T backup sh -c 'cd "$1" && sha256sum -c checksums.sha256' sh "$backup_path"
if [ -n "$base_backup_id" ]; then
  docker compose exec -T backup sh -c 'cd "$1" && sha256sum -c checksums.sha256' sh "/backups/runs/$base_backup_id"
fi

echo "Parando ingestão, API e rotina de backup"
docker compose stop collector api backup

restore_ok=false
finish() {
  if [ "$restore_ok" != true ]; then
    echo "Restauração interrompida. API, coletor e backup permanecerão parados para inspeção." >&2
  fi
}
trap finish EXIT INT TERM

docker compose exec -T postgres sh -c '
  pg_restore --clean --if-exists --no-owner \
    -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$1/postgres.dump"
' sh "$backup_path"

docker compose exec -T clickhouse sh -c '
  set -eu
  backup_id="$1"
  case "$CLICKHOUSE_DB" in *[!A-Za-z0-9_]*) exit 2;; esac
  query="DROP DATABASE IF EXISTS $CLICKHOUSE_DB; RESTORE DATABASE $CLICKHOUSE_DB FROM Disk('\''backups'\'', '\''runs/$backup_id/clickhouse'\'')"
  clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --multiquery --query "$query"
' sh "$backup_id"

if docker compose exec -T postgres test -f "$backup_path/collector.sqlite.zst"; then
  docker compose run --rm --no-deps --entrypoint sh backup -c '
    zstd -dc "$1/collector.sqlite.zst" > /var/lib/argus/spool.sqlite
    chown 1000:1000 /var/lib/argus/spool.sqlite
    chmod 0600 /var/lib/argus/spool.sqlite
  ' sh "$backup_path"
elif docker compose exec -T postgres test -f "$backup_path/collector.sqlite"; then
  docker compose run --rm --no-deps --entrypoint sh backup -c '
    cp "$1/collector.sqlite" /var/lib/argus/spool.sqlite
    chown 1000:1000 /var/lib/argus/spool.sqlite
    chmod 0600 /var/lib/argus/spool.sqlite
  ' sh "$backup_path"
fi

docker compose start api
docker compose up -d collector backup
restore_ok=true
trap - EXIT INT TERM
echo "Backup $backup_id restaurado"
