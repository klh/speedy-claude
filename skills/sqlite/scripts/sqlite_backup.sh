#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  sqlite_backup.sh --db <file> --out <backup-file> [--vacuum-into]

Options:
  --db <file>       Source database file
  --out <file>      Output backup file (refuses overwrite)
  --vacuum-into     Use VACUUM INTO instead of .backup
  -h, --help        Show this help

Safety:
  - Requires explicit --out
  - Refuses to overwrite existing output file
  - Verifies backup with PRAGMA quick_check
USAGE
}

escape_sql_literal() {
  printf '%s' "$1" | sed "s/'/''/g"
}

db_path=""
out_file=""
use_vacuum_into=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)
      [[ $# -ge 2 ]] || { echo "[ERROR] --db needs a value" >&2; usage; exit 1; }
      db_path="$2"
      shift 2
      ;;
    --out)
      [[ $# -ge 2 ]] || { echo "[ERROR] --out needs a value" >&2; usage; exit 1; }
      out_file="$2"
      shift 2
      ;;
    --vacuum-into)
      use_vacuum_into=1
      shift
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

[[ -n "$db_path" ]] || { echo "[ERROR] --db is required" >&2; usage; exit 1; }
[[ -n "$out_file" ]] || { echo "[ERROR] --out is required" >&2; usage; exit 1; }
[[ -f "$db_path" ]] || { echo "[ERROR] Database file not found: $db_path" >&2; exit 1; }

if [[ -e "$out_file" ]]; then
  echo "[ERROR] Refusing to overwrite existing output file: $out_file" >&2
  exit 1
fi

mkdir -p "$(dirname "$out_file")"

if [[ "$use_vacuum_into" -eq 1 ]]; then
  escaped_out="$(escape_sql_literal "$out_file")"
  sqlite3 "$db_path" "VACUUM INTO '$escaped_out';"
  method="VACUUM INTO"
else
  if [[ "$out_file" == *"'"* ]]; then
    echo "[ERROR] Output path containing single quotes is not supported in .backup mode" >&2
    exit 1
  fi
  sqlite3 "$db_path" ".backup '$out_file'"
  method=".backup"
fi

quick_check="$(sqlite3 -readonly "$out_file" "PRAGMA quick_check;" | head -n1)"
if [[ "$quick_check" != "ok" ]]; then
  echo "[ERROR] Backup integrity check failed: $quick_check" >&2
  exit 1
fi

source_tables="$(sqlite3 -readonly "$db_path" "SELECT count(*) FROM sqlite_master WHERE type='table';")"
backup_tables="$(sqlite3 -readonly "$out_file" "SELECT count(*) FROM sqlite_master WHERE type='table';")"

if [[ "$source_tables" != "$backup_tables" ]]; then
  echo "[ERROR] Table count mismatch (source=$source_tables backup=$backup_tables)" >&2
  exit 1
fi

echo "[OK] Backup completed with $method"
echo "[OK] Backup file: $out_file"
echo "[OK] quick_check: $quick_check"
echo "[OK] Table counts match: $source_tables"
