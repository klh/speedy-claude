# Python and Node Integration Smoke Checks

## Purpose

Confirm runtime-level DB connectivity without changing data.

## Python-only

```bash
scripts/sqlite_integration_smoke.sh --db app.db --python
```

Checks:

- Python runtime availability
- Read-only connection
- `SELECT 1`
- Table-count query

## Node-only

```bash
scripts/sqlite_integration_smoke.sh --db app.db --node
```

Checks:

- Node runtime availability
- Preferred: `node:sqlite` read-only query
- Fallback: invoke `sqlite3 -readonly` from Node child process

## Combined

```bash
scripts/sqlite_integration_smoke.sh --db app.db
```

## Notes

- Missing runtimes are reported as skipped, not hard crashes.
- SQL failures in available runtimes fail the smoke test.
- Use this as a fast gate before deeper application tests.
