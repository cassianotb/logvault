#!/usr/bin/env bash
set -Eeuo pipefail

failure_message=""
die() { failure_message="$*"; printf '%s\n' "$failure_message" >&2; exit 2; }
read_request() { sed -n "s/^${1}=//p" "$request_file" | tail -n 1; }
read_env() { sed -n "s/^${1}=//p" "$env_file" | tail -n 1; }

repo_root="${LOGVAULT_REPO_ROOT:?LOGVAULT_REPO_ROOT ausente}"
env_file="${LOGVAULT_ENV_FILE:?LOGVAULT_ENV_FILE ausente}"
control_root="${LOGVAULT_CONTROL_ROOT:?LOGVAULT_CONTROL_ROOT ausente}"
request_file="$control_root/request.env"
response_file="$control_root/response.env"
lock_file="$control_root/agent.lock"

[[ $(id -u) -eq 0 ]] || die "o agente de continuidade exige root"
[[ -r "$env_file" && -d "$repo_root" ]] || die "instalação do LogVault não encontrada"
[[ -f "$request_file" ]] || exit 0
exec 9>"$lock_file"
flock -n 9 || die "outra preparação de continuidade está em andamento"

nonce="$(read_request nonce)"
site_a_host="$(read_request site_a_host)"
site_b_host="$(read_request site_b_host)"
rm -f "$request_file"

write_response() {
  local status="$1" message="${2:-}" bind="${3:-}" cidr="${4:-}" temporary
  message="${message//$'\n'/ }"; message="${message//$'\r'/ }"
  temporary="$(mktemp "$control_root/.response.XXXXXX")"
  printf 'nonce=%s\nstatus=%s\nmessage=%s\nbind=%s\ncidr=%s\n' "$nonce" "$status" "$message" "$bind" "$cidr" >"$temporary"
  chown 1000:1000 "$temporary"
  chmod 0660 "$temporary"
  mv "$temporary" "$response_file"
}
trap 'code=$?; if (( code != 0 )); then write_response error "${failure_message:-falha ao preparar o DC-A (código $code)}"; fi' EXIT

[[ "$nonce" =~ ^[A-Fa-f0-9]{32,128}$ ]] || die "nonce inválido"
for host in "$site_a_host" "$site_b_host"; do
  [[ "$host" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || die "hostname inválido"
done

resolve_ipv4() {
  local host="$1"
  getent ahostsv4 "$host" | awk 'NR == 1 { print $1 }'
}
site_a_ip="$(resolve_ipv4 "$site_a_host")"
site_b_ip="$(resolve_ipv4 "$site_b_host")"
[[ "$site_a_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "não foi possível resolver o IPv4 do DC-A"
[[ "$site_b_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "não foi possível resolver o IPv4 do DC-B"
ip -4 -o address show | awk '{ sub(/\/.*/, "", $4); print $4 }' | grep -Fqx "$site_a_ip" \
  || die "o endereço do DC-A não pertence a esta VM"

set_env() {
  local key="$1" value="$2" temporary
  temporary="$(mktemp "${env_file}.XXXXXX")"
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    $0 ~ "^" key "=" { if (!found) print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$env_file" >"$temporary"
  chmod 0600 "$temporary"
  mv "$temporary" "$env_file"
}

set_env ARGUS_DR_SITE_A_HOST "$site_a_host"
set_env ARGUS_DR_REPLICATION_BIND "$site_a_ip"
set_env ARGUS_DR_REPLICATION_CIDR "$site_b_ip/32"

cd "$repo_root"
compose=(docker compose --env-file "$env_file")
"${compose[@]}" up -d --force-recreate --wait postgres clickhouse
ARGUS_ENV_FILE="$env_file" ARGUS_SKIP_CONTINUITY_AGENT_INSTALL=true "$repo_root/scripts/prepare-dc-a.sh"
set_env ARGUS_DR_PREPARED true

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
  for port in 5432 8123 9000; do ufw allow from "$site_b_ip" to "$site_a_ip" port "$port" proto tcp comment 'LogVault DR'; done
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  for port in 5432 8123 9000; do
    firewall-cmd --permanent --add-rich-rule="rule family=ipv4 source address=$site_b_ip/32 destination address=$site_a_ip port port=$port protocol=tcp accept"
  done
  firewall-cmd --reload
fi

write_response ok "DC-A preparado para o DC-B" "$site_a_ip" "$site_b_ip/32"
trap - EXIT
