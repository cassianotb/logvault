#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo_root="$(dirname "$script_dir")"
env_file="${ARGUS_ENV_FILE:-$repo_root/.env}"

die() { printf 'ERRO: %s\n' "$*" >&2; exit 2; }
read_env() { sed -n "s/^${1}=//p" "$env_file" | tail -n 1; }

[[ -r "$env_file" ]] || die "ambiente não encontrado: $env_file"
command -v docker >/dev/null 2>&1 || die "Docker não encontrado"

replication_password="$(read_env ARGUS_DR_POSTGRES_REPLICATION_PASSWORD)"
replication_cidr="$(read_env ARGUS_DR_REPLICATION_CIDR)"
[[ "$replication_password" =~ ^[A-Fa-f0-9]{32,128}$ ]] || die "senha de replicação ausente ou inválida"
[[ "$replication_cidr" =~ ^[0-9A-Fa-f:.]+/[0-9]{1,3}$ ]] || die "CIDR de replicação inválido"

cd "$repo_root"
compose=(docker compose --env-file "$env_file")
"${compose[@]}" ps --status running --services | grep -qx postgres || die "PostgreSQL principal não está em execução"

printf 'Preparando o PostgreSQL do DC-A para streaming WAL...\n'
"${compose[@]}" exec -T postgres psql --username argus --dbname argus \
  --set ON_ERROR_STOP=1 --set "replication_password=$replication_password" <<'SQL' >/dev/null
SELECT format(
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'argus_replica')
    THEN 'ALTER ROLE argus_replica WITH LOGIN REPLICATION PASSWORD %L'
    ELSE 'CREATE ROLE argus_replica WITH LOGIN REPLICATION PASSWORD %L'
  END,
  :'replication_password'
)
\gexec
SQL

"${compose[@]}" exec -T --user postgres postgres sh -s -- "$replication_cidr" <<'SH'
set -eu
cidr="$1"
rule="host replication argus_replica $cidr scram-sha-256"
grep -Fqx "$rule" "$PGDATA/pg_hba.conf" || printf '%s\n' "$rule" >>"$PGDATA/pg_hba.conf"
psql --dbname argus --set ON_ERROR_STOP=1 --command 'SELECT pg_reload_conf()' >/dev/null
SH

printf 'DC-A preparado: WAL ativo, usuário exclusivo e regra limitada a %s.\n' "$replication_cidr"
