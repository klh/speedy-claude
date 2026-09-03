# Core Workflows

## 1) Preflight Then Query

```bash
scripts/sqlite_preflight.sh --require sqlite3 --min-sqlite-version 3.45.0
scripts/sqlite_safe_query.sh --db app.db --sql "SELECT name FROM sqlite_master WHERE type='table';"
```

## 2) Query to File in Markdown

```bash
scripts/sqlite_safe_query.sh \
  --db app.db \
  --sql "SELECT id, email, created_at FROM users ORDER BY created_at DESC LIMIT 20;" \
  --format markdown \
  --out reports/recent-users.md
```

## 3) Health Check with Analyzer Artifacts

```bash
scripts/sqlite_healthcheck.sh --db app.db --analyzer --out-dir reports/health
```

Artifacts:

- `reports/health/healthcheck-report.txt`
- `reports/health/sqlite3_analyzer.txt` (if analyzer is on PATH)

## 4) Backup Before Risky Changes

```bash
scripts/sqlite_backup.sh --db app.db --out backups/app-pre-migration.sqlite
```

Compact backup mode:

```bash
scripts/sqlite_backup.sh --db app.db --out backups/app-compact.sqlite --vacuum-into
```

## 5) Handoff to Advanced Skill

Use `$sqlite-file-workbench-advanced` when the task requires:

- DB-to-DB SQL diffs
- Replica sync across hosts
- Migration validation workflows
- Python/Node integration checks
