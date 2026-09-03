#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  sqlite_healthcheck.sh --db <file> [--analyzer] [--out-dir <dir>]

Options:
  --db <file>      Database file path
  --analyzer       Run sqlite3_analyzer report
  --out-dir <dir>  Directory for output artifacts (created if needed)
  -h, --help       Show this help
USAGE
}

file_size_bytes() {
  local file="$1"
  if stat -f%z "$file" >/dev/null 2>&1; then
    stat -f%z "$file"
  else
    stat -c%s "$file"
  fi
}

db_path=""
run_analyzer=0
out_dir=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db)
      [[ $# -ge 2 ]] || { echo "[ERROR] --db needs a value" >&2; usage; exit 1; }
      db_path="$2"
      shift 2
      ;;
    --analyzer)
      run_analyzer=1
      shift
      ;;
    --out-dir)
      [[ $# -ge 2 ]] || { echo "[ERROR] --out-dir needs a value" >&2; usage; exit 1; }
      out_dir="$2"
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

if [[ -n "$out_dir" ]]; then
  mkdir -p "$out_dir"
fi

status=0
quick_check=""
integrity_check=""
fk_violations=""
sqlite_error=""

if quick_out="$(sqlite3 -readonly "$db_path" "PRAGMA quick_check;" 2>&1)"; then
  quick_check="$(printf '%s\n' "$quick_out" | head -n1)"
else
  status=1
  quick_check="error"
  sqlite_error="$quick_out"
fi

if integrity_out="$(sqlite3 -readonly "$db_path" "PRAGMA integrity_check;" 2>&1)"; then
  integrity_check="$(printf '%s\n' "$integrity_out" | head -n1)"
else
  status=1
  integrity_check="error"
  if [[ -z "$sqlite_error" ]]; then
    sqlite_error="$integrity_out"
  fi
fi

if fk_out="$(sqlite3 -readonly "$db_path" "SELECT count(*) FROM pragma_foreign_key_check;" 2>&1)"; then
  fk_violations="$(printf '%s\n' "$fk_out" | tr -d '[:space:]')"
else
  status=1
  fk_violations="error"
  if [[ -z "$sqlite_error" ]]; then
    sqlite_error="$fk_out"
  fi
fi

page_count="$(sqlite3 -readonly "$db_path" "PRAGMA page_count;" 2>/dev/null | head -n1 || true)"
page_size="$(sqlite3 -readonly "$db_path" "PRAGMA page_size;" 2>/dev/null | head -n1 || true)"
file_size="$(file_size_bytes "$db_path")"

if [[ "$quick_check" != "ok" ]]; then
  status=1
fi
if [[ "$integrity_check" != "ok" ]]; then
  status=1
fi
if [[ "$fk_violations" != "0" ]]; then
  status=1
fi

report_lines=()
report_lines+=("SQLite Healthcheck")
report_lines+=("Database: $db_path")
report_lines+=("File size (bytes): ${file_size:-unknown}")
report_lines+=("Page count: ${page_count:-unknown}")
report_lines+=("Page size: ${page_size:-unknown}")
report_lines+=("quick_check: ${quick_check:-unknown}")
report_lines+=("integrity_check: ${integrity_check:-unknown}")
report_lines+=("foreign_key_violations: ${fk_violations:-unknown}")

analyzer_artifact=""
if [[ "$run_analyzer" -eq 1 ]]; then
  if ! command -v sqlite3_analyzer >/dev/null 2>&1; then
    report_lines+=("analyzer: missing sqlite3_analyzer on PATH")
    status=1
  else
    if [[ -n "$out_dir" ]]; then
      analyzer_artifact="$out_dir/sqlite3_analyzer.txt"
      if sqlite3_analyzer "$db_path" > "$analyzer_artifact" 2>&1; then
        report_lines+=("analyzer: wrote $analyzer_artifact")
      else
        report_lines+=("analyzer: failed")
        status=1
      fi
    else
      report_lines+=("analyzer: writing report to stdout")
      if ! sqlite3_analyzer "$db_path"; then
        report_lines+=("analyzer: failed")
        status=1
      fi
    fi
  fi
fi

if [[ -n "$sqlite_error" ]]; then
  report_lines+=("sqlite_error: $sqlite_error")
fi

printf '%s\n' "${report_lines[@]}"

if [[ -n "$out_dir" ]]; then
  report_file="$out_dir/healthcheck-report.txt"
  printf '%s\n' "${report_lines[@]}" > "$report_file"
  echo "[OK] Health report written to $report_file"
fi

if [[ "$status" -eq 0 ]]; then
  echo "[OK] Healthcheck passed"
else
  echo "[ERROR] Healthcheck failed" >&2
fi

exit "$status"
