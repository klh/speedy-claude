#!/bin/bash
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"


usage() {
  cat <<'USAGE'
Usage: az-context.sh

Shows Azure cloud and subscription context.
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
  exit 127
fi

requested_config="${AZURE_CONFIG_DIR:-$HOME/.azure}"
effective_config="$requested_config"
if [[ -d "$requested_config" && ! -w "$requested_config" ]]; then
  effective_config="${TMPDIR:-/tmp}/az-config-${USER:-user}"
  mkdir -p "$effective_config"
elif [[ ! -d "$requested_config" ]]; then
  parent_dir="$(dirname "$requested_config")"
  if [[ ! -w "$parent_dir" ]]; then
    effective_config="${TMPDIR:-/tmp}/az-config-${USER:-user}"
    mkdir -p "$effective_config"
  fi
fi

echo "requested config dir: $requested_config"
echo "effective config dir: $effective_config"

cloud_output="$(AZURE_CONFIG_DIR="$effective_config" AZURE_CORE_COLLECT_TELEMETRY=0 az cloud show --query '{name:name,profile:profile}' --output json 2>&1)"
cloud_rc=$?
account_output="$(AZURE_CONFIG_DIR="$effective_config" AZURE_CORE_COLLECT_TELEMETRY=0 az account show --query '{subscriptionId:id,subscriptionName:name,tenantId:tenantId,user:user.name,isDefault:isDefault}' --output json 2>&1)"
account_rc=$?

if [[ $cloud_rc -eq 0 ]]; then
  echo "cloud context:"
  printf '%s\n' "$cloud_output"
else
  echo "cloud context: unavailable"
  printf '%s\n' "$cloud_output" | sed -n '1,20p'
fi

if [[ $account_rc -eq 0 ]]; then
  echo "account context:"
  printf '%s\n' "$account_output"
else
  echo "account context: unavailable"
  printf '%s\n' "$account_output" | sed -n '1,20p'
fi

if [[ $cloud_rc -eq 0 && $account_rc -eq 0 ]]; then
  exit 0
fi
exit 1
