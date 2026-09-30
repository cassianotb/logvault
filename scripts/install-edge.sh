#!/bin/sh
set -eu

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
edge_env_file="$repo_root/.env.edge"
config_file=""
configure="false"
prepare_only="false"
edge_capture_file=""
edge_temp_file=""
edge_echo_disabled="false"

usage() {
  cat <<'EOF'
Uso: scripts/install-edge.sh [opções]

Sem um .env.edge existente, o instalador solicita a colagem da configuração
gerada no painel LogVault. A entrada permanece oculta para proteger o token.

  --configure           solicita uma nova configuração mesmo se .env.edge existir
  --config-file ARQUIVO importa a configuração de um arquivo sem interação
  --prepare-only        valida e salva a configuração sem iniciar o Docker
  -h, --help            exibe esta ajuda
EOF
}

die() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 2
}

restore_echo() {
  if [ "$edge_echo_disabled" = "true" ]; then
    stty echo 2>/dev/null || true
    edge_echo_disabled="false"
  fi
}

cleanup() {
  restore_echo
  if [ -n "$edge_capture_file" ] && [ -f "$edge_capture_file" ]; then rm -f -- "$edge_capture_file"; fi
  if [ -n "$edge_temp_file" ] && [ -f "$edge_temp_file" ]; then rm -f -- "$edge_temp_file"; fi
}

trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

while [ "$#" -gt 0 ]; do
  case "$1" in
    --configure) configure="true"; shift ;;
    --config-file)
      [ "$#" -ge 2 ] || die "--config-file exige um arquivo"
      config_file="$2"
      shift 2
      ;;
    --prepare-only) prepare_only="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done

validate_edge_config() {
  edge_validate_file="$1"
  [ -r "$edge_validate_file" ] || die "não foi possível ler a configuração informada"

  edge_size="$(wc -c <"$edge_validate_file" | tr -d ' ')"
  [ "$edge_size" -gt 0 ] || die "a configuração está vazia"
  [ "$edge_size" -le 131072 ] || die "a configuração excede o limite de 128 KiB"

  if grep -Ev '^[[:space:]]*(#.*)?$|^ARGUS_[A-Z0-9_]+=.*$' "$edge_validate_file" >/dev/null; then
    die "a configuração contém uma linha inválida; cole somente as variáveis ARGUS_ geradas pelo painel"
  fi

  for edge_key in \
    ARGUS_ENV ARGUS_TENANT_ID ARGUS_COLLECTOR_ID ARGUS_SYNC_TOKEN \
    ARGUS_SYNC_URL ARGUS_HEARTBEAT_URL ARGUS_SPOOL_PATH \
    ARGUS_NETFLOW_PORT ARGUS_SYSLOG_PORT; do
    edge_count="$(grep -c "^${edge_key}=" "$edge_validate_file" || true)"
    [ "$edge_count" -eq 1 ] || die "a configuração deve conter exatamente uma linha ${edge_key}="
    edge_value="$(sed -n "s/^${edge_key}=//p" "$edge_validate_file")"
    [ -n "$edge_value" ] || die "${edge_key} não pode ficar vazio"
  done

  grep -Eq '^ARGUS_ENV=production$' "$edge_validate_file" || die "ARGUS_ENV deve ser production"
  grep -Eq '^ARGUS_TENANT_ID=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' "$edge_validate_file" || \
    die "ARGUS_TENANT_ID inválido"
  grep -Eq '^ARGUS_COLLECTOR_ID=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' "$edge_validate_file" || \
    die "ARGUS_COLLECTOR_ID inválido"
  grep -Eq '^ARGUS_SYNC_URL=https?://[^[:space:]]+$' "$edge_validate_file" || die "ARGUS_SYNC_URL inválida"
  grep -Eq '^ARGUS_HEARTBEAT_URL=https?://[^[:space:]]+$' "$edge_validate_file" || die "ARGUS_HEARTBEAT_URL inválida"

  edge_secondary_count=0
  for edge_secondary_key in \
    ARGUS_SECONDARY_SYNC_URL ARGUS_SECONDARY_HEARTBEAT_URL ARGUS_SECONDARY_SYNC_TOKEN; do
    edge_secondary_lines="$(grep -c "^${edge_secondary_key}=" "$edge_validate_file" || true)"
    [ "$edge_secondary_lines" -le 1 ] || die "a configuração deve conter no máximo uma linha ${edge_secondary_key}="
    if [ "$edge_secondary_lines" -eq 1 ]; then
      edge_secondary_value="$(sed -n "s/^${edge_secondary_key}=//p" "$edge_validate_file")"
      if [ -n "$edge_secondary_value" ]; then edge_secondary_count=$((edge_secondary_count + 1)); fi
    fi
  done
  if [ "$edge_secondary_count" -ne 0 ] && [ "$edge_secondary_count" -ne 3 ]; then
    die "o destino secundário exige as duas URLs e o token"
  fi
  if [ "$edge_secondary_count" -eq 3 ]; then
    grep -Eq '^ARGUS_SECONDARY_SYNC_URL=https?://[^[:space:]]+$' "$edge_validate_file" || \
      die "ARGUS_SECONDARY_SYNC_URL inválida"
    grep -Eq '^ARGUS_SECONDARY_HEARTBEAT_URL=https?://[^[:space:]]+$' "$edge_validate_file" || \
      die "ARGUS_SECONDARY_HEARTBEAT_URL inválida"
  fi

  for edge_port_key in ARGUS_NETFLOW_PORT ARGUS_SYSLOG_PORT; do
    edge_port="$(sed -n "s/^${edge_port_key}=//p" "$edge_validate_file")"
    case "$edge_port" in ''|*[!0-9]*) die "${edge_port_key} deve ser uma porta numérica" ;; esac
    [ "$edge_port" -ge 1 ] && [ "$edge_port" -le 65535 ] || die "${edge_port_key} está fora do intervalo válido"
  done

  if grep -Eq 'substitua-|argus\.exemplo|^ARGUS_(TENANT|COLLECTOR)_ID=00000000-0000-0000-0000-000000000001$' "$edge_validate_file"; then
    die "a configuração ainda contém valores de exemplo"
  fi
}

save_edge_config() {
  edge_source_file="$1"
  edge_temp_file="$(mktemp "$repo_root/.env.edge.XXXXXX")"
  chmod 0600 "$edge_temp_file"
  tr -d '\r' <"$edge_source_file" >"$edge_temp_file"
  validate_edge_config "$edge_temp_file"

  if [ -f "$edge_env_file" ]; then
    cp -p "$edge_env_file" "$edge_env_file.bak"
    chmod 0600 "$edge_env_file.bak"
    printf 'Cópia da configuração anterior: %s\n' "$edge_env_file.bak"
  fi

  mv "$edge_temp_file" "$edge_env_file"
  edge_temp_file=""
  chmod 0600 "$edge_env_file"
  printf 'Configuração do coletor validada e salva com segurança.\n'
}

capture_edge_config() {
  [ -t 0 ] || die "sem terminal interativo; use --config-file ARQUIVO"
  edge_capture_file="$(mktemp "$repo_root/.env.edge.paste.XXXXXX")"
  chmod 0600 "$edge_capture_file"

  printf '\nCole a configuração gerada em LogVault → Coletores.\n'
  printf 'Quando terminar, digite FIM em uma nova linha e pressione Enter.\n'
  printf 'A entrada ficará oculta para não exibir a chave do coletor.\n\n'
  printf 'Aguardando configuração...\n'

  if command -v stty >/dev/null 2>&1 && stty -echo 2>/dev/null; then edge_echo_disabled="true"; fi
  while IFS= read -r edge_line; do
    [ "$edge_line" = "FIM" ] && break
    printf '%s\n' "$edge_line" >>"$edge_capture_file"
    edge_size="$(wc -c <"$edge_capture_file" | tr -d ' ')"
    if [ "$edge_size" -gt 131072 ]; then
      restore_echo
      die "a configuração colada excede o limite de 128 KiB"
    fi
  done
  restore_echo
  printf '\nConfiguração recebida. Validando conteúdo...\n'
  save_edge_config "$edge_capture_file"
  rm -f -- "$edge_capture_file"
  edge_capture_file=""
}

umask 077

if [ -n "$config_file" ]; then
  save_edge_config "$config_file"
elif [ "$configure" = "true" ] || [ ! -f "$edge_env_file" ]; then
  capture_edge_config
else
  validate_edge_config "$edge_env_file"
  chmod 0600 "$edge_env_file"
  printf 'Configuração existente validada em %s.\n' "$edge_env_file"
fi

if [ "$prepare_only" = "true" ]; then
  printf 'Preparação concluída; nenhum serviço foi iniciado.\n'
  exit 0
fi

cd "$repo_root"
if ! docker compose version >/dev/null 2>&1; then
  die "Docker com o plugin Compose é obrigatório"
fi

docker compose --env-file "$edge_env_file" -f compose.edge.yaml config --quiet
docker compose --env-file "$edge_env_file" -f compose.edge.yaml up -d --build
docker compose --env-file "$edge_env_file" -f compose.edge.yaml ps
printf 'Coletor instalado. Acompanhe o heartbeat na tela Coletores do LogVault.\n'
