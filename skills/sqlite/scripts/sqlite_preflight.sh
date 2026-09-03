#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  sqlite_preflight.sh --require <tool> [--require <tool>...] [--min-sqlite-version X.Y.Z]

Options:
  --require <tool>              Require a tool to exist on PATH (repeatable)
  --min-sqlite-version <ver>    Require sqlite3 version >= <ver>
  -h, --help                    Show this help

Notes:
  If no --require values are provided, the script defaults to requiring sqlite3.
USAGE
}

normalize_version() {
  local raw="${1%%[^0-9.]*}"
  local major="0"
  local minor="0"
  local patch="0"
  IFS='.' read -r major minor patch _ <<< "$raw"
  printf '%03d%03d%03d' "${major:-0}" "${minor:-0}" "${patch:-0}"
}

version_ge() {
  local left right
  left="$(normalize_version "$1")"
  right="$(normalize_version "$2")"
  [[ "$left" -ge "$right" ]]
}

requires=()
min_sqlite_version=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --require)
      [[ $# -ge 2 ]] || { echo "[ERROR] --require needs a value" >&2; usage; exit 1; }
      requires+=("$2")
      shift 2
      ;;
    --min-sqlite-version)
      [[ $# -ge 2 ]] || { echo "[ERROR] --min-sqlite-version needs a value" >&2; usage; exit 1; }
      min_sqlite_version="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ${#requires[@]} -eq 0 ]]; then
  requires=("sqlite3")
fi

missing=()
for tool in "${requires[@]}"; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "[OK] $tool: $(command -v "$tool")"
  else
    missing+=("$tool")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  echo "[ERROR] Missing required tool(s) on PATH: ${missing[*]}" >&2
  echo "[HINT] Add local SQLite toolkit to PATH:" >&2
  echo "       export PATH=\"<path-to-sqlite-toolkit>:\$PATH\"" >&2
  exit 1
fi

if [[ -n "$min_sqlite_version" ]]; then
  if ! command -v sqlite3 >/dev/null 2>&1; then
    echo "[ERROR] sqlite3 is required for version checks" >&2
    exit 1
  fi

  detected_version="$(sqlite3 -version | awk '{print $1}')"
  if [[ -z "$detected_version" ]]; then
    echo "[ERROR] Could not determine sqlite3 version" >&2
    exit 1
  fi

  if version_ge "$detected_version" "$min_sqlite_version"; then
    echo "[OK] sqlite3 version $detected_version >= $min_sqlite_version"
  else
    echo "[ERROR] sqlite3 version $detected_version is lower than required $min_sqlite_version" >&2
    exit 1
  fi
fi

echo "[OK] Preflight passed"
