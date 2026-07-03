#!/usr/bin/env bash
set -euo pipefail

source_dir="${CANASTER_DAPTIN_SCHEMA_SOURCE:-daptin}"
target_dir="${CANASTER_DAPTIN_LOCAL_SCHEMA_DIR:-.tmp/daptin/local-schema}"
local_domain="${CANASTER_LOCAL_DOMAIN:-canaster.local}"
local_mail_host="${CANASTER_LOCAL_MAIL_HOST:-mail.${local_domain}}"
local_login_email="${CANASTER_LOCAL_LOGIN_EMAIL:-login@${local_domain}}"

if [[ ! -d "$source_dir" ]]; then
  echo "Schema source directory not found: ${source_dir}" >&2
  exit 2
fi

rm -rf "$target_dir"
mkdir -p "$target_dir"

shopt -s nullglob
schema_files=("$source_dir"/schema_*.yaml)
if [[ ${#schema_files[@]} -eq 0 ]]; then
  echo "No schema_*.yaml files found in ${source_dir}" >&2
  exit 2
fi

for schema_file in "${schema_files[@]}"; do
  cp "$schema_file" "$target_dir/$(basename "$schema_file")"
done

CANASTER_LOCAL_LOGIN_EMAIL="$local_login_email" \
CANASTER_LOCAL_MAIL_HOST="$local_mail_host" \
  perl -0pi -e 's/login\@canaster\.in/$ENV{CANASTER_LOCAL_LOGIN_EMAIL}/g; s/mail\.canaster\.in/$ENV{CANASTER_LOCAL_MAIL_HOST}/g;' \
  "$target_dir"/schema_*.yaml

echo "Prepared local Daptin schema in ${target_dir}"
echo "Local OTP sender: ${local_login_email}"
echo "Local mail host: ${local_mail_host}"
