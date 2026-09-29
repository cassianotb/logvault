#!/bin/sh
set -u

backup_root="${ARGUS_BACKUP_ROOT:-/backups}"
interval_hours="${ARGUS_BACKUP_INTERVAL_HOURS:-24}"

case "$interval_hours" in
  ''|*[!0-9]*) echo "ARGUS_BACKUP_INTERVAL_HOURS deve ser numérico" >&2; exit 1 ;;
esac
if [ "$interval_hours" -lt 1 ]; then
  echo "ARGUS_BACKUP_INTERVAL_HOURS deve ser pelo menos 1" >&2
  exit 1
fi

mkdir -p "$backup_root"
while true; do
  if /usr/local/bin/backup-once.sh; then
    rm -f "$backup_root/LAST_FAILURE.json"
  else
    failed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '{"failedAt":"%s"}\n' "$failed_at" > "$backup_root/LAST_FAILURE.json"
    chmod 0644 "$backup_root/LAST_FAILURE.json"
    echo "Backup falhou em $failed_at" >&2
  fi
  sleep "$((interval_hours * 3600))"
done
