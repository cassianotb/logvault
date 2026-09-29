#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
command_name="${1:-}"
if [[ -n "$command_name" ]]; then shift; fi

if [[ -f "$repo_root/package.json" ]]; then output_dir="$repo_root/artifacts/dc-b-installation"
else output_dir="/var/lib/argus-bootstrap"; fi
site_a_name="Data Center A"
site_b_name="Data Center B"
site_b_host=""
site_a_host=""
panel_host=""
ingest_host=""
dr_control_host=""
dns_provider="manual"
dns_ttl=300
tls="false"
postgres_port=5432
clickhouse_port=8123
api_port=8082
minimum_vcpu=8
minimum_memory_gb=16
minimum_system_disk_gb=50
minimum_postgres_disk_gb=50
minimum_clickhouse_disk_gb=100
postgres_path="/var/lib/postgresql"
clickhouse_path="/var/lib/clickhouse"
force="false"
argus_url=""
allow_http="false"
simulation="false"
output_was_set="false"
enrollment_token_file=""
prepare_only="false"
assume_yes="false"
allow_unresolved_hosts="false"
install_root="/opt/logvault"
repository_url=""
repository_ref=""
sync_timeout_seconds=3600
skip_docker_install="false"
detected_private_host=""
detected_interface=""
detected_gateway=""
detected_hostname=""

usage() {
  cat <<'EOF'
Uso: scripts/install-dc-b.sh COMANDO [opções]

Comandos:
  install            abre o assistente e integra esta VM ao LogVault principal
  preflight          inventaria a VM e valida os requisitos sem alterá-la
  prepare            executa o preflight e gera o pacote seguro de cadastro
  enroll             prepara e envia o inventário usando um token de uso único
  show-registration  exibe a cópia local dos endpoints cadastrados

Opções principais:
  --site-a-host HOST            DNS/FQDN estável do DC-A
  --site-b-host HOST            DNS/FQDN estável do DC-B
  --site-a-private-host HOST    alias compatível de --site-a-host
  --private-host HOST           alias compatível de --site-b-host
  --panel-host HOST             hostname público permanente do painel
  --ingest-host HOST            hostname público permanente de ingestão
  --dr-control-host HOST        hostname do controlador independente no DC-B
  --dns-provider NOME           provedor/integração DNS (padrão: manual)
  --dns-ttl SEGUNDOS            TTL planejado para painel/ingestão (padrão: 300)
  --site-a-name NOME            nome do site ativo
  --site-b-name NOME            nome do site standby
  --output DIRETÓRIO            destino do pacote (padrão: artifacts/dc-b-installation)
  --tls true|false              reservado para endpoints internos com TLS configurado
  --postgres-port PORTA         padrão 5432
  --clickhouse-port PORTA       padrão 8123 na rede segura entre os DCs
  --api-port PORTA              agente standby, padrão 8082 na rede segura
  --postgres-path CAMINHO       caminho do PostgreSQL (padrão: /var/lib/postgresql)
  --clickhouse-path CAMINHO     caminho do ClickHouse (padrão: /var/lib/clickhouse)
  --minimum-vcpu N              mínimo 8
  --minimum-memory-gb N         mínimo 16
  --minimum-system-disk-gb N    mínimo 50
  --minimum-postgres-disk-gb N  mínimo 50
  --minimum-clickhouse-disk-gb N mínimo 100
  --force                       substitui um pacote ainda não utilizado
  --argus-url URL               endereço público do Argus (obrigatório em enroll)
  --enrollment-token-file ARQ   lê o token de uso único sem expô-lo no comando
  --prepare-only                valida e gera o pacote, sem consumir o token
  --yes                         confirma o resumo sem nova pergunta
  --allow-http                  somente para laboratório local; produção exige HTTPS
  --allow-unresolved-hosts      somente para laboratório antes da criação do DNS
  --install-root DIRETÓRIO      checkout do LogVault no DC-B (padrão: /opt/logvault)
  --repository-url URL          sobrescreve a origem Git enviada pelo DC-A
  --repository-ref REF          sobrescreve a branch/tag enviada pelo DC-A
  --sync-timeout SEGUNDOS       espera máxima da carga inicial (padrão: 3600)
  --skip-docker-install         exige Docker existente em vez de instalá-lo via APT
  --simulation                  usa o DC-B isolado do projeto argus-dr-lab

O comando install executa o preflight e o cadastro seguro. Ele não promove o
DC-B nem direciona tráfego para esta VM.
EOF
}

die() { printf 'ERRO: %s\n' "$*" >&2; exit 2; }
is_uint() { [[ "$1" =~ ^[0-9]+$ ]] && (( 10#$1 > 0 )); }
valid_host() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._:-]*$ ]]; }

while (($#)); do
  case "$1" in
    --site-a-host|--site-a-private-host) site_a_host="${2:-}"; shift 2 ;;
    --site-b-host|--private-host) site_b_host="${2:-}"; shift 2 ;;
    --panel-host) panel_host="${2:-}"; shift 2 ;;
    --ingest-host) ingest_host="${2:-}"; shift 2 ;;
    --dr-control-host) dr_control_host="${2:-}"; shift 2 ;;
    --dns-provider) dns_provider="${2:-}"; shift 2 ;;
    --dns-ttl) dns_ttl="${2:-}"; shift 2 ;;
    --site-a-name) site_a_name="${2:-}"; shift 2 ;;
    --site-b-name) site_b_name="${2:-}"; shift 2 ;;
    --output) output_dir="${2:-}"; output_was_set="true"; shift 2 ;;
    --tls) tls="${2:-}"; shift 2 ;;
    --postgres-port) postgres_port="${2:-}"; shift 2 ;;
    --clickhouse-port) clickhouse_port="${2:-}"; shift 2 ;;
    --api-port) api_port="${2:-}"; shift 2 ;;
    --postgres-path) postgres_path="${2:-}"; shift 2 ;;
    --clickhouse-path) clickhouse_path="${2:-}"; shift 2 ;;
    --minimum-vcpu) minimum_vcpu="${2:-}"; shift 2 ;;
    --minimum-memory-gb) minimum_memory_gb="${2:-}"; shift 2 ;;
    --minimum-system-disk-gb) minimum_system_disk_gb="${2:-}"; shift 2 ;;
    --minimum-postgres-disk-gb) minimum_postgres_disk_gb="${2:-}"; shift 2 ;;
    --minimum-clickhouse-disk-gb) minimum_clickhouse_disk_gb="${2:-}"; shift 2 ;;
    --force) force="true"; shift ;;
    --argus-url) argus_url="${2:-}"; shift 2 ;;
    --enrollment-token-file) enrollment_token_file="${2:-}"; shift 2 ;;
    --prepare-only) prepare_only="true"; shift ;;
    --yes) assume_yes="true"; shift ;;
    --allow-http) allow_http="true"; shift ;;
    --allow-unresolved-hosts) allow_unresolved_hosts="true"; shift ;;
    --install-root) install_root="${2:-}"; shift 2 ;;
    --repository-url) repository_url="${2:-}"; shift 2 ;;
    --repository-ref) repository_ref="${2:-}"; shift 2 ;;
    --sync-timeout) sync_timeout_seconds="${2:-}"; shift 2 ;;
    --skip-docker-install) skip_docker_install="true"; shift ;;
    --simulation) simulation="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done

if [[ "$simulation" == "true" ]]; then
  [[ -f "$repo_root/compose.dr-lab.yaml" && -r "$repo_root/.env.dr-lab" ]] || \
    die "--simulation exige o repositório Argus e .env.dr-lab"
  [[ -n "$site_b_host" ]] || site_b_host="logvault-b.lab.test"
  [[ -n "$site_a_host" ]] || site_a_host="logvault-a.lab.test"
  [[ -n "$panel_host" ]] || panel_host="logvault.lab.test"
  [[ -n "$ingest_host" ]] || ingest_host="ingest.lab.test"
  [[ -n "$dr_control_host" ]] || dr_control_host="dr.lab.test"
  dns_provider="lab"
  dns_ttl=60
  tls="false"
  clickhouse_port=8123
  api_port=8080
  minimum_vcpu=1
  minimum_memory_gb=1
  minimum_system_disk_gb=1
  minimum_postgres_disk_gb=1
  minimum_clickhouse_disk_gb=1
  if [[ "$output_was_set" != "true" ]]; then output_dir="$repo_root/artifacts/dc-b-simulation"; fi
fi

for value in "$postgres_port" "$clickhouse_port" "$api_port" "$dns_ttl" "$minimum_vcpu" "$minimum_memory_gb" \
  "$minimum_system_disk_gb" "$minimum_postgres_disk_gb" "$minimum_clickhouse_disk_gb" "$sync_timeout_seconds"; do
  is_uint "$value" || die "portas e requisitos devem ser inteiros positivos"
done
(( postgres_port <= 65535 && clickhouse_port <= 65535 && api_port <= 65535 )) || die "porta fora do intervalo válido"
(( dns_ttl >= 30 && dns_ttl <= 86400 )) || die "--dns-ttl deve estar entre 30 e 86400 segundos"
[[ "$tls" == "true" || "$tls" == "false" ]] || die "--tls deve ser true ou false"
if [[ "$tls" == "true" && "$simulation" != "true" ]]; then
  die "o compose integrado usa HTTP somente dentro da VPN/rede dedicada; não use --tls true sem um proxy interno próprio"
fi
[[ "$output_dir" != "/" && -n "$output_dir" ]] || die "diretório de saída inseguro"
[[ "$install_root" == /* && "$install_root" != "/" && "$install_root" != *".."* ]] || die "--install-root deve ser um caminho absoluto seguro"
site_name_pattern='^[[:alnum:]][[:alnum:] ._-]{0,99}$'
[[ "$site_a_name" =~ $site_name_pattern ]] || die "nome do site A inválido"
[[ "$site_b_name" =~ $site_name_pattern ]] || die "nome do site B inválido"

existing_path() {
  local candidate="$1"
  while [[ ! -e "$candidate" && "$candidate" != "/" ]]; do candidate="$(dirname "$candidate")"; done
  printf '%s' "$candidate"
}

detect_local_network() {
  local route_target="1.1.1.1" route_info="" item next_is=""
  if [[ "$site_a_host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    route_target="$site_a_host"
  elif [[ -n "$site_a_host" ]] && command -v getent >/dev/null 2>&1; then
    route_target="$(getent ahostsv4 "$site_a_host" 2>/dev/null | awk 'NR == 1 { print $1 }' || true)"
    route_target="${route_target:-1.1.1.1}"
  fi
  detected_hostname="$(hostname -f 2>/dev/null || hostname)"
  if command -v ip >/dev/null 2>&1; then
    route_info="$(ip -4 route get "$route_target" 2>/dev/null | head -n 1 || true)"
    for item in $route_info; do
      case "$next_is" in
        src) detected_private_host="$item"; next_is=""; continue ;;
        dev) detected_interface="$item"; next_is=""; continue ;;
        via) detected_gateway="$item"; next_is=""; continue ;;
      esac
      case "$item" in src|dev|via) next_is="$item" ;; esac
    done
  fi
  if [[ -z "$detected_private_host" ]]; then
    detected_private_host="$(hostname -I 2>/dev/null | awk '{ print $1 }' || true)"
  fi
  return 0
}

resolve_endpoint() {
  local host="$1"
  if [[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then printf '%s' "$host"; return; fi
  if command -v getent >/dev/null 2>&1; then
    getent ahostsv4 "$host" 2>/dev/null | awk '!seen[$1]++ { values = values (values ? "," : "") $1 } END { print values }' || true
  fi
}

validate_endpoint_dns() {
  local label="$1" host="$2" resolved
  resolved="$(resolve_endpoint "$host")"
  if [[ -z "$resolved" && "$simulation" != "true" && "$allow_unresolved_hosts" != "true" ]]; then
    die "$label não resolve em DNS: $host"
  fi
  printf '%s' "${resolved:-não resolvido (laboratório)}"
}

filesystem_value() {
  local path="$1" field="$2" target
  target="$(existing_path "$path")"
  if command -v findmnt >/dev/null 2>&1; then
    findmnt -T "$target" -n -b -o "$field" 2>/dev/null | head -n 1
  fi
}

bytes_to_gib() {
  local bytes="${1:-0}"
  [[ "$bytes" =~ ^[0-9]+$ ]] || bytes=0
  awk -v bytes="$bytes" 'BEGIN { printf "%.1f", bytes / 1024 / 1024 / 1024 }'
}

disk_total_gb() {
  local target
  target="$(existing_path "$1")"
  df -Pk "$target" | awk 'NR==2 { printf "%d", $2 / 1024 / 1024 }'
}

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/[[:cntrl:]]/ /g'; }

preflight() {
  local os_id="unknown" os_version="unknown" os_pretty="unknown" arch hostname_value vcpu memory_gb
  local system_disk_gb postgres_disk_gb clickhouse_disk_gb docker_version compose_version ntp_state
  local failures=0 warnings=0 pg_mount pg_source pg_fstype pg_size pg_avail ch_mount ch_source ch_fstype ch_size ch_avail
  detect_local_network
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    source /etc/os-release
    os_id="${ID:-unknown}"; os_version="${VERSION_ID:-unknown}"; os_pretty="${PRETTY_NAME:-unknown}"
  fi
  arch="$(uname -m)"; hostname_value="$(hostname -f 2>/dev/null || hostname)"
  [[ "$simulation" == "true" ]] && hostname_value="dc-b-simulado"
  vcpu="$(getconf _NPROCESSORS_ONLN)"
  memory_gb="$(awk '/MemTotal/ { printf "%d", $2 / 1024 / 1024 }' /proc/meminfo)"
  system_disk_gb="$(disk_total_gb /)"
  postgres_disk_gb="$(disk_total_gb "$postgres_path")"
  clickhouse_disk_gb="$(disk_total_gb "$clickhouse_path")"
  docker_version="$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)"
  compose_version="$(docker compose version --short 2>/dev/null || true)"
  ntp_state="$(timedatectl show -p NTPSynchronized --value 2>/dev/null || true)"
  pg_mount="$(filesystem_value "$postgres_path" TARGET)"; pg_source="$(filesystem_value "$postgres_path" SOURCE)"
  pg_fstype="$(filesystem_value "$postgres_path" FSTYPE)"; pg_size="$(filesystem_value "$postgres_path" SIZE)"
  pg_avail="$(filesystem_value "$postgres_path" AVAIL)"
  ch_mount="$(filesystem_value "$clickhouse_path" TARGET)"; ch_source="$(filesystem_value "$clickhouse_path" SOURCE)"
  ch_fstype="$(filesystem_value "$clickhouse_path" FSTYPE)"; ch_size="$(filesystem_value "$clickhouse_path" SIZE)"
  ch_avail="$(filesystem_value "$clickhouse_path" AVAIL)"

  printf 'Preflight da VM standby\n'
  printf '  Sistema: %s (%s)\n' "$os_pretty" "$arch"
  printf '  Hostname: %s\n' "$hostname_value"
  printf '  Rede detectada: %s%s%s\n' "${detected_private_host:-não identificada}" \
    "${detected_interface:+ · interface $detected_interface}" "${detected_gateway:+ · gateway $detected_gateway}"
  if [[ "$os_id" == "ubuntu" && "${os_version%%.*}" -ge 24 || "$os_id" == "debian" && "${os_version%%.*}" -ge 12 ]]; then
    printf '  [OK] sistema operacional suportado\n'
  else printf '  [FALHA] use Ubuntu 24.04+ ou Debian 12+\n'; failures=$((failures + 1)); fi
  if (( vcpu >= minimum_vcpu )); then printf '  [OK] vCPU: %s (mínimo %s)\n' "$vcpu" "$minimum_vcpu"
  else printf '  [FALHA] vCPU: %s (mínimo %s)\n' "$vcpu" "$minimum_vcpu"; failures=$((failures + 1)); fi
  if (( memory_gb >= minimum_memory_gb )); then printf '  [OK] memória: %s GiB (mínimo %s)\n' "$memory_gb" "$minimum_memory_gb"
  else printf '  [FALHA] memória: %s GiB (mínimo %s)\n' "$memory_gb" "$minimum_memory_gb"; failures=$((failures + 1)); fi
  for label_path_total_required in \
    "sistema|/|$system_disk_gb|$minimum_system_disk_gb" \
    "PostgreSQL|$postgres_path|$postgres_disk_gb|$minimum_postgres_disk_gb" \
    "ClickHouse|$clickhouse_path|$clickhouse_disk_gb|$minimum_clickhouse_disk_gb"; do
    IFS='|' read -r label path total required <<<"$label_path_total_required"
    if (( total >= required )); then printf '  [OK] disco %s em %s: %s GiB (mínimo %s)\n' "$label" "$path" "$total" "$required"
    else printf '  [FALHA] disco %s em %s: %s GiB (mínimo %s)\n' "$label" "$path" "$total" "$required"; failures=$((failures + 1)); fi
  done
  if [[ -n "$docker_version" && -n "$compose_version" ]]; then printf '  [OK] Docker %s / Compose %s\n' "$docker_version" "$compose_version"
  else printf '  [AVISO] Docker Engine e Compose v2 serão necessários na etapa de provisionamento\n'; warnings=$((warnings + 1)); fi
  if [[ "$ntp_state" == "yes" ]]; then printf '  [OK] relógio sincronizado por NTP\n'
  else printf '  [AVISO] não foi possível confirmar sincronização NTP\n'; warnings=$((warnings + 1)); fi
  printf '  [INFO] PostgreSQL: %s em %s (%s · %s GiB livres)\n' "$postgres_path" \
    "${pg_source:-filesystem desconhecido}" "${pg_fstype:-tipo desconhecido}" "$(bytes_to_gib "$pg_avail")"
  printf '  [INFO] ClickHouse: %s em %s (%s · %s GiB livres)\n' "$clickhouse_path" \
    "${ch_source:-filesystem desconhecido}" "${ch_fstype:-tipo desconhecido}" "$(bytes_to_gib "$ch_avail")"
  if [[ -n "$pg_source" && "$pg_source" == "$ch_source" ]]; then
    printf '  [AVISO] PostgreSQL e ClickHouse compartilham o mesmo filesystem\n'
    warnings=$((warnings + 1))
  fi

  mkdir -p "$output_dir"
  chmod 0700 "$output_dir"
  cat >"$output_dir/inventory.json" <<EOF
{
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "hostname": "$(json_escape "$hostname_value")",
  "architecture": "$(json_escape "$arch")",
  "operatingSystem": "$(json_escape "$os_pretty")",
  "vcpu": $vcpu,
  "memoryGiB": $memory_gb,
  "disksGiB": { "system": $system_disk_gb, "postgres": $postgres_disk_gb, "clickhouse": $clickhouse_disk_gb },
  "docker": { "engine": "$(json_escape "$docker_version")", "compose": "$(json_escape "$compose_version")" },
  "ntpSynchronized": $([[ "$ntp_state" == "yes" ]] && printf true || printf false),
  "requirements": { "minimumVcpu": $minimum_vcpu, "minimumMemoryGiB": $minimum_memory_gb, "minimumSystemDiskGiB": $minimum_system_disk_gb, "minimumPostgresDiskGiB": $minimum_postgres_disk_gb, "minimumClickhouseDiskGiB": $minimum_clickhouse_disk_gb },
  "result": "$([[ $failures -eq 0 ]] && printf approved || printf rejected)",
  "failures": $failures,
  "warnings": $warnings,
  "network": { "primaryIpv4": "$(json_escape "$detected_private_host")", "interface": "$(json_escape "$detected_interface")", "defaultGateway": "$(json_escape "$detected_gateway")" },
  "storage": {
    "postgres": { "path": "$(json_escape "$postgres_path")", "mount": "$(json_escape "$pg_mount")", "source": "$(json_escape "$pg_source")", "filesystem": "$(json_escape "$pg_fstype")", "sizeBytes": ${pg_size:-0}, "availableBytes": ${pg_avail:-0} },
    "clickhouse": { "path": "$(json_escape "$clickhouse_path")", "mount": "$(json_escape "$ch_mount")", "source": "$(json_escape "$ch_source")", "filesystem": "$(json_escape "$ch_fstype")", "sizeBytes": ${ch_size:-0}, "availableBytes": ${ch_avail:-0} }
  }
}
EOF
  chmod 0600 "$output_dir/inventory.json"
  printf 'Inventário: %s\n' "$output_dir/inventory.json"
  (( failures == 0 ))
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex 24
  else od -An -N24 -tx1 /dev/urandom | tr -d ' \n'; fi
}

prepare() {
  detect_local_network
  [[ -n "$site_b_host" ]] || die "--site-b-host é obrigatório em prepare"
  valid_host "$site_b_host" || die "DNS/FQDN do DC-B inválido"
  [[ -n "$site_a_host" ]] || die "--site-a-host é obrigatório em prepare"
  valid_host "$site_a_host" || die "DNS/FQDN do DC-A inválido"
  validate_endpoint_dns 'Endpoint do DC-A' "$site_a_host" >/dev/null
  validate_endpoint_dns 'Endpoint do DC-B' "$site_b_host" >/dev/null
  for required_dns in "$panel_host" "$ingest_host" "$dr_control_host"; do
    [[ -n "$required_dns" ]] || die "--panel-host, --ingest-host e --dr-control-host são obrigatórios em prepare"
    valid_host "$required_dns" || die "hostname público inválido: $required_dns"
  done
  [[ "$dns_provider" =~ ^[A-Za-z0-9._-]{2,80}$ ]] || die "--dns-provider inválido"
  if [[ -e "$output_dir/registration.env" && "$force" != "true" ]]; then
    die "já existe um pacote em $output_dir; use outro diretório ou --force"
  fi
  preflight || die "a VM não atende aos requisitos; consulte inventory.json"
  umask 077
  local pg_password ch_password enrollment_nonce scheme
  pg_password="$(random_secret)"; ch_password="$(random_secret)"; enrollment_nonce="$(random_secret)"
  scheme="http"; [[ "$tls" == "true" ]] && scheme="https"
  cat >"$output_dir/registration.env" <<EOF
ARGUS_DR_SITE_A_NAME='$site_a_name'
ARGUS_DR_SITE_B_NAME='$site_b_name'
ARGUS_DR_SITE_A_HOST=$site_a_host
ARGUS_DR_SITE_B_HOST=$site_b_host
ARGUS_DR_PANEL_HOST=$panel_host
ARGUS_DR_INGEST_HOST=$ingest_host
ARGUS_DR_CONTROL_HOST=$dr_control_host
ARGUS_DR_DNS_PROVIDER=$dns_provider
ARGUS_DR_DNS_TTL_SECONDS=$dns_ttl
ARGUS_DR_POSTGRES_STANDBY_URL=postgresql://argus_monitor:$pg_password@$site_b_host:$postgres_port/argus
ARGUS_DR_CLICKHOUSE_STANDBY_URL=$scheme://$site_b_host:$clickhouse_port
ARGUS_DR_CLICKHOUSE_STANDBY_USER=argus_monitor
ARGUS_DR_CLICKHOUSE_STANDBY_PASSWORD=$ch_password
ARGUS_DR_STANDBY_API_URL=$scheme://$site_b_host:$api_port
ARGUS_DR_LAG_WARNING_SECONDS=10
ARGUS_DR_LAG_CRITICAL_SECONDS=60
EOF
  cat >"$output_dir/installation-secrets.env" <<EOF
ARGUS_DR_POSTGRES_MONITOR_PASSWORD=$pg_password
ARGUS_DR_CLICKHOUSE_MONITOR_PASSWORD=$ch_password
ARGUS_DR_ENROLLMENT_NONCE=$enrollment_nonce
EOF
  cat >"$output_dir/enrollment-payload.json" <<EOF
{
  "inventory": $(<"$output_dir/inventory.json"),
  "configuration": {
    "siteAName": "$(json_escape "$site_a_name")",
    "siteBName": "$(json_escape "$site_b_name")",
    "postgresStandbyUrl": "postgresql://argus_monitor:$pg_password@$site_b_host:$postgres_port/argus",
    "clickhouseStandbyUrl": "$scheme://$site_b_host:$clickhouse_port",
    "clickhouseStandbyUser": "argus_monitor",
    "clickhouseStandbyPassword": "$ch_password",
    "standbyApiUrl": "$scheme://$site_b_host:$api_port",
    "warningSeconds": 10,
    "criticalSeconds": 60
  },
  "routing": {
    "siteAHost": "$(json_escape "$site_a_host")",
    "siteBHost": "$(json_escape "$site_b_host")",
    "panelHost": "$(json_escape "$panel_host")",
    "ingestHost": "$(json_escape "$ingest_host")",
    "drControlHost": "$(json_escape "$dr_control_host")",
    "dnsProvider": "$(json_escape "$dns_provider")",
    "dnsTtlSeconds": $dns_ttl
  }
}
EOF
  cat >"$output_dir/README.txt" <<EOF
Pacote de preparação do $site_b_name

inventory.json: inventário e aceite de capacidade da VM.
enrollment-payload.json: envelope confidencial enviado uma única vez ao Argus.
registration.env: cópia local confidencial dos valores cadastrados.
installation-secrets.env: segredos para a futura etapa de provisionamento.

Todos os arquivos são confidenciais. Não envie por e-mail, não adicione ao Git
e remova a cópia local depois de armazená-los no cofre de segredos.
EOF
  chmod 0600 "$output_dir/registration.env" "$output_dir/installation-secrets.env" \
    "$output_dir/enrollment-payload.json" "$output_dir/README.txt"
  printf '\nPacote preparado em %s\n' "$output_dir"
  printf 'As credenciais não foram exibidas. Use show-registration apenas em terminal privado.\n'
}

provision_simulation_access() {
  [[ "$simulation" == "true" ]] || return 0
  # Os valores são hexadecimais gerados localmente; nunca são enviados na linha
  # de comando nem impressos no terminal.
  # shellcheck disable=SC1090
  source "$output_dir/installation-secrets.env"
  local pg_password="$ARGUS_DR_POSTGRES_MONITOR_PASSWORD"
  local ch_password="$ARGUS_DR_CLICKHOUSE_MONITOR_PASSWORD"
  local -a compose=(docker compose --project-name argus-dr-lab --file "$repo_root/compose.dr-lab.yaml" \
    --env-file "$repo_root/.env.dr-lab" --profile replication)
  "${compose[@]}" exec -T postgres-a psql --username argus --dbname argus \
    --set ON_ERROR_STOP=1 --set "monitor_password=$pg_password" <<'SQL' >/dev/null
SELECT format(
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'argus_monitor')
    THEN 'ALTER ROLE argus_monitor WITH LOGIN PASSWORD %L'
    ELSE 'CREATE ROLE argus_monitor WITH LOGIN PASSWORD %L'
  END,
  :'monitor_password'
)
\gexec
GRANT pg_monitor TO argus_monitor;
GRANT CONNECT ON DATABASE argus TO argus_monitor;
SQL
  "${compose[@]}" exec -T clickhouse-b sh -c \
    'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --multiquery' <<SQL >/dev/null
CREATE USER IF NOT EXISTS argus_monitor IDENTIFIED WITH sha256_password BY '$ch_password';
ALTER USER argus_monitor IDENTIFIED WITH sha256_password BY '$ch_password';
GRANT SELECT ON system.replicas TO argus_monitor;
GRANT SELECT ON argus.* TO argus_monitor;
SQL
  printf 'Contas exclusivas de monitoramento aplicadas no DC-B simulado.\n'
}

ensure_provisioning_tools() {
  local missing="false"
  command -v git >/dev/null 2>&1 || missing="true"
  command -v python3 >/dev/null 2>&1 || missing="true"
  command -v docker >/dev/null 2>&1 || missing="true"
  if [[ "$missing" == "true" && "$skip_docker_install" == "true" ]]; then
    die "Git, Python 3, Docker Engine e Compose v2 são obrigatórios"
  fi
  if [[ "$missing" == "true" ]]; then
    [[ $(id -u) -eq 0 ]] || die "execute como root para instalar as dependências"
    command -v apt-get >/dev/null 2>&1 || die "instalação automática requer APT (Ubuntu/Debian)"
    printf 'Instalando dependências do DC-B...\n'
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates git python3 docker.io docker-compose-v2 || \
      DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates git python3 docker.io docker-compose-plugin
    if command -v systemctl >/dev/null 2>&1; then systemctl enable --now docker || true; fi
    if ! docker info >/dev/null 2>&1 && command -v service >/dev/null 2>&1; then service docker start || true; fi
  fi
  command -v git >/dev/null 2>&1 || die "Git não foi instalado"
  command -v python3 >/dev/null 2>&1 || die "Python 3 não foi instalado"
  command -v docker >/dev/null 2>&1 || die "Docker não foi instalado"
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 não foi instalado"
  docker info >/dev/null 2>&1 || die "Docker foi instalado, mas o daemon não está acessível"
}

json_value() {
  python3 - "$1" "$2" <<'PY'
import json, sys
value = json.load(open(sys.argv[1], encoding='utf-8'))
for part in sys.argv[2].split('.'):
    value = value.get(part) if isinstance(value, dict) else None
print(value if isinstance(value, str) else '')
PY
}

ensure_repository() {
  local response_file="$1" response_url response_ref
  if [[ -f "$repo_root/package.json" && -f "$repo_root/compose.dc-b.yaml" ]]; then return 0; fi
  response_url="$(json_value "$response_file" provisioning.repositoryUrl)"
  response_ref="$(json_value "$response_file" provisioning.repositoryRef)"
  repository_url="${repository_url:-$response_url}"
  repository_ref="${repository_ref:-$response_ref}"
  [[ "$repository_url" =~ ^(https://|ssh://|git@)[^[:space:]]+$ ]] || die "URL do repositório ausente ou inválida na resposta do DC-A"
  [[ "$repository_ref" =~ ^[A-Za-z0-9._/-]+$ && "$repository_ref" != -* && "$repository_ref" != *".."* ]] || die "ref do repositório inválida"
  if [[ -e "$install_root" && ! -d "$install_root/.git" ]]; then die "$install_root já existe e não é um checkout Git"; fi
  if [[ -d "$install_root/.git" ]]; then
    [[ -z "$(git -C "$install_root" status --porcelain --untracked-files=no)" ]] || die "checkout do DC-B possui alterações locais"
    git -C "$install_root" fetch --prune --tags origin "$repository_ref"
    git -C "$install_root" checkout --detach FETCH_HEAD
  else
    install -d -m 0750 "$(dirname "$install_root")"
    git clone --depth 1 --branch "$repository_ref" "$repository_url" "$install_root"
  fi
  repo_root="$install_root"
  script_dir="$repo_root/scripts"
  [[ -f "$repo_root/compose.dc-b.yaml" ]] || die "a versão baixada não contém compose.dc-b.yaml"
}

set_env_file() {
  local file="$1" key="$2" value="$3" temporary
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "valor inválido para $key"
  temporary="$(mktemp "${file}.XXXXXX")"
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    $0 ~ "^" key "=" { if (!found) print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' "$file" >"$temporary"
  chmod 0600 "$temporary"
  mv "$temporary" "$file"
}

write_standby_environment() {
  local response_file="$1" env_file="$repo_root/.env.dc-b"
  if [[ -s "$env_file" && "$force" != "true" ]]; then die "$env_file já existe; use --force somente para reprovisionar conscientemente"; fi
  umask 077
  python3 - "$response_file" "$env_file" <<'PY'
import json, os, re, sys
payload = json.load(open(sys.argv[1], encoding='utf-8'))
environment = payload.get('provisioning', {}).get('environment', {})
required = {'ARGUS_POSTGRES_PASSWORD', 'ARGUS_DR_POSTGRES_REPLICATION_PASSWORD', 'ARGUS_CLICKHOUSE_PASSWORD',
            'ARGUS_SYNC_TOKEN', 'ARGUS_ALERT_ENCRYPTION_KEY'}
if not isinstance(environment, dict) or not required.issubset(environment):
    raise SystemExit('Resposta do DC-A não contém as credenciais de provisionamento exigidas')
with open(sys.argv[2], 'w', encoding='utf-8') as output:
    for key, value in sorted(environment.items()):
        if not re.fullmatch(r'ARGUS_[A-Z0-9_]+', key) or not isinstance(value, str) or '\n' in value or '\r' in value:
            raise SystemExit(f'Entrada de ambiente inválida: {key}')
        output.write(f'{key}={value}\n')
os.chmod(sys.argv[2], 0o600)
PY
  # shellcheck disable=SC1090
  source "$output_dir/installation-secrets.env"
  set_env_file "$env_file" ARGUS_ENV production
  set_env_file "$env_file" ARGUS_DR_LOCAL_SITE b
  set_env_file "$env_file" ARGUS_DR_LOCAL_HOSTNAME logvault-dc-b
  set_env_file "$env_file" ARGUS_DR_SITE_A_HOST "$site_a_host"
  set_env_file "$env_file" ARGUS_DR_SITE_B_HOST "$site_b_host"
  set_env_file "$env_file" ARGUS_DR_SITE_A_NAME "$site_a_name"
  set_env_file "$env_file" ARGUS_DR_SITE_B_NAME "$site_b_name"
  set_env_file "$env_file" ARGUS_DR_PANEL_HOST "$panel_host"
  set_env_file "$env_file" ARGUS_DR_INGEST_HOST "$ingest_host"
  set_env_file "$env_file" ARGUS_DR_CONTROL_HOST "$dr_control_host"
  set_env_file "$env_file" ARGUS_DR_DNS_PROVIDER "$dns_provider"
  set_env_file "$env_file" ARGUS_DR_DNS_TTL_SECONDS "$dns_ttl"
  set_env_file "$env_file" ARGUS_DR_SERVICE_BIND 0.0.0.0
  set_env_file "$env_file" ARGUS_DR_POSTGRES_PORT "$postgres_port"
  set_env_file "$env_file" ARGUS_DR_CLICKHOUSE_HTTP_PORT "$clickhouse_port"
  set_env_file "$env_file" ARGUS_DR_AGENT_PORT "$api_port"
  set_env_file "$env_file" ARGUS_DR_POSTGRES_B_DATA_PATH "${postgres_path%/}/data"
  set_env_file "$env_file" ARGUS_DR_CLICKHOUSE_B_DATA_PATH "${clickhouse_path%/}"
  set_env_file "$env_file" ARGUS_DR_COLLECTOR_B_DATA_PATH /var/lib/logvault/collector
  set_env_file "$env_file" ARGUS_DR_BACKUP_B_DATA_PATH /var/lib/logvault/backups
  set_env_file "$env_file" ARGUS_DR_TENANT_BACKUP_B_DATA_PATH /var/lib/logvault/tenant-backups
  set_env_file "$env_file" ARGUS_DR_BACKUP_STAGING_B_DATA_PATH /var/lib/logvault/backup-staging
  set_env_file "$env_file" ARGUS_DR_PROXY_B_DATA_PATH /var/lib/logvault/proxy-data
  set_env_file "$env_file" ARGUS_DR_PROXY_B_CONFIG_PATH /var/lib/logvault/proxy-config
  set_env_file "$env_file" ARGUS_HTTP_BIND 0.0.0.0
  set_env_file "$env_file" ARGUS_HTTPS_BIND 0.0.0.0
  set_env_file "$env_file" ARGUS_DR_PRIMARY_CLICKHOUSE_USER argus
  set_env_file "$env_file" ARGUS_DR_PRIMARY_CLICKHOUSE_PASSWORD "$(sed -n 's/^ARGUS_CLICKHOUSE_PASSWORD=//p' "$env_file" | tail -n1)"
  set_env_file "$env_file" ARGUS_DR_PRIMARY_CLICKHOUSE_NATIVE_PORT 9000
  set_env_file "$env_file" ARGUS_DR_POSTGRES_MONITOR_PASSWORD "$ARGUS_DR_POSTGRES_MONITOR_PASSWORD"
  set_env_file "$env_file" ARGUS_DR_CLICKHOUSE_MONITOR_PASSWORD "$ARGUS_DR_CLICKHOUSE_MONITOR_PASSWORD"
  set_env_file "$env_file" ARGUS_DR_POSTGRES_STANDBY_URL "postgresql://argus_monitor:$ARGUS_DR_POSTGRES_MONITOR_PASSWORD@$site_b_host:$postgres_port/argus"
  set_env_file "$env_file" ARGUS_DR_CLICKHOUSE_STANDBY_URL "http://$site_b_host:$clickhouse_port"
  set_env_file "$env_file" ARGUS_DR_CLICKHOUSE_STANDBY_USER argus_monitor
  set_env_file "$env_file" ARGUS_DR_CLICKHOUSE_STANDBY_PASSWORD "$ARGUS_DR_CLICKHOUSE_MONITOR_PASSWORD"
  set_env_file "$env_file" ARGUS_DR_STANDBY_API_URL "http://$site_b_host:$api_port"
  set_env_file "$env_file" ARGUS_CLICKHOUSE_URL http://clickhouse-b:8123
  set_env_file "$env_file" ARGUS_CLICKHOUSE_USER argus
  set_env_file "$env_file" ARGUS_CLICKHOUSE_DATABASE argus
  set_env_file "$env_file" ARGUS_POSTGRES_URL "postgres://argus:$(sed -n 's/^ARGUS_POSTGRES_PASSWORD=//p' "$env_file" | tail -n1)@postgres-b:5432/argus"
  set_env_file "$env_file" ARGUS_API_HOST 0.0.0.0
  set_env_file "$env_file" ARGUS_API_PORT 8080
  set_env_file "$env_file" ARGUS_SPOOL_PATH /var/lib/argus/spool.sqlite
  set_env_file "$env_file" ARGUS_COLLECTOR_BIND 0.0.0.0
  set_env_file "$env_file" ARGUS_WEB_BIND 127.0.0.1
  set_env_file "$env_file" ARGUS_DR_ENABLED false
  printf '%s' "$env_file"
}

provision_dc_b() {
  local response_file="$output_dir/enrollment-response.json" env_file deadline state_rows pending heartbeat_age pg_recovery
  ensure_provisioning_tools
  ensure_repository "$response_file"
  env_file="$(write_standby_environment "$response_file")"
  install -d -m 0700 "${postgres_path%/}/data" "${clickhouse_path%/}" /var/lib/logvault/collector /var/lib/logvault/backups /var/lib/logvault/tenant-backups /var/lib/logvault/backup-staging /var/lib/logvault/proxy-data /var/lib/logvault/proxy-config
  cd "$repo_root"
  local -a compose=(docker compose --project-name logvault-dc-b --file compose.dc-b.yaml --env-file "$env_file")
  ARGUS_DR_ENV_FILE="$env_file" "${compose[@]}" config --quiet
  printf 'Iniciando PostgreSQL B, ClickHouse B e agente de prontidão...\n'
  ARGUS_DR_ENV_FILE="$env_file" "${compose[@]}" up -d postgres-b clickhouse-b standby-agent
  deadline=$(( $(date +%s) + sync_timeout_seconds ))
  until ARGUS_DR_ENV_FILE="$env_file" "${compose[@]}" exec -T postgres-b pg_isready -U argus -d argus >/dev/null 2>&1 \
    && ARGUS_DR_ENV_FILE="$env_file" "${compose[@]}" exec -T clickhouse-b sh -c \
      'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --query "SELECT 1"' >/dev/null 2>&1; do
    (( $(date +%s) < deadline )) || die "tempo esgotado aguardando bancos do DC-B"
    sleep 5
  done
  # shellcheck disable=SC1090
  source "$output_dir/installation-secrets.env"
  ARGUS_DR_ENV_FILE="$env_file" "${compose[@]}" exec -T clickhouse-b sh -c \
    'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --multiquery' <<SQL >/dev/null
CREATE USER IF NOT EXISTS argus_monitor IDENTIFIED WITH sha256_password BY '$ARGUS_DR_CLICKHOUSE_MONITOR_PASSWORD';
ALTER USER argus_monitor IDENTIFIED WITH sha256_password BY '$ARGUS_DR_CLICKHOUSE_MONITOR_PASSWORD';
GRANT SELECT ON system.* TO argus_monitor;
GRANT SELECT ON argus.* TO argus_monitor;
SQL
  printf 'Iniciando espelhamento assíncrono do ClickHouse...\n'
  ARGUS_DR_ENV_FILE="$env_file" "${compose[@]}" up -d clickhouse-mirror
  while true; do
    pg_recovery="$(ARGUS_DR_ENV_FILE="$env_file" "${compose[@]}" exec -T postgres-b psql -U argus -d argus -Atqc 'SELECT pg_is_in_recovery()' 2>/dev/null || true)"
    read -r state_rows pending heartbeat_age <<<"$(ARGUS_DR_ENV_FILE="$env_file" "${compose[@]}" exec -T clickhouse-b sh -c \
      'clickhouse-client --user "$CLICKHOUSE_USER" --password "$CLICKHOUSE_PASSWORD" --database argus --format TSVRaw --query "SELECT count(), countIf(source_max_ms > watermark_ms), ifNull(dateDiff('\''second'\'',max(last_success_at),now64(3)),999999) FROM dr_mirror_state FINAL"' 2>/dev/null || printf '0 3 999999')"
    if [[ "$pg_recovery" == t && "${state_rows:-0}" -ge 3 && "${pending:-3}" -eq 0 && "${heartbeat_age:-999999}" -le 30 ]]; then break; fi
    (( $(date +%s) < deadline )) || die "carga inicial não terminou em ${sync_timeout_seconds}s; os serviços continuarão sincronizando e podem ser verificados com scripts/dr-standby.sh status"
    printf '  Sincronizando: PostgreSQL recovery=%s · ClickHouse tabelas=%s pendentes=%s heartbeat=%ss\n' "${pg_recovery:-aguardando}" "${state_rows:-0}" "${pending:-3}" "${heartbeat_age:-?}"
    sleep 10
  done
  ARGUS_DR_ENV_FILE="$env_file" "${compose[@]}" ps
  python3 - "$response_file" <<'PY'
import json, os, sys, tempfile
path = sys.argv[1]
payload = json.load(open(path, encoding='utf-8'))
provisioning = payload.get('provisioning')
if isinstance(provisioning, dict):
    provisioning['environment'] = {'storedIn': '.env.dc-b', 'redacted': True}
fd, temporary = tempfile.mkstemp(prefix='.enrollment-response-', dir=os.path.dirname(path))
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as output:
        json.dump(payload, output, ensure_ascii=False)
        output.write('\n')
    os.chmod(temporary, 0o600)
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary): os.unlink(temporary)
PY
  printf 'DC-B provisionado e sincronizado. API, painel, coletor e backup permanecem desligados até promoção explícita.\n'
}

enroll() {
  [[ -n "$argus_url" ]] || die "--argus-url é obrigatório em enroll"
  argus_url="${argus_url%/}"
  if [[ ! "$argus_url" =~ ^https:// ]]; then
    [[ "$allow_http" == "true" && "$argus_url" =~ ^http:// ]] || die "enrollment exige HTTPS; use --allow-http somente em laboratório"
  fi
  [[ -n "${ARGUS_DC_B_ENROLLMENT_TOKEN:-}" ]] || die "ARGUS_DC_B_ENROLLMENT_TOKEN não foi definido"
  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    die "curl ou wget é necessário para realizar o enrollment"
  fi
  prepare
  provision_simulation_access
  local endpoint="$argus_url/api/v1/continuity/enroll"
  local enrollment_ok="false"
  if command -v curl >/dev/null 2>&1; then
    if curl --fail-with-body --silent --show-error \
      --connect-timeout 10 --max-time 120 \
      --header "Authorization: Bearer $ARGUS_DC_B_ENROLLMENT_TOKEN" \
      --header 'Content-Type: application/json' \
      --data-binary "@$output_dir/enrollment-payload.json" \
      --output "$output_dir/enrollment-response.json" \
      "$endpoint"; then enrollment_ok="true"; fi
  elif wget --quiet --timeout=120 \
    --header="Authorization: Bearer $ARGUS_DC_B_ENROLLMENT_TOKEN" \
    --header='Content-Type: application/json' \
    --post-file="$output_dir/enrollment-payload.json" \
    --output-document="$output_dir/enrollment-response.json" \
    "$endpoint"; then enrollment_ok="true"
  fi
  if [[ "$enrollment_ok" != "true" ]]; then
    chmod 0600 "$output_dir/enrollment-response.json" 2>/dev/null || true
    die "o Argus recusou o enrollment; consulte enrollment-response.json"
  fi
  chmod 0600 "$output_dir/enrollment-response.json"
  printf 'VM registrada no Argus. O token foi consumido e não pode ser reutilizado.\n'
  if [[ "$simulation" != "true" ]]; then provision_dc_b; fi
  printf 'O LogVault validará PostgreSQL, ClickHouse e agente standby periodicamente e ativará a proteção quando todos estiverem prontos.\n'
}

show_registration() {
  [[ -r "$output_dir/registration.env" ]] || die "pacote não encontrado em $output_dir"
  [[ "${ARGUS_DR_CONFIRM_SHOW_SECRETS:-}" == "SHOW-DC-B-SECRETS" ]] || \
    die "use ARGUS_DR_CONFIRM_SHOW_SECRETS=SHOW-DC-B-SECRETS para exibir credenciais"
  cat "$output_dir/registration.env"
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

read_enrollment_token() {
  local token="${ARGUS_DC_B_ENROLLMENT_TOKEN:-}"
  if [[ -n "$enrollment_token_file" ]]; then
    [[ -r "$enrollment_token_file" ]] || die "não foi possível ler --enrollment-token-file"
    [[ $(wc -c <"$enrollment_token_file") -le 4096 ]] || die "arquivo de token excede 4 KiB"
    token="$(<"$enrollment_token_file")"
  elif [[ -z "$token" && -t 0 ]]; then
    read -r -s -p 'Token de integração gerado no painel: ' token
    printf '\n'
  fi
  [[ "$token" =~ ^[A-Za-z0-9_-]{40,128}$ ]] || \
    die "informe um token de integração válido gerado em Continuidade → Adicionar DC-B"
  ARGUS_DC_B_ENROLLMENT_TOKEN="$token"
  export ARGUS_DC_B_ENROLLMENT_TOKEN
}

install_dc_b() {
  local answer="" panel_default=""
  detect_local_network
  if [[ -t 0 ]]; then
    printf '\nConfiguração do Datacenter B\n'
    printf 'Esta VM será cadastrada como standby; o failover não será ativado.\n\n'
    argus_url="$(ask 'URL do LogVault principal (DC-A)' "$argus_url")"
    panel_default="${argus_url#*://}"
    panel_default="${panel_default%%/*}"
    panel_default="${panel_default%%:*}"
    site_a_name="$(ask 'Nome do datacenter principal' "$site_a_name")"
    site_b_name="$(ask 'Nome deste datacenter standby' "$site_b_name")"
    site_a_host="$(ask 'DNS/FQDN estável do DC-A' "$site_a_host")"
    site_b_host="$(ask 'DNS/FQDN estável deste DC-B' "$site_b_host")"
    detect_local_network
    panel_host="$(ask 'Hostname público permanente do painel' "${panel_host:-$panel_default}")"
    ingest_host="$(ask 'Hostname público permanente de ingestão' "$ingest_host")"
    dr_control_host="$(ask 'Hostname do controlador de continuidade' "$dr_control_host")"
    dns_provider="$(ask 'Provedor ou integração DNS' "$dns_provider")"
    dns_ttl="$(ask 'TTL planejado do DNS em segundos' "$dns_ttl")"
    # O HTTPS do painel e o transporte interno de replicação são camadas
    # independentes. Os bancos usam a rede segura/VPN entre os datacenters.
  fi

  printf '\nResumo do Datacenter B\n'
  printf '  Topologia: %s → %s (standby)\n' "$site_a_name" "$site_b_name"
  printf '  Endpoints DNS: %s → %s\n' "${site_a_host:-não informado}" "${site_b_host:-não informado}"
  printf '  Resolução: %s → %s\n' "$(resolve_endpoint "$site_a_host")" "$(resolve_endpoint "$site_b_host")"
  printf '  Rede local detectada: %s · %s · interface %s\n' "${detected_hostname:-não identificado}" \
    "${detected_private_host:-IP não identificado}" "${detected_interface:-não identificada}"
  printf '  PostgreSQL: %s · %s\n' "$postgres_path" "$(filesystem_value "$postgres_path" SOURCE)"
  printf '  ClickHouse: %s · %s\n' "$clickhouse_path" "$(filesystem_value "$clickhouse_path" SOURCE)"
  printf '  Painel: %s\n' "${panel_host:-não informado}"
  printf '  Ingestão: %s\n' "${ingest_host:-não informado}"
  printf '  Controlador: %s\n' "${dr_control_host:-não informado}"
  printf '  DNS: %s · TTL %ss\n' "$dns_provider" "$dns_ttl"
  printf '  Operação após cadastro: standby, sem tráfego de produção\n\n'
  printf '  Segurança: os endpoints 5432/8123/9000 devem trafegar somente pela VPN ou rede dedicada entre A e B.\n\n'

  if [[ -t 0 && "$assume_yes" != "true" ]]; then
    read -r -p 'Executar o preflight e continuar? [S/n]: ' answer
    case "$answer" in
      n|N|nao|não|NAO|NÃO) printf 'Instalação cancelada.\n'; return 0 ;;
    esac
  fi

  if [[ "$prepare_only" == "true" ]]; then
    prepare
    printf 'VM preparada localmente. Nenhum token foi consumido e nenhum failover foi ativado.\n'
    return
  fi

  read_enrollment_token
  enroll
  printf 'Integração concluída. O DC-B permanece em preparação até os serviços e réplicas serem validados.\n'
}

case "$command_name" in
  install) install_dc_b ;;
  preflight) preflight ;;
  prepare) prepare ;;
  enroll) enroll ;;
  show-registration) show_registration ;;
  -h|--help|help|'') usage ;;
  *) usage >&2; die "comando desconhecido: $command_name" ;;
esac
