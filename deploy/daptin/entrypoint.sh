#!/usr/bin/env sh
set -eu

: "${DAPTIN_DB_CONNECTION_STRING:?DAPTIN_DB_CONNECTION_STRING is required}"

http_port="${PORT:-8080}"
case "$http_port" in
  :*) ;;
  *) http_port=":$http_port" ;;
esac

https_port="${HTTPS_PORT:-6443}"
case "$https_port" in
  :*) ;;
  *) https_port=":$https_port" ;;
esac

exec /opt/daptin/daptin \
  -runtime release \
  -port "$http_port" \
  -https_port "$https_port" \
  -db_type postgres \
  -db_connection_string "$DAPTIN_DB_CONNECTION_STRING" \
  -local_storage_path "${DAPTIN_LOCAL_STORAGE_PATH:-/data/storage}" \
  -olric_env local
