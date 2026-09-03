# SQL best practices

## Scope

- Start by confirming the SQL dialect, workload type, and migration model before giving specific guidance.
- Distinguish application DDL, OLTP query paths, analytics workloads, stored procedures, ETL scripts, and migration files because their tradeoffs differ.
- Prefer project-local conventions when they are already automated and internally consistent.
- Use the defaults below when the repository has no clear standard.

## Dialect and workload gates

Confirm these first because they materially change the recommendations:

- **Dialect**: PostgreSQL, SQL Server, MySQL or MariaDB, Oracle, SQLite, Snowflake, BigQuery, or another engine.
- **Execution model**: ad hoc queries, ORM-generated SQL, migration scripts, hand-written reporting, stored procedures, or data warehouse transformations.
- **Workload**: OLTP, OLAP, mixed workload, or offline batch processing.
- **Operational constraints**: transaction isolation, replication lag, partitioning, locking behavior, and privileged access.

## Review priorities

- identify correctness and behavior-preservation constraints before recommending stylistic cleanup
- prefer conventions that make ownership, dependencies, and change seams easier to understand
- keep project-local standards when they are already automated and internally consistent
- distinguish language-level SQL guidance from engine-specific optimizer and DDL behavior
- treat schema design, transaction behavior, and explain-plan evidence as core review topics

## Default design choices

### Query shape and readability

- Prefer explicit column lists over `SELECT *` in stable application queries.
- Use consistent aliasing, indentation, and clause ordering so query intent is easy to review.
- Break complex work into named CTEs or views only when that improves comprehension or reuse.
- Keep data-changing statements and reporting queries clearly separated.

### Schema design

- Model integrity in the database using keys, constraints, defaults, and appropriate nullability.
- Normalize first, then denormalize only when a measured workload justifies it.
- Name tables, columns, indexes, and constraints predictably.
- Make temporal, monetary, and status fields semantically explicit rather than encoding meaning in generic text columns.

### Safety and performance

- Use parameterized SQL instead of string-built statements.
- Design indexes from real predicates, joins, and sort patterns rather than guesswork.
- Validate query plans with engine-native tools before recommending hints, denormalization, or optimizer workarounds.
- Be deliberate about transaction scope, lock duration, and isolation assumptions.
- Treat row-by-row procedural loops as a smell until proven necessary.

## Tooling baseline

| Concern | Preferred baseline |
| --- | --- |
| formatting | one repository-wide SQL formatter or style guide |
| linting | dialect-aware SQL linting where available |
| migration discipline | one migration tool or clear migration contract |
| verification | engine-native `EXPLAIN` or equivalent plan inspection for performance-sensitive queries |
| tests | migration tests plus representative integration or data-contract tests |

## Common red flags

- dialect-specific features used without acknowledging the engine lock-in
- string concatenation used to build live SQL statements
- `SELECT *` in stable application code or views that form long-lived contracts
- nullable columns used to smuggle multiple business states into one field
- missing constraints or indexes on columns that clearly define identity or join paths
- performance advice offered without actual plan inspection or workload evidence

## Review checklist

- [ ] The dialect, execution model, and workload are identified before advice becomes specific.
- [ ] Query shape is readable and uses explicit columns where long-lived contracts matter.
- [ ] Integrity rules live in the schema when the database can enforce them.
- [ ] Transaction scope, lock behavior, and isolation assumptions are visible.
- [ ] Parameters are bound safely rather than interpolated into SQL text.
- [ ] Explain-plan or runtime evidence supports any tuning recommendation.

## Migration playbook

- standardize formatting and migration mechanics before changing schema semantics
- add missing constraints and indexes in a way that matches the engine's rollout story
- parameterize live query paths before polishing style-only layout issues
- capture explain plans or benchmark evidence before proposing heavy denormalization or hints
- document dialect assumptions explicitly when portability is not a goal

## Reference starting points

- [SQL Style Guide](https://www.sqlstyle.guide/)
- [PostgreSQL documentation](https://www.postgresql.org/docs/)
- [MySQL Reference Manual](https://dev.mysql.com/doc/)
- [Oracle SQL Reference](https://docs.oracle.com/en/database/oracle/oracle-database/)
- [SQL Server documentation](https://learn.microsoft.com/en-us/sql/)
