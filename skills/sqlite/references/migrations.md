# Migration Validation Guide

## Goal

Validate migration SQL on a cloned database to avoid mutating the source file.

## Standard Run

```bash
scripts/sqlite_migration_validate.sh --db app.db --migration migrations/YYYYMMDD_<description>.sql
```

## With Seed Data

```bash
scripts/sqlite_migration_validate.sh \
  --db app.db \
  --seed fixtures/seed_before_migration.sql \
  --migration migrations/YYYYMMDD_<description>.sql \
  --out-dir artifacts/migration-validation
```

## Checks Performed

- Source DB copy is created in a temp or explicit output directory.
- Optional seed script is applied first.
- Migration SQL is applied with `sqlite3 -bail`.
- `PRAGMA quick_check` and `PRAGMA integrity_check` must both return `ok`.
- Foreign key violations must be zero.

## Failure Handling

- Keep generated clone/log artifacts for diagnosis.
- Fix migration SQL, then rerun validation.
- Only apply to production after validation passes.

References:

- <https://www.sqlite.org/lang_altertable.html>
- <https://www.sqlite.org/lang_transaction.html>
- <https://www.sqlite.org/pragma.html>
