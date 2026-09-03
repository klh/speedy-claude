# Diff and Sync Guide

## Diff Workflow (`sqldiff`)

Generate full SQL transform:

```bash
scripts/sqlite_diff.sh --from old.db --to new.db --out artifacts/full-diff.sql
```

Schema-only diff:

```bash
scripts/sqlite_diff.sh --from old.db --to new.db --schema-only
```

Summary only:

```bash
scripts/sqlite_diff.sh --from old.db --to new.db --summary
```

Single-table diff:

```bash
scripts/sqlite_diff.sh --from old.db --to new.db --table users
```

Reference: <https://www.sqlite.org/sqldiff.html>

### Understanding sqldiff Output

The output is valid SQL that transforms `old.db` into `new.db`:

```sql
-- Example sqldiff output:
-- Schema changes (if --schema-only used):
CREATE TABLE new_table (id INTEGER PRIMARY KEY, name TEXT);
ALTER TABLE users ADD COLUMN active BOOLEAN DEFAULT 1;
DROP TABLE old_feature;

-- Data changes (if not --schema-only):
INSERT INTO users VALUES (3, 'Alice', 'alice@example.com');
UPDATE users SET email='newemail@test.com' WHERE id=1;
DELETE FROM users WHERE id=2;
```

Apply output:

```bash
sqlite3 prod.db < full-diff.sql
```

### Edge Cases

#### Empty Output (Identical Databases)

```bash
scripts/sqlite_diff.sh --from db1.db --to db2.db
# Produces empty output if databases are identical
```

#### No Common Tables

If databases share no tables:

```bash
# Output includes all tables from target as CREATE statements
# Useful for merging schema from separate databases
```

#### Schema-Only vs Data-Only

```bash
# Schema changes only (no INSERT/UPDATE/DELETE)
scripts/sqlite_diff.sh --from old.db --to new.db --schema-only

# Data changes only (assumes schema identical)
scripts/sqlite_diff.sh --from old.db --to new.db --schema-only=false
```

## Sync Workflow (`sqlite3_rsync`)

Preview command (default dry-run):

```bash
scripts/sqlite_sync.sh --origin prod.db --replica deploy@host:/srv/prod.db
```

Apply sync:

```bash
scripts/sqlite_sync.sh --origin prod.db --replica deploy@host:/srv/prod.db --apply
```

Use WAL-only constraint:

```bash
scripts/sqlite_sync.sh --origin prod.db --replica deploy@host:/srv/prod.db --wal-only --apply
```

Reference: <https://www.sqlite.org/rsync.html>

### Remote Endpoint Format

Endpoints in `sqlite3_rsync` use SSH syntax:

```bash
# Local file
/path/to/db.db

# Remote file (SSH)
user@host:/path/to/db.db

# Example full command
scripts/sqlite_sync.sh \
  --origin local.db \
  --replica deploy@prod-server:/srv/app/data.db \
  --apply
```

### Three-Way Conflict Scenario

When origin and replica have both diverged from a common ancestor:

```text
Ancestor (initial state):
  Table: users (id=1, Alice)

Origin (added Bob):
  Table: users (id=1, Alice; id=2, Bob)

Replica (updated Alice):
  Table: users (id=1, Alice Updated; id=2, Bob was never here)
```

**Recommended approach:**

1. Use `--schema-only` first to check structural conflicts
2. Review diffs carefully before applying
3. Consider manual merge if data semantically conflicts
4. Use backup before attempting auto-sync

## Safety Notes

- Review generated diffs before applying downstream
- Keep sync in preview mode until host and path are validated
- Prefer maintenance windows for high-volume replica syncs
- Always backup databases before applying sqldiff output
- Test diffs on cloned databases first, never on live production files
