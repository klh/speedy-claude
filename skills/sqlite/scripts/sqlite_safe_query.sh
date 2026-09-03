#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  sqlite_safe_query.sh --db <file> (--sql <text> | --sql-file <file>) [--format table|csv|json|markdown] [--out <file>]

Options:
  --db <file>            Database file path
  --sql <text>           SQL text to run (read-only)
  --sql-file <file>      SQL file to run (read-only)
  --format <format>      Output format: table|csv|json|markdown (default: table)
  --out <file>           Write query output to file (refuses overwrite)
  -h, --help             Show this help

Safety:
  - Opens database with sqlite3 -readonly
  - Rejects sqlite dot-commands in provided SQL
USAGE
}

db_path=""
sql_text=""
sql_file=""
format="table"
out_file=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)
      [[ $# -ge 2 ]] || { echo "[ERROR] --db needs a value" >&2; usage; exit 1; }
      db_path="$2"
      shift 2
      ;;
    --sql)
      [[ $# -ge 2 ]] || { echo "[ERROR] --sql needs a value" >&2; usage; exit 1; }
      sql_text="$2"
      shift 2
      ;;
    --sql-file)
      [[ $# -ge 2 ]] || { echo "[ERROR] --sql-file needs a value" >&2; usage; exit 1; }
      sql_file="$2"
      shift 2
      ;;
    --format)
      [[ $# -ge 2 ]] || { echo "[ERROR] --format needs a value" >&2; usage; exit 1; }
      format="$2"
      shift 2
      ;;
    --out)
      [[ $# -ge 2 ]] || { echo "[ERROR] --out needs a value" >&2; usage; exit 1; }
      out_file="$2"
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

[[ -n "$db_path" ]] || { echo "[ERROR] --db is required" >&2; usage; exit 1; }
[[ -f "$db_path" ]] || { echo "[ERROR] Database file not found: $db_path" >&2; exit 1; }

if [[ -n "$sql_text" && -n "$sql_file" ]]; then
  echo "[ERROR] Use either --sql or --sql-file, not both" >&2
  exit 1
fi

if [[ -z "$sql_text" && -z "$sql_file" ]]; then
  echo "[ERROR] One of --sql or --sql-file is required" >&2
  exit 1
fi

if [[ -n "$sql_file" ]]; then
  [[ -f "$sql_file" ]] || { echo "[ERROR] SQL file not found: $sql_file" >&2; exit 1; }
  sql_text="$(cat "$sql_file")"
fi

if [[ -z "$sql_text" ]]; then
  echo "[ERROR] SQL input is empty" >&2
  exit 1
fi

if printf '%s\n' "$sql_text" | grep -Eq '^[[:space:]]*\.'; then
  echo "[ERROR] sqlite dot-commands are not allowed in query input" >&2
  exit 1
fi

case "$format" in
  table|csv|json|markdown)
    ;;
  *)
    echo "[ERROR] Unsupported --format '$format'" >&2
    exit 1
    ;;
esac

if [[ -n "$out_file" && -e "$out_file" ]]; then
  echo "[ERROR] Refusing to overwrite existing output file: $out_file" >&2
  exit 1
fi

if [[ -n "$out_file" ]]; then
  mkdir -p "$(dirname "$out_file")"
fi

tmp_cmd="$(mktemp /tmp/sqlite-safe-query.XXXXXX.sql)"
trap 'rm -f "$tmp_cmd"' EXIT

{
  echo ".bail on"
  echo ".headers on"
  case "$format" in
    table) echo ".mode table" ;;
    csv) echo ".mode csv" ;;
    json) echo ".mode json" ;;
    markdown) echo ".mode markdown" ;;
  esac
  printf '%s\n' "$sql_text"
} > "$tmp_cmd"

if [[ -n "$out_file" ]]; then
  sqlite3 -readonly "$db_path" < "$tmp_cmd" > "$out_file"
  echo "[OK] Query output written to $out_file" >&2
else
  sqlite3 -readonly "$db_path" < "$tmp_cmd"
fi

echo "[OK] Read-only query completed" >&2
