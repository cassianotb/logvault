#!/bin/bash
set -Eeuo pipefail

if [[ "$(id -u)" == "0" && ! -e /docker-entrypoint-initdb.d/.dr-prepared ]]; then
  for source_file in /dr-app-init/*; do
    [[ -f "$source_file" ]] || continue
    ln -s "$source_file" "/docker-entrypoint-initdb.d/$(basename "$source_file")"
  done
  ln -s /dr-replication-init/050_replication_role.sh \
    /docker-entrypoint-initdb.d/050_replication_role.sh
  touch /docker-entrypoint-initdb.d/.dr-prepared
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
