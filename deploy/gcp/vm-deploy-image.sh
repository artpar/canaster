#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:?image is required}"
PROJECT_ID="${GCP_PROJECT:-}"
REGION="${GCP_REGION:-asia-south1}"
DB_SECRET="${DAPTIN_DB_SECRET:-canaster-daptin-vm-db-connection}"
STORAGE_DIR="${DAPTIN_STORAGE_DIR:-/opt/canaster/data/storage}"
CONTAINER_NAME="${DAPTIN_CONTAINER_NAME:-canaster-daptin}"

metadata() {
  curl -fsS -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/$1"
}

json_field() {
  python3 -c "import json, sys; print(json.load(sys.stdin)$1)"
}

if [[ -z "$PROJECT_ID" ]]; then
  PROJECT_ID="$(metadata project/project-id)"
fi

ACCESS_TOKEN="$(metadata instance/service-accounts/default/token | json_field "['access_token']")"

secret_access() {
  curl -fsS \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    "https://secretmanager.googleapis.com/v1/projects/$PROJECT_ID/secrets/$DB_SECRET/versions/latest:access" \
    | python3 -c "import base64, json, sys; print(base64.b64decode(json.load(sys.stdin)['payload']['data']).decode(), end='')"
}

DAPTIN_DB_CONNECTION_STRING="$(secret_access)"

ensure_password_signin_permission() {
  docker run --rm --network host postgres:16-alpine \
    psql "$DAPTIN_DB_CONNECTION_STRING" -v ON_ERROR_STOP=1 -q -P pager=off <<'SQL'
UPDATE action
   SET permission = 2085152,
       updated_at = now()
 WHERE action_name = 'signin'
   AND permission <> 2085152;
SQL
}

mkdir -p "$STORAGE_DIR"
chmod 0755 /opt/canaster /opt/canaster/data "$STORAGE_DIR"

systemctl stop exim4.service >/dev/null 2>&1 || true
service exim4 stop >/dev/null 2>&1 || true
pkill -x exim4 >/dev/null 2>&1 || true
systemctl disable exim4.service >/dev/null 2>&1 || true

printf '%s' "$ACCESS_TOKEN" | docker login -u oauth2accesstoken --password-stdin "https://$REGION-docker.pkg.dev" >/dev/null
docker pull "$IMAGE"

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p 80:8080 \
  -p 443:6443 \
  -p 25:25 \
  -p 465:465 \
  -p 587:587 \
  -p 993:993 \
  -e PORT=8080 \
  -e HTTPS_PORT=6443 \
  -e DAPTIN_DB_CONNECTION_STRING="$DAPTIN_DB_CONNECTION_STRING" \
  -e DAPTIN_SCHEMA_FOLDER=/opt/canaster/schema \
  -e DAPTIN_LOCAL_STORAGE_PATH=/data/storage \
  -e DAPTIN_STORAGE=/data/storage \
  -v "$STORAGE_DIR:/data/storage" \
  "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if curl -fsS -H "Host: api.canaster.in" "http://127.0.0.1/api/world?page%5Bsize%5D=1" >/dev/null; then
    ensure_password_signin_permission
    exit 0
  fi
  sleep 2
done

docker logs "$CONTAINER_NAME" --tail=200
exit 1
