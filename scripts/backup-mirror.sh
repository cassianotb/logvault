#!/bin/sh
set -eu

backup_id="${1:-}"
backup_root="${ARGUS_BACKUP_ROOT:-/backups}"
remote_target="${ARGUS_BACKUP_REMOTE_TARGET:-}"
remote_port="${ARGUS_BACKUP_REMOTE_PORT:-22}"
ssh_key="${ARGUS_BACKUP_REMOTE_SSH_KEY:-/run/secrets/argus_backup_ssh_key}"
known_hosts="${ARGUS_BACKUP_REMOTE_KNOWN_HOSTS:-/run/secrets/argus_backup_known_hosts}"

case "$backup_id" in
  ????????T??????Z) ;;
  *) echo "ID de backup inválido" >&2; exit 2 ;;
esac
case "$backup_id" in
  *[!0-9TZ]*) echo "ID de backup inválido" >&2; exit 2 ;;
esac
case "$remote_port" in
  ''|*[!0-9]*) echo "ARGUS_BACKUP_REMOTE_PORT deve ser numérico" >&2; exit 2 ;;
esac
if [ "$remote_port" -lt 1 ] || [ "$remote_port" -gt 65535 ]; then
  echo "ARGUS_BACKUP_REMOTE_PORT fora do intervalo válido" >&2
  exit 2
fi
if ! printf '%s\n' "$remote_target" | grep -Eq '^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:/[A-Za-z0-9._/-]+$'; then
  echo "ARGUS_BACKUP_REMOTE_TARGET deve usar usuario@host:/caminho/absoluto" >&2
  exit 2
fi
if [ ! -r "$ssh_key" ] || [ ! -r "$known_hosts" ]; then
  echo "Chave SSH ou known_hosts da cópia externa não estão disponíveis" >&2
  exit 2
fi

run_dir="$backup_root/runs/$backup_id"
test -r "$run_dir/COMPLETE"
ssh_command="ssh -p $remote_port -i $ssh_key -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$known_hosts"
base_backup_id="$(jq -r '.baseBackupId // empty' "$run_dir/metadata.json" 2>/dev/null || true)"
if [ -n "$base_backup_id" ]; then
  case "$base_backup_id" in
    ????????T??????Z) ;;
    *) echo "Base incremental inválida" >&2; exit 2 ;;
  esac
  base_dir="$backup_root/runs/$base_backup_id"
  test -r "$base_dir/COMPLETE"
  rsync -a --partial --protect-args -e "$ssh_command" "$base_dir/" "${remote_target%/}/$base_backup_id/"
fi
rsync -a --partial --protect-args -e "$ssh_command" "$run_dir/" "${remote_target%/}/$backup_id/"

copied_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '{"backupId":"%s","copiedAt":"%s"}\n' "$backup_id" "$copied_at" > "$backup_root/LAST_REMOTE_SUCCESS.json"
chmod 0644 "$backup_root/LAST_REMOTE_SUCCESS.json"
echo "Cópia externa do backup $backup_id concluída"
