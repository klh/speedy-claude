#!/bin/bash
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"


usage() {
  cat <<'USAGE'
Usage: az-diagnostics.sh [--json] [--out <file>]

Runs az preflight, auth, and context checks and prints a combined report.
USAGE
}

json_mode=0
out_file=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help)
      usage
      exit 0
      ;;
    --json)
      json_mode=1
      shift
      ;;
    --out)
      if [[ $# -lt 2 ]]; then
        echo "--out requires a file path" >&2
        exit 2
      fi
      out_file="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

preflight_output="$($script_dir/az-preflight.sh 2>&1)"
preflight_rc=$?
auth_output="$($script_dir/az-auth-status.sh 2>&1)"
auth_rc=$?
context_output="$($script_dir/az-context.sh 2>&1)"
context_rc=$?

overall_status="ok"
overall_rc=0
if [[ $preflight_rc -ne 0 || $auth_rc -ne 0 || $context_rc -ne 0 ]]; then
  overall_status="issues"
  overall_rc=1
fi

json_escape() {
  printf '%s' "$1" \
    | tr '\t' ' ' \
    | tr -d '\000-\010\013\015\016-\037' \
    | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
    | awk 'BEGIN{ORS=\"\"} {if (NR>1) printf \"\\\\n\"; printf \"%s\", $0}'
}

emit_text() {
  cat <<TEXT
tool: az
overall_status: $overall_status

== preflight (rc=$preflight_rc) ==
$preflight_output

== auth-status (rc=$auth_rc) ==
$auth_output

== context (rc=$context_rc) ==
$context_output
TEXT
}

emit_json() {
  cat <<JSON
{
  "tool": "az",
  "overall_status": "$overall_status",
  "checks": [
    {
      "name": "preflight",
      "rc": $preflight_rc,
      "output": "$(json_escape "$preflight_output")"
    },
    {
      "name": "auth_status",
      "rc": $auth_rc,
      "output": "$(json_escape "$auth_output")"
    },
    {
      "name": "context",
      "rc": $context_rc,
      "output": "$(json_escape "$context_output")"
    }
  ]
}
JSON
}

report=""
if [[ $json_mode -eq 1 ]]; then
  report="$(emit_json)"
else
  report="$(emit_text)"
fi

if [[ -n "$out_file" ]]; then
  printf '%s\n' "$report" > "$out_file"
fi

printf '%s\n' "$report"
exit $overall_rc
