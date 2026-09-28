#!/bin/bash
set -Eeuo pipefail

primary_host="${ARGUS_DR_POSTGRES_PRIMARY_HOST:-postgres-a}"
replication_slot="${ARGUS_DR_POSTGRES_SLOT:-argus_dcb}"

if [[ "$(id -u)" == "0" ]]; then
  mkdir -p "$PGDATA" /var/run/postgresql
  chown -R postgres:postgres "$PGDATA" /var/run/postgresql
  exec gosu postgres "$0" "$@"
fi

if [[ ! -s "$PGDATA/PG_VERSION" ]]; then
  if [[ -z "${ARGUS_DR_POSTGRES_REPLICATION_PASSWORD:-}" ]]; then
    echo "ARGUS_DR_POSTGRES_REPLICATION_PASSWORD não foi definida" >&2
    exit 1
  fi

  echo "Aguardando o PostgreSQL primário em $primary_host"
  until PGPASSWORD="$ARGUS_DR_POSTGRES_REPLICATION_PASSWORD" \
    pg_isready --host "$primary_host" --port 5432 --username argus_replica --dbname postgres >/dev/null 2>&1; do
    sleep 1
  done

  echo "Criando standby pelo pg_basebackup"
  PGPASSWORD="$ARGUS_DR_POSTGRES_REPLICATION_PASSWORD" pg_basebackup \
    --host "$primary_host" \
    --port 5432 \
    --username argus_replica \
    --pgdata "$PGDATA" \
    --format plain \
    --wal-method stream \
    --write-recovery-conf \
    --create-slot \
    --slot "$replication_slot" \
    --progress
  chmod 0700 "$PGDATA"
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
