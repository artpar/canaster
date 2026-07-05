#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

status=0

if rg -n '\bgetDaptinClient\b|\.jsonApi\b|\.actionManager\b|\.worldManager\b|\.authManager\b' src/infra/daptin --glob '!daptinClient.ts'; then
  printf '\nDaptin infra services must use the wrapper functions from src/infra/daptin/daptinClient.ts.\n'
  status=1
fi

if rg -n 'query\[\]\[(column|operator|value)\]' src; then
  printf '\nDaptin query filters must be sent as a JSON string through daptinFindAll/daptinFind, not bracket query params.\n'
  status=1
fi

exit "$status"
