#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
command_name="configure"
if [[ $# -gt 0 && "${1:-}" != -* ]]; then
  command_name="$1"
  shift
fi

env_file="$repo_root/.env"
admin_name=""
admin_email=""
admin_password_file=""
data_root=""
backup_retention_days=""
timezone=""
server_name=""
domain=""
acme_email=""
tls_challenge=""
public_url=""
replication_bind=""
replication_cidr=""
apply="true"
assume_yes="false"

usage() {
  cat <<'EOF'
Uso: scripts/install-argus.sh configure [opções]

Sem opções, abre o assistente completo do Sistema LogVault. Ele cria o .env,
as credenciais internas, a conta administrativa e a estrutura de dados.

  --admin-name NOME             nome do administrador inicial
  --admin-email EMAIL           login do administrador inicial
  --admin-password-file ARQUIVO lê a senha inicial sem expô-la no comando
  --data-root DIRETÓRIO|docker  diretório persistente ou volumes Docker
  --backup-retention-days DIAS  retenção local dos backups (padrão: 15)
  --timezone FUSO               fuso IANA (padrão: America/Sao_Paulo)
  --public-url URL              URL final do painel (https://logs.exemplo.com)
  --domain DOMÍNIO              compatibilidade: domínio usado no certificado
  --acme-email EMAIL            contato usado na conta ACME/Let's Encrypt
  --tls-challenge MÉTODO        automatic, http-01 ou disabled
  --server-name NOME            identificação exibida no firewall
  --replication-bind IP         avançado: IP local de replicação (padrão: 127.0.0.1)
  --replication-cidr CIDR       avançado: rede autorizada (padrão: 127.0.0.1/32)
  --env-file ARQUIVO            arquivo de configuração (padrão: .env)
  --yes                         confirma o resumo sem nova pergunta
  --no-apply                    grava e valida, mas não inicia os containers
  -h, --help                    exibe esta ajuda

O instalador sobe o proxy Caddy, publica 80/443, emite e renova o certificado
automaticamente. Antes de executar, faça o DNS apontar para a VM e encaminhe
80/TCP e 443/TCP até ela. Os bancos e a API não são expostos diretamente. A
continuidade é preparada posteriormente em Plataforma → Continuidade.
EOF
}

die() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 2
}

need_value() {
  [[ $# -ge 2 && -n "${2:-}" ]] || die "$1 exige um valor"
}

valid_email() {
  [[ "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]
}

valid_domain() {
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$ ]]
}

is_ipv4() {
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

valid_password() {
  local value="$1" safe_pattern='^[-A-Za-z0-9@%+=:,._~!/ ]+$'
  [[ ${#value} -ge 15 && ${#value} -le 256 ]] || return 1
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || return 1
  [[ "$value" =~ $safe_pattern ]] || return 1
  case "$value" in
    change-me|argus|logvault|password|senha|troque-*|*senha-forte*) return 1 ;;
  esac
}

valid_uuid() {
  [[ "$1" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] &&
    [[ "$1" != "00000000-0000-0000-0000-000000000001" && "$1" != "00000000-0000-0000-0000-000000000000" ]]
}

valid_timezone() {
  [[ -n "$1" && ${#1} -le 80 && "$1" != /* && "$1" =~ ^[A-Za-z0-9_+./-]+$ && "$1" != *".."* ]] || return 1
  [[ ! -d /usr/share/zoneinfo || -f "/usr/share/zoneinfo/$1" ]]
}

read_env() {
  local key="$1" file="$2"
  [[ -f "$file" ]] || return 0
  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

random_hex() {
  local byte_count="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$byte_count"
  else
    od -An -N "$byte_count" -tx1 /dev/urandom | tr -d ' \n'
  fi
}

random_uuid() {
  local raw
  if [[ -r /proc/sys/kernel/random/uuid ]]; then
    read -r raw </proc/sys/kernel/random/uuid
    printf '%s' "$raw"
    return
  fi
  raw="$(random_hex 16)"
  printf '%s-%s-4%s-a%s-%s' "${raw:0:8}" "${raw:8:4}" "${raw:13:3}" "${raw:17:3}" "${raw:20:12}"
}

detect_primary_ipv4() {
  local route_info="" item next_is=""
  if command -v ip >/dev/null 2>&1; then route_info="$(ip -4 route get 1.1.1.1 2>/dev/null | head -n 1 || true)"; fi
  for item in $route_info; do
    if [[ "$next_is" == "src" ]]; then printf '%s' "$item"; return; fi
    [[ "$item" == "src" ]] && next_is="src"
  done
  hostname -I 2>/dev/null | awk '{ print $1 }' || true
}

is_placeholder_secret() {
  case "$1" in
    ''|argus|change-me|troque-*|*senha-forte*) return 0 ;;
    *) return 1 ;;
  esac
}

ask() {
  local prompt="$1" default_value="$2" answer=""
  if [[ -n "$default_value" ]]; then
    read -r -p "$prompt [$default_value]: " answer
  else
    read -r -p "$prompt: " answer
  fi
  printf '%s' "${answer:-$default_value}"
}

ask_password() {
  local first="" second=""
  printf 'Use uma frase-senha com 15 a 256 caracteres. Espaços e símbolos seguros são aceitos.\n' >&2
  while true; do
    read -r -s -p 'Senha inicial do administrador: ' first
    printf '\n' >&2
    read -r -s -p 'Confirme a senha: ' second
    printf '\n' >&2
    if [[ "$first" != "$second" ]]; then
      printf 'As senhas não coincidem. Tente novamente.\n' >&2
      continue
    fi
    if ! valid_password "$first"; then
      printf 'Senha não aceita: use 15 a 256 caracteres, sem aspas, # ou barra invertida, e evite senhas comuns.\n' >&2
      continue
    fi
    printf '%s' "$first"
    return
  done
}

while (($#)); do
  case "$1" in
    --admin-name) need_value "$@"; admin_name="$2"; shift 2 ;;
    --admin-email) need_value "$@"; admin_email="$2"; shift 2 ;;
    --admin-password-file) need_value "$@"; admin_password_file="$2"; shift 2 ;;
    --data-root) need_value "$@"; data_root="$2"; shift 2 ;;
    --backup-retention-days) need_value "$@"; backup_retention_days="$2"; shift 2 ;;
    --timezone) need_value "$@"; timezone="$2"; shift 2 ;;
    --domain) need_value "$@"; domain="$2"; shift 2 ;;
    --acme-email) need_value "$@"; acme_email="$2"; shift 2 ;;
    --tls-challenge) need_value "$@"; tls_challenge="$2"; shift 2 ;;
    --public-url) need_value "$@"; public_url="$2"; shift 2 ;;
    --server-name) need_value "$@"; server_name="$2"; shift 2 ;;
    --replication-bind) need_value "$@"; replication_bind="$2"; shift 2 ;;
    --replication-cidr) need_value "$@"; replication_cidr="$2"; shift 2 ;;
    --env-file) need_value "$@"; env_file="$2"; shift 2 ;;
    --yes) assume_yes="true"; shift ;;
    --no-apply) apply="false"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done

[[ "$command_name" == "configure" ]] || { usage >&2; die "comando desconhecido: $command_name"; }

umask 077
env_existed="false"
if [[ -s "$env_file" ]]; then env_existed="true"; fi
interactive="false"
if [[ -t 0 ]]; then interactive="true"; fi

existing_admin_name="$(read_env ARGUS_BOOTSTRAP_ADMIN_NAME "$env_file")"
existing_admin_email="$(read_env ARGUS_BOOTSTRAP_ADMIN_EMAIL "$env_file")"
existing_admin_password="$(read_env ARGUS_BOOTSTRAP_ADMIN_PASSWORD "$env_file")"
existing_data_root="$(read_env ARGUS_DATA_ROOT "$env_file")"
existing_retention="$(read_env ARGUS_BACKUP_RETENTION_DAYS "$env_file")"
existing_timezone="$(read_env ARGUS_DEVICE_TIMEZONE "$env_file")"
existing_server_name="$(read_env ARGUS_FIREWALL_SERVER_NAME "$env_file")"
existing_domain="$(read_env ARGUS_TLS_DOMAIN "$env_file")"
existing_acme_email="$(read_env ARGUS_TLS_EMAIL "$env_file")"
existing_tls_challenge="$(read_env ARGUS_TLS_CHALLENGE "$env_file")"
existing_public_url="$(read_env ARGUS_PUBLIC_URL "$env_file")"
existing_replication_bind="$(read_env ARGUS_DR_REPLICATION_BIND "$env_file")"
existing_replication_cidr="$(read_env ARGUS_DR_REPLICATION_CIDR "$env_file")"

admin_name="${admin_name:-${existing_admin_name:-Administrador}}"
admin_email="${admin_email:-$existing_admin_email}"
data_root="${data_root:-$existing_data_root}"
backup_retention_days="${backup_retention_days:-${existing_retention:-15}}"
timezone="${timezone:-${existing_timezone:-America/Sao_Paulo}}"
server_name="${server_name:-${existing_server_name:-Servidor principal · DC-A}}"
domain="${domain:-$existing_domain}"
acme_email="${acme_email:-$existing_acme_email}"
tls_challenge="${tls_challenge:-${existing_tls_challenge:-disabled}}"
public_url="${public_url:-$existing_public_url}"
if [[ "$public_url" =~ ^http://([^/:]+):8081/?$ ]]; then public_url="http://${BASH_REMATCH[1]}"; fi
replication_bind="${replication_bind:-${existing_replication_bind:-127.0.0.1}}"
replication_cidr="${replication_cidr:-${existing_replication_cidr:-127.0.0.1/32}}"

if [[ "$interactive" == "true" ]]; then
  printf '\nConfiguração do Sistema LogVault\n'
  printf 'Os segredos internos serão gerados automaticamente e não serão exibidos.\n\n'
  admin_name="$(ask 'Nome do administrador inicial' "$admin_name")"
  admin_email="$(ask 'E-mail do administrador inicial' "$admin_email")"
fi

admin_password=""
if [[ -n "$admin_password_file" ]]; then
  [[ -r "$admin_password_file" ]] || die "não foi possível ler --admin-password-file"
  [[ $(wc -c <"$admin_password_file") -le 4096 ]] || die "arquivo de senha excede 4 KiB"
  admin_password="$(<"$admin_password_file")"
elif valid_password "$existing_admin_password"; then
  admin_password="$existing_admin_password"
elif [[ "$interactive" == "true" ]]; then
  admin_password="$(ask_password)"
else
  die "instalação nova exige --admin-password-file (a senha não deve ser passada na linha de comando)"
fi

if [[ "$interactive" == "true" ]]; then
  backup_retention_days="$(ask 'Retenção dos backups locais em dias' "$backup_retention_days")"
  timezone="$(ask 'Fuso horário dos equipamentos' "$timezone")"
  server_name="$(ask 'Nome deste servidor' "$server_name")"
  if [[ -z "$public_url" ]]; then
    if [[ -n "$domain" ]]; then public_url="https://$domain";
    else detected_public_ip="$(detect_primary_ipv4)"; public_url="http://${detected_public_ip:-127.0.0.1}"; fi
  fi
  public_url="$(ask 'URL pública do painel' "$public_url")"
  public_url="${public_url%/}"
  if [[ "$public_url" != *://* ]]; then
    if is_ipv4 "$public_url" || [[ "$public_url" == "localhost" ]]; then public_url="http://$public_url"
    else public_url="https://$public_url"; fi
  fi
  if [[ "$public_url" == https://* ]]; then
    tls_challenge="http-01"
    acme_email="$(ask 'E-mail para emissão e renovação do certificado' "$acme_email")"
  else
    tls_challenge="disabled"
  fi
fi

if [[ -z "$data_root" ]]; then
  if [[ "$env_existed" == "true" ]]; then data_root="docker"; else data_root="/var/lib/logvault"; fi
fi

[[ -n "$admin_name" && ${#admin_name} -le 120 ]] || die "nome do administrador inválido"
[[ "$admin_name" != *"#"* && "$admin_name" != *"="* && "$admin_name" != *$'\n'* && "$admin_name" != *$'\r'* ]] || die "nome do administrador contém caracteres inválidos"
valid_email "$admin_email" || die "e-mail do administrador inválido"
valid_password "$admin_password" || die "senha inicial fraca ou inválida; use 15 a 256 caracteres, sem aspas, # ou barra invertida"
[[ "$backup_retention_days" =~ ^[0-9]+$ ]] || die "retenção deve ser um número de dias"
(( backup_retention_days >= 1 && backup_retention_days <= 3650 )) || die "retenção deve ficar entre 1 e 3650 dias"
valid_timezone "$timezone" || die "fuso horário inválido"
[[ "$replication_bind" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "IP local de replicação inválido"
[[ "$replication_cidr" =~ ^[0-9A-Fa-f:.]+/[0-9]{1,3}$ ]] || die "CIDR de replicação inválido"
[[ -n "$server_name" && ${#server_name} -le 120 ]] || die "nome do servidor inválido"
[[ "$server_name" != *"#"* && "$server_name" != *"="* && "$server_name" != *$'\n'* && "$server_name" != *$'\r'* ]] || die "nome do servidor contém caracteres inválidos"

if [[ "$data_root" == "docker" ]]; then
  postgres_data_path="postgres-data"
  clickhouse_data_path="clickhouse-data"
  collector_data_path="collector-data"
  backup_data_path="backup-data"
else
  [[ "$data_root" == /* && "$data_root" != "/" ]] || die "--data-root deve ser 'docker' ou um diretório absoluto seguro"
  [[ "$data_root" != *":"* && "$data_root" != *".."* && "$data_root" != *[[:space:]]* ]] || die "diretório de dados contém caracteres inválidos"
  data_root="${data_root%/}"
  postgres_data_path="$data_root/postgres"
  clickhouse_data_path="$data_root/clickhouse"
  collector_data_path="$data_root/collector"
  backup_data_path="$data_root/backups"
fi

[[ "$tls_challenge" != "automatic" ]] || tls_challenge="http-01"
if [[ -z "$public_url" ]]; then
  if [[ -n "$domain" ]]; then
    if [[ "$tls_challenge" == "disabled" ]]; then public_url="http://$domain";
    else public_url="https://$domain"; fi
  else
    detected_public_ip="$(detect_primary_ipv4)"
    public_url="http://${detected_public_ip:-127.0.0.1}"
  fi
fi
public_url="${public_url%/}"
if [[ -n "$public_url" && "$public_url" != *://* ]]; then
  if is_ipv4 "$public_url" || [[ "$public_url" == "localhost" ]]; then public_url="http://$public_url"
  else public_url="https://$public_url"; fi
fi
if [[ "$public_url" =~ ^https://([A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9])$ ]]; then
  public_host="${BASH_REMATCH[1],,}"
  domain="$public_host"
  tls_challenge="http-01"
  valid_domain "$domain" || die "domínio da URL pública inválido"
  ! is_ipv4 "$domain" || die "HTTPS automático exige um nome DNS, não um endereço IP"
  [[ "$domain" != "localhost" && "$domain" != *.local && "$domain" != *.internal ]] \
    || die "HTTPS automático exige um domínio público"
  valid_email "$acme_email" || die "--acme-email válido é obrigatório para emitir o certificado"
  proxy_config="Caddyfile.https"
  cookie_secure="true"
elif [[ "$public_url" =~ ^http://([A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9])$ ]]; then
  public_host="${BASH_REMATCH[1],,}"
  domain=""
  tls_challenge="disabled"
  proxy_config="Caddyfile.http"
  cookie_secure="false"
else
  die "URL pública inválida; use somente http://IP ou https://dominio sem porta ou caminho"
fi
[[ "$tls_challenge" =~ ^(http-01|disabled)$ ]] || die "método TLS inválido; use automatic, http-01 ou disabled"
if [[ -n "$acme_email" ]]; then valid_email "$acme_email" || die "e-mail ACME inválido"; fi
dr_site_a_host="$(read_env ARGUS_DR_SITE_A_HOST "$env_file")"
if [[ -z "$dr_site_a_host" ]]; then dr_site_a_host="$(read_env ARGUS_DR_SITE_A_PRIVATE_HOST "$env_file")"; fi
if [[ -z "$dr_site_a_host" ]]; then dr_site_a_host="$(hostname -f 2>/dev/null || true)"; fi
if [[ -z "$dr_site_a_host" ]]; then dr_site_a_host="$(detect_primary_ipv4)"; fi
dr_panel_host="$(read_env ARGUS_DR_PANEL_HOST "$env_file")"; dr_panel_host="${dr_panel_host:-$public_host}"
dr_ingest_host="$(read_env ARGUS_DR_INGEST_HOST "$env_file")"; dr_ingest_host="${dr_ingest_host:-$public_host}"
dr_control_host="$(read_env ARGUS_DR_CONTROL_HOST "$env_file")"; dr_control_host="${dr_control_host:-$public_host}"

postgres_password="$(read_env ARGUS_POSTGRES_PASSWORD "$env_file")"
postgres_url="$(read_env ARGUS_POSTGRES_URL "$env_file")"
if is_placeholder_secret "$postgres_password"; then
  postgres_password="$(random_hex 24)"
  postgres_url="postgres://argus:${postgres_password}@postgres:5432/argus"
elif [[ -z "$postgres_url" ]]; then
  postgres_url="postgres://argus:${postgres_password}@postgres:5432/argus"
fi
clickhouse_password="$(read_env ARGUS_CLICKHOUSE_PASSWORD "$env_file")"
if is_placeholder_secret "$clickhouse_password"; then clickhouse_password="$(random_hex 24)"; fi
sync_token="$(read_env ARGUS_SYNC_TOKEN "$env_file")"
if is_placeholder_secret "$sync_token"; then sync_token="$(random_hex 32)"; fi
alert_key="$(read_env ARGUS_ALERT_ENCRYPTION_KEY "$env_file")"
if is_placeholder_secret "$alert_key" || [[ ${#alert_key} -lt 32 ]]; then alert_key="$(random_hex 32)"; fi
replication_password="$(read_env ARGUS_DR_POSTGRES_REPLICATION_PASSWORD "$env_file")"
if is_placeholder_secret "$replication_password" || [[ ! "$replication_password" =~ ^[A-Fa-f0-9]{32,128}$ ]]; then replication_password="$(random_hex 32)"; fi
tenant_id="$(read_env ARGUS_TENANT_ID "$env_file")"
if ! valid_uuid "$tenant_id"; then tenant_id="$(random_uuid)"; fi
collector_id="$(read_env ARGUS_COLLECTOR_ID "$env_file")"
if ! valid_uuid "$collector_id"; then collector_id="$(random_uuid)"; fi
device_id="$(read_env ARGUS_DEVICE_ID "$env_file")"
if ! valid_uuid "$device_id"; then device_id="$(random_uuid)"; fi

printf '\nResumo da instalação\n'
printf '  Administrador: %s <%s>\n' "$admin_name" "$admin_email"
printf '  Dados: %s\n' "$data_root"
printf '  Backups locais: %s dias\n' "$backup_retention_days"
printf '  Fuso horário: %s\n' "$timezone"
printf '  URL pública: %s\n' "$public_url"
if [[ "$tls_challenge" == "http-01" ]]; then
  printf '  HTTPS: automático, com emissão e renovação pelo Caddy\n'
  printf '  Pré-requisito externo: DNS de %s e portas 80/443 apontando para esta VM\n' "$domain"
else
  printf '  HTTPS: desativado; proxy HTTP integrado na porta 80\n'
fi
printf '  Serviços internos: painel 127.0.0.1:8081 · API 127.0.0.1:8080\n'
printf '  Acesso direto: qualquer IP de origem em 80/TCP e 443/TCP\n'
printf '  Credenciais internas: geração automática protegida\n\n'
printf '  Continuidade: desativada; o DC-B será cadastrado posteriormente pelo painel\n\n'

if [[ "$interactive" == "true" && "$assume_yes" != "true" ]]; then
  answer=""
  read -r -p 'Gravar esta configuração e continuar? [S/n]: ' answer
  case "$answer" in
    n|N|nao|não|NAO|NÃO) printf 'Instalação cancelada.\n'; exit 0 ;;
  esac
fi

mkdir -p "$(dirname "$env_file")"
if [[ "$env_existed" == "true" ]]; then
  cp -p "$env_file" "$env_file.bak"
  chmod 0600 "$env_file.bak"
  printf 'Cópia da configuração anterior: %s\n' "$env_file.bak"
else
  [[ -r "$repo_root/.env.example" ]] || die "modelo .env.example não encontrado"
  cp "$repo_root/.env.example" "$env_file"
fi
chmod 0600 "$env_file"

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

set_env ARGUS_ENV production
set_env ARGUS_DATA_ROOT "$data_root"
set_env ARGUS_POSTGRES_DATA_PATH "$postgres_data_path"
set_env ARGUS_CLICKHOUSE_DATA_PATH "$clickhouse_data_path"
set_env ARGUS_COLLECTOR_DATA_PATH "$collector_data_path"
set_env ARGUS_BACKUP_DATA_PATH "$backup_data_path"
if [[ "$data_root" == "docker" ]]; then
  tenant_backup_data_path="tenant-backup-data"
  backup_staging_data_path="backup-staging-data"
else
  tenant_backup_data_path="/var/lib/logvault/tenant-backups"
  backup_staging_data_path="/var/lib/logvault/backup-staging"
fi
set_env ARGUS_TENANT_BACKUP_DATA_PATH "$tenant_backup_data_path"
set_env ARGUS_BACKUP_STAGING_DATA_PATH "$backup_staging_data_path"
if [[ "$data_root" == "docker" ]]; then
  proxy_data_path="proxy-data"
  proxy_config_path="proxy-config"
else
  proxy_data_path="$data_root/proxy-data"
  proxy_config_path="$data_root/proxy-config"
fi
set_env ARGUS_PROXY_DATA_PATH "$proxy_data_path"
set_env ARGUS_PROXY_CONFIG_PATH "$proxy_config_path"
set_env ARGUS_API_BIND 127.0.0.1
set_env ARGUS_WEB_BIND 127.0.0.1
set_env ARGUS_HTTP_BIND 0.0.0.0
set_env ARGUS_HTTPS_BIND 0.0.0.0
set_env ARGUS_COLLECTOR_BIND 0.0.0.0
set_env ARGUS_POSTGRES_PASSWORD "$postgres_password"
set_env ARGUS_POSTGRES_URL "$postgres_url"
set_env ARGUS_CLICKHOUSE_PASSWORD "$clickhouse_password"
set_env ARGUS_TENANT_ID "$tenant_id"
set_env ARGUS_COLLECTOR_ID "$collector_id"
set_env ARGUS_DEVICE_ID "$device_id"
set_env ARGUS_DEVICE_VENDOR unregistered
set_env ARGUS_DEVICE_TIMEZONE "$timezone"
set_env ARGUS_DEVICES_JSON '[]'
set_env ARGUS_SYNC_TOKEN "$sync_token"
set_env ARGUS_ALERT_ENCRYPTION_KEY "$alert_key"
set_env ARGUS_BOOTSTRAP_ADMIN_NAME "$admin_name"
set_env ARGUS_BOOTSTRAP_ADMIN_EMAIL "$admin_email"
set_env ARGUS_BOOTSTRAP_ADMIN_PASSWORD "$admin_password"
set_env ARGUS_BACKUP_RETENTION_DAYS "$backup_retention_days"
set_env ARGUS_FIREWALL_SERVER_NAME "$server_name"
set_env ARGUS_TLS_DOMAIN "$domain"
set_env ARGUS_TLS_EMAIL "$acme_email"
set_env ARGUS_TLS_CHALLENGE "$tls_challenge"
set_env ARGUS_PROXY_CONFIG "$proxy_config"
set_env ARGUS_PUBLIC_URL "$public_url"
set_env ARGUS_COOKIE_SECURE "$cookie_secure"
set_env ARGUS_DR_LOCAL_SITE a
set_env ARGUS_DR_LOCAL_HOSTNAME logvault-dc-a
set_env ARGUS_DR_PREPARED false
set_env ARGUS_DR_REPLICATION_BIND "$replication_bind"
set_env ARGUS_DR_REPLICATION_CIDR "$replication_cidr"
set_env ARGUS_DR_POSTGRES_REPLICATION_PASSWORD "$replication_password"
set_env ARGUS_DR_POSTGRES_WAL_KEEP_SIZE 2GB
set_env ARGUS_DR_REPOSITORY_URL https://github.com/cassianotb/logvault.git
set_env ARGUS_DR_REPOSITORY_REF main
set_env ARGUS_DR_SITE_A_HOST "$dr_site_a_host"
set_env ARGUS_DR_PANEL_HOST "$dr_panel_host"
set_env ARGUS_DR_INGEST_HOST "$dr_ingest_host"
set_env ARGUS_DR_CONTROL_HOST "$dr_control_host"
set_env ARGUS_DR_DNS_PROVIDER manual
set_env ARGUS_DR_DNS_TTL_SECONDS 300
control_root="/var/lib/logvault/control"
set_env ARGUS_CONTINUITY_CONTROL_PATH "$control_root"

printf 'Configuração completa gravada em %s (permissão 0600).\n' "$env_file"

if [[ "$apply" != "true" ]]; then
  printf 'Preparação concluída; nenhum serviço foi iniciado.\n'
  exit 0
fi

command -v docker >/dev/null 2>&1 || die "Docker não encontrado; use --no-apply para apenas gravar"
docker compose version >/dev/null 2>&1 || die "Docker com o plugin Compose é obrigatório"
[[ $(id -u) -eq 0 ]] || die "a instalação completa deve ser executada com sudo"

if ! command -v curl >/dev/null 2>&1; then
  if [[ $(id -u) -eq 0 ]] && command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y curl ca-certificates
  else
    die "curl é obrigatório para validar a publicação; instale-o e execute novamente"
  fi
fi

if [[ "$tls_challenge" == "http-01" ]]; then
  getent ahosts "$domain" >/dev/null 2>&1 || die "o domínio $domain ainda não resolve em DNS"
fi

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
  ufw allow 80/tcp comment 'LogVault HTTP/ACME'
  ufw allow 443/tcp comment 'LogVault HTTPS'
elif command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --permanent --add-service=http
  firewall-cmd --permanent --add-service=https
  firewall-cmd --reload
fi

if [[ "$data_root" != "docker" ]]; then
  install -d -m 0750 "$postgres_data_path" "$clickhouse_data_path" "$collector_data_path" "$backup_data_path" "$proxy_data_path" "$proxy_config_path"
  if [[ $(id -u) -eq 0 ]]; then chown 1000:1000 "$collector_data_path"; fi
fi
install -d -o 1000 -g 1000 -m 0770 "$control_root"
if [[ "$data_root" != "docker" ]]; then
  install -d -o 1000 -g 1000 -m 0750 "$tenant_backup_data_path" "$backup_staging_data_path"
fi
"$repo_root/scripts/install-continuity-agent.sh" "$repo_root" "$env_file" "$control_root"

(
  cd "$repo_root"
  ARGUS_ENV_FILE="$env_file" docker compose --env-file "$env_file" config --quiet
  ARGUS_ENV_FILE="$env_file" docker compose --env-file "$env_file" up -d --build
  ARGUS_ENV_FILE="$env_file" docker compose --env-file "$env_file" ps
)

publication_ready="false"
for attempt in $(seq 1 60); do
  if [[ "$tls_challenge" == "http-01" ]]; then
    if curl --silent --show-error --fail --resolve "$domain:443:127.0.0.1" "$public_url/" >/dev/null 2>&1; then
      publication_ready="true"
      break
    fi
  elif curl --silent --show-error --fail http://127.0.0.1/ >/dev/null 2>&1; then
    publication_ready="true"
    break
  fi
  sleep 2
done
if [[ "$publication_ready" != "true" ]]; then
  (cd "$repo_root" && ARGUS_ENV_FILE="$env_file" docker compose --env-file "$env_file" logs --tail=80 proxy >&2) || true
  die "o proxy não conseguiu validar $public_url; confirme DNS, NAT e portas 80/443"
fi
printf 'Sistema LogVault instalado. Acesse %s e entre com %s.\n' "$public_url" "$admin_email"
