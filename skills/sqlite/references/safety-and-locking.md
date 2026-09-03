# Safety and Locking Guidance

## Safety Defaults

- Open databases read-only for inspection/query tasks.
- Require explicit output locations for generated artifacts.
- Avoid implicit overwrite of backup or report files.
- Fail closed when required tools are missing.

## Why Read-Only First

Read-only mode prevents accidental writes from ad-hoc SQL and avoids side effects while inspecting live data.

## Locking and Concurrency

- SQLite uses file locks to coordinate concurrent access.
- WAL mode changes read/write concurrency characteristics.
- Long write transactions can block check/backup workflows.

Use these docs for edge-case behavior:

- <https://www.sqlite.org/lockingv3.html>
- <https://www.sqlite.org/wal.html>

## Backup Strategy

- Create a backup before schema or bulk data changes.
- Verify backup integrity immediately after creation.
- Keep a timestamped artifact for rollback.

## Corruption Handling

When integrity checks fail:

1. Stop write activity.
2. Capture diagnostic output (`integrity_check`, analyzer report).
3. Create a byte-for-byte copy for forensic analysis.
4. Attempt recovery only on a cloned file.

Recovery references:

- <https://www.sqlite.org/recovery.html>
- <https://www.sqlite.org/cli.html#recover_data_from_a_corrupted_database>
