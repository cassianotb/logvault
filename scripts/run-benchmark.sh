#!/bin/sh
set -eu

project="${ARGUS_BENCHMARK_PROJECT:-argus-benchmark}"
case "$project" in
  ''|*[!a-z0-9_-]*|[!a-z0-9]*) echo "ARGUS_BENCHMARK_PROJECT inválido" >&2; exit 2 ;;
esac

cleanup() {
  docker compose -p "$project" -f compose.benchmark.yaml down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cleanup
docker compose -p "$project" -f compose.benchmark.yaml build api
docker compose -p "$project" -f compose.benchmark.yaml up --no-build --abort-on-container-exit --exit-code-from benchmark benchmark
