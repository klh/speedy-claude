#!/bin/bash
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"


usage() {
  cat <<'USAGE'
Usage: az-preflight.sh

Checks Azure CLI availability, version, and config directory accessibility.
USAGE
}

if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -n "${1:-}" ]]; then
  echo "Unknown argument: $1" >&2
  usage >&2
  exit 2
fi

if ! command -v az >/dev/null 2>&1; then
  echo "az binary: missing"
  echo "hint: install Azure CLI and ensure 'az' is on PATH"
  exit 127
fi

bin_path="$(command -v az)"
requested_config="${AZURE_CONFIG_DIR:-$HOME/.azure}"
effective_config="$requested_config"
config_note=""

if [[ -d "$requested_config" ]]; then
  if [[ ! -w "$requested_config" ]]; then
    effective_config="${TMPDIR:-/tmp}/az-config-${USER:-user}"
    mkdir -p "$effective_config"
    config_note="requested config directory is not writable; using $effective_config for this check"
  fi
else
  parent_dir="$(dirname "$requested_config")"
  if [[ ! -w "$parent_dir" ]]; then
    effective_config="${TMPDIR:-/tmp}/az-config-${USER:-user}"
    mkdir -p "$effective_config"
    config_note="cannot create requested config directory; using $effective_config for this check"
  fi
fi

version_output="$(AZURE_CONFIG_DIR="$effective_config" AZURE_CORE_COLLECT_TELEMETRY=0 az version 2>&1)"
version_rc=$?
version_value="$(printf '%s\n' "$version_output" | awk -F'"' '/"azure-cli"/ {print $4; exit}')"

echo "az binary: $bin_path"
if [[ -n "$version_value" ]]; then
  echo "az version: $version_value"
else
  echo "az version: unavailable"
fi
echo "requested config dir: $requested_config"
echo "effective config dir: $effective_config"
if [[ -n "$config_note" ]]; then
  echo "note: $config_note"
fi

if [[ $version_rc -ne 0 ]]; then
  echo "version check status: failed"
  printf '%s\n' "$version_output" | sed -n '1,20p'
  exit 1
fi

echo "version check status: ok"
