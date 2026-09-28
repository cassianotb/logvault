#!/bin/sh
set -eu

if [ -z "${ARGUS_DR_POSTGRES_REPLICATION_PASSWORD:-}" ]; then
  echo "ARGUS_DR_POSTGRES_REPLICATION_PASSWORD não foi definida" >&2
  exit 1
fi

psql --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set "replication_password=$ARGUS_DR_POSTGRES_REPLICATION_PASSWORD" <<-'SQL'
SELECT format(
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'argus_replica')
    THEN 'ALTER ROLE argus_replica WITH LOGIN REPLICATION PASSWORD %L'
    ELSE 'CREATE ROLE argus_replica WITH LOGIN REPLICATION PASSWORD %L'
  END,
  :'replication_password'
)
\gexec
SQL

# O registro "host all" criado pela imagem oficial não inclui conexões físicas
# de replicação; permita somente a sub-rede bridge dedicada do laboratório.
rule='host replication argus_replica 172.30.254.0/28 scram-sha-256'
if ! grep -Fqx "$rule" "$PGDATA/pg_hba.conf"; then
  printf '%s\n' "$rule" >> "$PGDATA/pg_hba.conf"
fi
