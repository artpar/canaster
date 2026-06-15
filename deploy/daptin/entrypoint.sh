#!/usr/bin/env sh
set -eu

: "${DAPTIN_DB_CONNECTION_STRING:?DAPTIN_DB_CONNECTION_STRING is required}"

exec /opt/daptin/daptin \
  -runtime release \
  -port ":${PORT:-8080}" \
  -db_type postgres \
  -db_connection_string "$DAPTIN_DB_CONNECTION_STRING" \
  -local_storage_path "${DAPTIN_LOCAL_STORAGE_PATH:-/data/storage}" \
  -olric_env local
