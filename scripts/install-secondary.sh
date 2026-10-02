#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
system_installer="$script_dir/install-argus.sh"
env_file="$repo_root/.env"
primary_url=""
enrollment_token=""
site_name=""
prepare_only="false"
allow_insecure_http="false"
forwarded=()
response_file=""
request_file=""

usage() {
  cat <<'EOF'
Uso: scripts/install-secondary.sh [opções do sistema]

Instala uma segunda VM LogVault completa e independente. Ela recebe dados,
mantém bancos, painel, coletor Cloud e backups, mas inicia com a administração
em modo somente leitura.

  --primary-url URL          URL pública do servidor principal
  --enrollment-token TOKEN  código de uso único gerado no painel principal
  --site-name NOME          identificação da VM secundária
  --prepare-only            grava e valida sem iniciar/reiniciar os containers
  --allow-insecure-http     somente laboratório: permite pareamento sem HTTPS
  -h, --help                exibe esta ajuda

As demais opções são encaminhadas ao instalador normal, inclusive
--public-url, --admin-email, --admin-password-file e --data-root.
EOF
}

die() { printf 'ERRO: %s\n' "$*" >&2; exit 2; }
need_value() { [[ $# -ge 2 && -n "${2:-}" ]] || die "$1 exige um valor"; }
cleanup() {
  [[ -z "$response_file" || ! -f "$response_file" ]] || rm -f -- "$response_file"
  [[ -z "$request_file" || ! -f "$request_file" ]] || rm -f -- "$request_file"
}
trap cleanup EXIT

while (($#)); do
  case "$1" in
    --primary-url) need_value "$@"; primary_url="${2%/}"; shift 2 ;;
    --enrollment-token) need_value "$@"; enrollment_token="$2"; shift 2 ;;
    --site-name) need_value "$@"; site_name="$2"; shift 2 ;;
    --prepare-only) prepare_only="true"; forwarded+=(--no-apply); shift ;;
    --allow-insecure-http) allow_insecure_http="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) forwarded+=("$1"); shift ;;
  esac
done

if [[ -z "$primary_url" ]]; then
  [[ -t 0 ]] || die "--primary-url é obrigatória sem terminal interativo"
  read -r -p 'URL do servidor principal: ' primary_url
  primary_url="${primary_url%/}"
fi
[[ "$primary_url" =~ ^https://[^[:space:]]+$ || ( "$allow_insecure_http" == "true" && "$primary_url" =~ ^http://[^[:space:]]+$ ) ]] \
  || die "use uma URL HTTPS; HTTP exige --allow-insecure-http e deve ficar restrito ao laboratório"

if [[ -z "$enrollment_token" ]]; then
  [[ -t 0 ]] || die "--enrollment-token é obrigatório sem terminal interativo"
  read -r -s -p 'Código de pareamento gerado no servidor principal: ' enrollment_token
  printf '\n'
fi
[[ ${#enrollment_token} -ge 32 ]] || die "código de pareamento inválido"

bash "$system_installer" configure "${forwarded[@]}"

[[ -r "$env_file" ]] || die "o instalador não gerou $env_file"
secondary_public_url="$(sed -n 's/^ARGUS_PUBLIC_URL=//p' "$env_file" | tail -n 1)"
installed_server_name="$(sed -n 's/^ARGUS_FIREWALL_SERVER_NAME=//p' "$env_file" | tail -n 1)"
site_name="${site_name:-${installed_server_name:-Servidor secundário}}"
[[ "$secondary_public_url" =~ ^https?://[^[:space:]]+$ ]] || die "ARGUS_PUBLIC_URL da VM secundária está inválida"
command -v curl >/dev/null 2>&1 || die "curl é obrigatório"
command -v python3 >/dev/null 2>&1 || die "python3 é obrigatório para validar o pareamento"

request_file="$(mktemp)"
response_file="$(mktemp)"
chmod 0600 "$request_file" "$response_file"
python3 -c 'import json,sys; json.dump({"enrollmentToken":sys.argv[1],"siteName":sys.argv[2],"publicUrl":sys.argv[3]},sys.stdout)' \
  "$enrollment_token" "$site_name" "$secondary_public_url" >"$request_file"

printf 'Pareando a VM secundária com %s...\n' "$primary_url"
curl_protocol='=https'
[[ "$allow_insecure_http" != "true" ]] || curl_protocol='=http,https'
curl --fail --silent --show-error --proto "$curl_protocol" --tlsv1.2 \
  -H 'content-type: application/json' --data-binary "@$request_file" \
  "$primary_url/api/v1/redundancy/enroll" >"$response_file" \
  || die "o servidor principal recusou o pareamento; gere um novo código e tente novamente"

IFS=$'\t' read -r site_id site_token primary_site_id confirmed_primary_url < <(
  python3 -c 'import json,sys
p=json.load(open(sys.argv[1]))
required=("siteId","siteToken","primarySiteId","primaryUrl")
assert p.get("status")=="enrolled" and all(isinstance(p.get(k),str) and p[k] for k in required)
print("\t".join(p[k] for k in required))' "$response_file"
) || die "resposta de pareamento inválida"

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

set_env ARGUS_REDUNDANCY_ROLE secondary
set_env ARGUS_REDUNDANCY_SITE_ID "$site_id"
set_env ARGUS_REDUNDANCY_PRIMARY_SITE_ID "$primary_site_id"
set_env ARGUS_REDUNDANCY_SITE_NAME "$site_name"
set_env ARGUS_REDUNDANCY_PRIMARY_URL "$confirmed_primary_url"
set_env ARGUS_REDUNDANCY_SITE_TOKEN "$site_token"
chmod 0600 "$env_file"

if [[ "$prepare_only" == "true" ]]; then
  printf 'VM secundária pareada e preparada. Os serviços ainda não foram iniciados.\n'
  exit 0
fi

docker compose --env-file "$env_file" up -d --build --wait
printf 'VM secundária ativa em modo administrativo somente leitura.\n'
printf 'Configure os equipamentos para enviar NetFlow/Syslog diretamente aos dois IPs.\n'
