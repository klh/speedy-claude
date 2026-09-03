# SQLite Documentation and Commands Reference

## Core Documentation Map

The official SQLite docs: <https://www.sqlite.org/docs.html>

### SQL Language and Pragmas

<https://www.sqlite.org/lang.html> — Complete SQL reference
<https://www.sqlite.org/pragma.html> — PRAGMA statements for tuning

### File Safety and Transactions

<https://www.sqlite.org/lockingv3.html> — How SQLite locks work
<https://www.sqlite.org/wal.html> — Write-Ahead Logging (WAL) mode
<https://www.sqlite.org/lang_transaction.html> — Transaction control

### Backup and Recovery

<https://www.sqlite.org/backup.html> — Backup API and strategies
<https://www.sqlite.org/recovery.html> — Recovery extension

## Essential PRAGMAs

| PRAGMA | Values | Purpose | Example |
| --- | --- | --- | --- |
| `journal_mode` | DELETE / WAL / TRUNCATE | Write strategy | `PRAGMA journal_mode=WAL;` |
| `cache_size` | -N (KB) | Memory pool for pages | `PRAGMA cache_size=-64000;` |
| `synchronous` | OFF / NORMAL / FULL | Disk sync behavior | `PRAGMA synchronous=NORMAL;` |
| `foreign_keys` | ON / OFF | Enable FK constraints | `PRAGMA foreign_keys=ON;` |
| `temp_store` | DEFAULT / MEMORY / FILE | Temp table location | `PRAGMA temp_store=MEMORY;` |
| `quick_check` | (run) | Integrity check (fast) | `PRAGMA quick_check;` |
| `integrity_check` | (run) | Integrity check (thorough) | `PRAGMA integrity_check;` |

## Shell Dot-Commands

Use these in `sqlite3` interactive shell:

| Command | Purpose | Example |
| --- | --- | --- |
| `.databases` | List attached databases | Shows main, temp, etc. |
| `.tables` | List all tables | Shows table names |
| `.schema` | Show table definitions | Full schema structure |
| `.schema <table>` | Show schema for one table | CREATE TABLE statement |
| `.indexes` | List all indexes | Index names |
| `.indexes <table>` | Indexes on a table | Shows index details |
| `.mode` | Set output format | `.mode table` \| `.mode json` |
| `.headers` | Toggle column headers | `.headers on` |
| `.open <file>` | Open database | `.open mydb.db` |
| `.quit` | Exit shell | `Ctrl+D` also works |
| `.import` | Import CSV/JSON | `.import data.csv users` |
| `.dump` | Export SQL | `.dump` or `.dump table_name` |
| `.read` | Execute SQL file | `.read migration.sql` |
| `.timer` | Show execution time | `.timer on` |

## Schema Inspection Queries

### List All Tables

```sql
SELECT name FROM sqlite_master
WHERE type='table' AND name NOT LIKE 'sqlite_%';
```

### Show Table Columns

```sql
PRAGMA table_info(users);
-- Returns: cid, name, type, notnull, dflt_value, pk
```

### List Indexes

```sql
SELECT name FROM sqlite_master
WHERE type='index' AND tbl_name='users';

PRAGMA index_info(users_email_idx);
-- Returns column info for index
```

### Foreign Key References

```sql
PRAGMA foreign_key_list(orders);
-- Shows which tables reference this one
```

### View All Constraints

```sql
SELECT sql FROM sqlite_master
WHERE type IN ('table', 'index', 'trigger')
ORDER BY type, name;
```

## Common PRAGMA Patterns

### Enable Foreign Keys

```sql
PRAGMA foreign_keys=ON;
-- Must be done per connection (not persistent)
```

### Optimize for SSD

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-256000;
```

### Check Database Health

```sql
PRAGMA quick_check;      -- Fast integrity check (recommended)
PRAGMA integrity_check;  -- Thorough (slow on large DBs)
PRAGMA foreign_key_check;
```

### Show Database Info

```sql
PRAGMA page_count;       -- Total pages in DB
PRAGMA page_size;        -- Bytes per page
PRAGMA database_list;    -- Attached databases
```

## Performance and Analysis

<https://www.sqlite.org/optoverview.html> — Query planner overview
<https://www.sqlite.org/sqlanalyze.html> — sqlite3_analyzer tool

### EXPLAIN QUERY PLAN

```sql
EXPLAIN QUERY PLAN
SELECT * FROM users WHERE email = 'test@example.com';
```

Shows:

- Index usage (or full scan)
- Scan type (SCAN, SEARCH)
- Whether index is used efficiently

## Advanced Tools

### Diff and Sync

<https://www.sqlite.org/sqldiff.html> — sqldiff tool for comparing databases
<https://www.sqlite.org/rsync.html> — sqlite3_rsync for remote syncing

### Version and Compatibility

<https://www.sqlite.org/changes.html> — Complete changelog
<https://www.sqlite.org/fileformat2.html> — File format details
