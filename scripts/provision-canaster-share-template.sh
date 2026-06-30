#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/provision-canaster-share-template.sh --site-ref <site_reference_id> [options]

Options:
  --site-ref <id>              Daptin site reference id used in subsite://<id>/index_with_og.html.
  --template-name <name>       Template row name. Default: CanasterDocument.
  --template-ref <id>          Update this template row instead of looking it up by name.
  --config <file>              daptin-cli config file. Preferred for non-local targets.
  --endpoint <url>             daptin-cli endpoint override.
  --allow-default-context      Permit daptin-cli's default context when no config/endpoint is set.
  -h, --help                   Show this help.

This script creates or updates the routed Daptin template row for /d/:username/:slug.
It intentionally uses daptin-cli only; it does not make direct HTTP or SQL calls.
USAGE
}

site_ref=""
template_name="CanasterDocument"
template_ref=""
allow_default_context="false"
explicit_target="false"
cli_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --site-ref)
      site_ref="${2:-}"
      shift 2
      ;;
    --template-name)
      template_name="${2:-}"
      shift 2
      ;;
    --template-ref)
      template_ref="${2:-}"
      shift 2
      ;;
    --config)
      cli_args+=(--config "${2:-}")
      explicit_target="true"
      shift 2
      ;;
    --endpoint)
      cli_args+=(--endpoint "${2:-}")
      explicit_target="true"
      shift 2
      ;;
    --allow-default-context)
      allow_default_context="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$site_ref" ]]; then
  echo "--site-ref is required" >&2
  exit 2
fi

if [[ "$allow_default_context" != "true" && "$explicit_target" != "true" && -z "${DAPTIN_CLI_CONFIG:-}" && -z "${DAPTIN_ENDPOINT:-}" ]]; then
  echo "Refusing to use daptin-cli's default context. Pass --config, --endpoint, or --allow-default-context." >&2
  exit 2
fi

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  printf '%s' "$value"
}

escaped_name="$(json_escape "$template_name")"
escaped_content="$(json_escape "subsite://${site_ref}/index_with_og.html")"

payload="$(cat <<JSON
{
  "type": "template",
  "name": "${escaped_name}",
  "mime_type": "text/html",
  "content": "${escaped_content}",
  "url_pattern": "[\"/d/:username/:slug\"]",
  "action_config": "{\"action\":\"get_canaster_document_by_public_path\",\"type\":\"document\"}",
  "cache_config": "{}",
  "headers": "{}"
}
JSON
)"

if [[ -z "$template_ref" ]]; then
  template_ref="$(
    daptin-cli "${cli_args[@]}" --quiet list template \
      --filter "name=${template_name}" \
      --columns reference_id 2>/dev/null | sed -n '1p' || true
  )"
  if [[ ! "$template_ref" =~ ^[0-9a-fA-F-]{36}$ ]]; then
    template_ref=""
  fi
fi

if [[ -n "$template_ref" ]]; then
  daptin-cli "${cli_args[@]}" update template "$template_ref" "$payload"
  echo "Updated template ${template_name} (${template_ref})"
else
  created_ref="$(daptin-cli "${cli_args[@]}" --quiet create template "$payload")"
  echo "Created template ${template_name} (${created_ref})"
fi
