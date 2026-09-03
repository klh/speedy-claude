# SQLite SQL Patterns and Best Practices

## Schema Inspection Patterns

### Common Schema Inspection Queries

List all tables:

```sql
SELECT name FROM sqlite_master
WHERE type='table' AND name NOT LIKE 'sqlite_%'
ORDER BY name;
```

Show table definition:

```sql
SELECT sql FROM sqlite_master
WHERE type='table' AND name='users';

-- Or use PRAGMA for column details:
PRAGMA table_info(users);
-- Columns: cid, name, type, notnull, dflt_value, pk
```

Find all indexes:

```sql
SELECT name, tbl_name, sql FROM sqlite_master
WHERE type='index' AND name NOT LIKE 'sqlite_%'
ORDER BY tbl_name;
```

Check foreign key relationships:

```sql
PRAGMA foreign_key_list(orders);
-- Shows: id, seq, table, from, to, on_delete, on_update
```

## Pragma Reference Table

| PRAGMA | Purpose | Example | Effect |
| --- | --- | --- | --- |
| `journal_mode` | Write strategy | `PRAGMA journal_mode=WAL;` | Better concurrency, uses .wal file |
| `cache_size` | Memory for pages | `PRAGMA cache_size=-64000;` | Negative value = KB; improves performance |
| `synchronous` | Disk sync level | `PRAGMA synchronous=NORMAL;` | FULL = safest, NORMAL = balanced, OFF = fastest |
| `foreign_keys` | FK constraints | `PRAGMA foreign_keys=ON;` | Must set per connection (not persistent) |
| `temp_store` | Temp table location | `PRAGMA temp_store=MEMORY;` | MEMORY = faster but not persistent |
| `quick_check` | Fast integrity | `PRAGMA quick_check;` | Returns "ok" or error list |
| `integrity_check` | Thorough check | `PRAGMA integrity_check;` | Slower but comprehensive |

## WAL vs Rollback Journal

### Write-Ahead Logging (WAL)

```sql
PRAGMA journal_mode=WAL;
```

**Advantages:**

- Better concurrency (readers and writers can coexist)
- Faster commits (append-only)
- Suitable for busy databases

**Files created:**

- `mydb.db` (main database)
- `mydb.db-wal` (write-ahead log)
- `mydb.db-shm` (shared memory)

**Backup considerations:**

- Must backup all three files together
- `db-wal` and `db-shm` may be empty if no active transactions

### Rollback Journal (Default)

```sql
PRAGMA journal_mode=DELETE;
```

**Advantages:**

- Single database file
- No auxiliary files
- Simpler backup

**Disadvantages:**

- Lower concurrency
- Extra I/O to delete journal file after commit

## Query Optimization Patterns

### Use EXPLAIN QUERY PLAN

```sql
EXPLAIN QUERY PLAN
SELECT * FROM users WHERE email = 'test@example.com';

-- Output shows:
-- 0|0|0|SCAN TABLE users (~1000000 rows) -- bad: full scan
-- vs
-- 0|0|0|SEARCH TABLE users USING email_idx (~1 rows) -- good: index
```

### Create Indexes Strategically

```sql
-- Index for common WHERE clause
CREATE INDEX idx_users_email ON users(email);

-- Composite index for common filters
CREATE INDEX idx_orders_user_date ON orders(user_id, created_at);

-- Unique constraint
CREATE UNIQUE INDEX idx_users_email_unique ON users(email);

-- Check if index helps:
EXPLAIN QUERY PLAN SELECT * FROM users WHERE email='test';
```

### Check Index Usage

```sql
-- List indexes on table
PRAGMA index_list(users);
-- Returns: seq, name, unique, origin, partial

-- Show columns in index
PRAGMA index_info(idx_users_email);
-- Returns: seqno, cid, name
```

## SQLite-Specific SQL Patterns

### UPSERT (Insert or Replace)

```sql
-- SQLite 3.24+
INSERT INTO users (id, name, email) VALUES (1, 'Alice', 'alice@test.com')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  email = excluded.email;
```

### Window Functions

```sql
-- Running total
SELECT
  order_date,
  amount,
  SUM(amount) OVER (ORDER BY order_date) AS running_total
FROM orders;

-- Rank by category
SELECT
  category,
  product_name,
  price,
  RANK() OVER (PARTITION BY category ORDER BY price DESC) AS price_rank
FROM products;
```

### JSON1 Extension

```sql
-- Extract JSON fields (if json1 extension enabled)
SELECT
  id,
  json_extract(metadata, '$.user_agent') AS user_agent,
  json_extract(metadata, '$.ip_address') AS ip
FROM requests;

-- Create JSON object
SELECT json_object('id', id, 'name', name) AS json_row
FROM users;
```

## Common Patterns for Data Analysis

### Aggregation with Filtering

```sql
-- Count by category, only active users
SELECT
  category,
  COUNT(*) AS total,
  COUNT(CASE WHEN active=1 THEN 1 END) AS active_count
FROM products
GROUP BY category
HAVING COUNT(*) > 0
ORDER BY total DESC;
```

### Find Duplicates

```sql
-- Duplicate emails
SELECT email, COUNT(*) AS count
FROM users
GROUP BY email
HAVING COUNT(*) > 1;
```

### Update Based on Join

```sql
-- Set category on products from product_mapping
UPDATE products
SET category_id = (
  SELECT category_id FROM product_mapping
  WHERE product_mapping.product_id = products.id
)
WHERE id IN (SELECT product_id FROM product_mapping);
```

### Subquery Patterns

```sql
-- IN with subquery
SELECT * FROM orders
WHERE user_id IN (SELECT id FROM users WHERE active=1);

-- EXISTS check
SELECT * FROM users u
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);

-- NOT IN with potential nulls (use NOT EXISTS instead)
SELECT * FROM users u
WHERE NOT EXISTS (SELECT 1 FROM banned_users b WHERE b.user_id = u.id);
```

## Transaction Safety

### Atomic Transactions

```sql
BEGIN TRANSACTION;
INSERT INTO accounts (name, balance) VALUES ('Alice', 1000);
INSERT INTO accounts (name, balance) VALUES ('Bob', 500);
UPDATE accounts SET balance = balance - 100 WHERE name='Alice';
UPDATE accounts SET balance = balance + 100 WHERE name='Bob';
COMMIT;

-- If any statement fails, entire transaction rolls back
-- To rollback manually: ROLLBACK;
```

### Deferred vs Immediate Transactions

```sql
-- DEFERRED (default): locks acquired when needed
BEGIN DEFERRED TRANSACTION;

-- IMMEDIATE: write lock acquired at BEGIN
BEGIN IMMEDIATE TRANSACTION;

-- EXCLUSIVE: exclusive lock acquired at BEGIN
BEGIN EXCLUSIVE TRANSACTION;
```

## Export and Import Patterns

### Export to CSV

```bash
# In sqlite3 shell:
.mode csv
.output export.csv
SELECT * FROM users;
.output stdout
```

### Import from CSV

```bash
# In sqlite3 shell:
.mode csv
.import data.csv users
```

Or via SQL:

```sql
CREATE TEMP TABLE temp_import (col1, col2, col3);
-- Then import, transform, and insert into actual table
INSERT INTO users SELECT ... FROM temp_import;
```

## Performance Considerations

- Indexes help SELECT/WHERE/JOIN, slow down INSERT/UPDATE/DELETE
- Large text/blob columns: consider separate table with foreign key
- Frequent small transactions: consider batching
- Enable WAL mode for concurrent read/write workloads
- Use PRAGMA cache_size to tune memory usage
- Run ANALYZE periodically to update query optimizer statistics
