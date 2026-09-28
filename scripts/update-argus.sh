#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
remote="origin"
branch=""
assume_yes="false"
check_only="false"
skip_backup="false"

usage() {
  cat <<'EOF'
Uso: scripts/update-argus.sh [opções]

Atualiza somente o Sistema LogVault desta VM a partir do repositório Git,
preservando o .env, volumes persistentes e backups.

  --check             apenas verifica se existe atualização
  --remote NOME       remoto Git (padrão: origin)
  --branch NOME       branch de atualização (padrão: branch atual)
  --skip-backup       não cria um backup adicional antes da atualização
  --yes               confirma a atualização sem nova pergunta
  -h, --help          exibe esta ajuda
EOF
}

die() {
  printf 'ERRO: %s\n' "$*" >&2
  exit 2
}

need_value() {
  [[ $# -ge 2 && -n "${2:-}" ]] || die "$1 exige um valor"
}

package_version_at() {
  local ref="$1" contents version
  if [[ "$ref" == "WORKTREE" ]]; then
    contents="$(sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$repo_root/package.json" 2>/dev/null | head -n 1)"
  else
    version="$(git -C "$repo_root" show "$ref:package.json" 2>/dev/null | sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
    contents="$version"
  fi
  printf '%s' "${contents:-desconhecida}"
}

while (($#)); do
  case "$1" in
    --check) check_only="true"; shift ;;
    --remote) need_value "$@"; remote="$2"; shift 2 ;;
    --branch) need_value "$@"; branch="$2"; shift 2 ;;
    --skip-backup) skip_backup="true"; shift ;;
    --yes) assume_yes="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "opção desconhecida: $1" ;;
  esac
done

[[ "$remote" =~ ^[A-Za-z0-9._-]+$ ]] || die "nome do remoto inválido"
if [[ -n "$branch" ]]; then
  [[ "$branch" =~ ^[A-Za-z0-9._/-]+$ && "$branch" != -* && "$branch" != *..* ]] || die "nome da branch inválido"
fi

command -v git >/dev/null 2>&1 || die "Git não encontrado"
git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "a instalação não é um checkout Git"
role=""
env_file=""
if [[ -f "$repo_root/.env" ]]; then role="dc-a"; env_file="$repo_root/.env"
elif [[ -f "$repo_root/.env.dc-b" ]]; then role="dc-b"; env_file="$repo_root/.env.dc-b"
else die "ambiente do Sistema LogVault não encontrado (.env ou .env.dc-b)"
fi
[[ -z "$(git -C "$repo_root" status --porcelain --untracked-files=no)" ]] || die "existem alterações locais em arquivos versionados; revise-as antes de atualizar"
git -C "$repo_root" remote get-url "$remote" >/dev/null 2>&1 || die "remoto Git '$remote' não encontrado"

if [[ -z "$branch" ]]; then
  branch="$(git -C "$repo_root" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  if [[ -z "$branch" ]]; then branch="$(sed -n 's/^ARGUS_DR_REPOSITORY_REF=//p' "$env_file" | tail -n1)"; fi
fi
[[ -n "$branch" ]] || die "não foi possível identificar a branch atual; use --branch"

printf 'Consultando atualizações do LogVault...\n'
git -C "$repo_root" fetch --prune --tags "$remote"
target="$remote/$branch"
git -C "$repo_root" rev-parse --verify "$target^{commit}" >/dev/null 2>&1 || die "branch remota não encontrada: $target"

current_commit="$(git -C "$repo_root" rev-parse HEAD)"
target_commit="$(git -C "$repo_root" rev-parse "$target^{commit}")"
current_version="$(package_version_at WORKTREE)"
target_version="$(package_version_at "$target")"

printf '\nAtualização do Sistema LogVault\n'
printf '  Versão instalada: %s (%s)\n' "$current_version" "${current_commit:0:7}"
printf '  Versão disponível: %s (%s)\n' "$target_version" "${target_commit:0:7}"
printf '  Origem: %s/%s\n\n' "$remote" "$branch"
printf '  Papel detectado: %s\n\n' "$role"

if [[ "$current_commit" == "$target_commit" ]]; then
  printf 'O Sistema LogVault já está atualizado.\n'
  exit 0
fi
git -C "$repo_root" merge-base --is-ancestor "$current_commit" "$target_commit" || die "o histórico remoto divergiu; atualização automática cancelada"
if [[ "$check_only" == "true" ]]; then
  printf 'Existe uma atualização disponível. Nenhuma alteração foi aplicada.\n'
  exit 0
fi

if [[ "$assume_yes" != "true" ]]; then
  [[ -t 0 ]] || die "execução não interativa exige --yes"
  answer=""
  read -r -p 'Criar backup e aplicar esta atualização? [S/n]: ' answer
  case "$answer" in n|N|nao|não|NAO|NÃO) printf 'Atualização cancelada.\n'; exit 0 ;; esac
fi

command -v docker >/dev/null 2>&1 || die "Docker não encontrado"
docker compose version >/dev/null 2>&1 || die "Docker com o plugin Compose é obrigatório"

cd "$repo_root"
dc_b_was_active="false"
if [[ "$role" == "dc-b" ]] && ARGUS_DR_ENV_FILE="$env_file" docker compose --project-name logvault-dc-b --file compose.dc-b.yaml --env-file "$env_file" --profile failover ps --status running --services | grep -qx api-b; then
  dc_b_was_active="true"
fi
ensure_env_key() {
  local key="$1" value="$2"
  grep -q "^${key}=" .env || printf '%s=%s\n' "$key" "$value" >>.env
}
if [[ "$role" == "dc-a" ]]; then
  primary_ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk 'NR==1 { for (i=1;i<=NF;i++) if ($i=="src") { print $(i+1); exit } }' || true)"
  ensure_env_key ARGUS_DR_REPLICATION_BIND "${primary_ip:-127.0.0.1}"
  ensure_env_key ARGUS_DR_REPLICATION_CIDR 10.0.0.0/8
  if ! grep -q '^ARGUS_DR_POSTGRES_REPLICATION_PASSWORD=' "$env_file"; then
    command -v openssl >/dev/null 2>&1 || die "OpenSSL é necessário para gerar a credencial de replicação"
    ensure_env_key ARGUS_DR_POSTGRES_REPLICATION_PASSWORD "$(openssl rand -hex 32)"
  fi
  ensure_env_key ARGUS_DR_POSTGRES_WAL_KEEP_SIZE 2GB
  ensure_env_key ARGUS_DR_REPOSITORY_URL https://github.com/cassianotb/logvault.git
  ensure_env_key ARGUS_DR_REPOSITORY_REF main
  data_root="$(sed -n 's/^ARGUS_DATA_ROOT=//p' "$env_file" | tail -n1)"
  if [[ -n "$data_root" && "$data_root" != "docker" ]]; then
    ensure_env_key ARGUS_PROXY_DATA_PATH "${data_root%/}/proxy-data"
    ensure_env_key ARGUS_PROXY_CONFIG_PATH "${data_root%/}/proxy-config"
    install -d -m 0750 "${data_root%/}/proxy-data" "${data_root%/}/proxy-config"
  else
    ensure_env_key ARGUS_PROXY_DATA_PATH proxy-data
    ensure_env_key ARGUS_PROXY_CONFIG_PATH proxy-config
  fi
  ensure_env_key ARGUS_HTTP_BIND 0.0.0.0
  ensure_env_key ARGUS_HTTPS_BIND 0.0.0.0
  public_url="$(sed -n 's/^ARGUS_PUBLIC_URL=//p' "$env_file" | tail -n1)"
  tls_domain="$(sed -n 's/^ARGUS_TLS_DOMAIN=//p' "$env_file" | tail -n1)"
  tls_email="$(sed -n 's/^ARGUS_TLS_EMAIL=//p' "$env_file" | tail -n1)"
  if [[ "$public_url" == https://* && -n "$tls_domain" && -n "$tls_email" ]]; then
    ensure_env_key ARGUS_PROXY_CONFIG Caddyfile.https
  else
    ensure_env_key ARGUS_PROXY_CONFIG Caddyfile.http
  fi
  chmod 0600 "$env_file"
fi
if [[ "$skip_backup" != "true" && "$role" == "dc-a" ]]; then
  docker compose --env-file "$env_file" ps --status running --services | grep -qx backup || die "serviço de backup não está em execução; corrija-o ou use --skip-backup conscientemente"
  printf 'Criando ponto de restauração antes da atualização...\n'
  docker compose --env-file "$env_file" exec -T backup /usr/local/bin/backup-once.sh
elif [[ "$skip_backup" != "true" && "$dc_b_was_active" == "true" ]]; then
  ARGUS_DR_ENV_FILE="$env_file" docker compose --project-name logvault-dc-b --file compose.dc-b.yaml --env-file "$env_file" --profile failover ps --status running --services | grep -qx backup-b \
    || die "serviço de backup do DC-B promovido não está em execução"
  printf 'Criando ponto de restauração no DC-B promovido...\n'
  ARGUS_DR_ENV_FILE="$env_file" docker compose --project-name logvault-dc-b --file compose.dc-b.yaml --env-file "$env_file" --profile failover exec -T backup-b /usr/local/bin/backup-once.sh
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "$env_file" "${env_file}.pre-update-$timestamp"
chmod 0600 "${env_file}.pre-update-$timestamp"

printf 'Aplicando atualização...\n'
git merge --ff-only "$target"
if [[ "$role" == "dc-a" ]]; then
  docker compose --env-file "$env_file" config --quiet
  docker compose --env-file "$env_file" up -d --build
  ARGUS_ENV_FILE="$env_file" "$repo_root/scripts/prepare-dc-a.sh"
  docker compose --env-file "$env_file" ps
else
  ARGUS_DR_ENV_FILE="$env_file" docker compose --project-name logvault-dc-b --file compose.dc-b.yaml --env-file "$env_file" config --quiet
  ARGUS_DR_ENV_FILE="$env_file" docker compose --project-name logvault-dc-b --file compose.dc-b.yaml --env-file "$env_file" up -d postgres-b clickhouse-b clickhouse-mirror standby-agent
  if [[ "$dc_b_was_active" == "true" ]]; then
    ARGUS_DR_ENV_FILE="$env_file" docker compose --project-name logvault-dc-b --file compose.dc-b.yaml --env-file "$env_file" --profile failover up -d --build api-b web-b proxy-b collector-b backup-b
  fi
  ARGUS_DR_ENV_FILE="$env_file" docker compose --project-name logvault-dc-b --file compose.dc-b.yaml --env-file "$env_file" --profile failover ps
fi

printf '\nLogVault atualizado de %s para %s.\n' "$current_version" "$target_version"
printf 'Configuração preservada em %s; cópia de segurança: %s.pre-update-%s\n' "$env_file" "$env_file" "$timestamp"
