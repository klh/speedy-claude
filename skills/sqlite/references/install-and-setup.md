# SQLite3 Install & Setup

## Prerequisites

- macOS 10.13+, Linux (Debian/Fedora/Arch), or Windows
- Command-line access
- Need both `sqlite3` CLI and optionally `sqldiff` utility

## Install by Platform

| macOS | Debian/Ubuntu | Fedora/RHEL | Windows |
| --- | --- | --- | --- |
| `brew install sqlite` | `apt install sqlite3` | `dnf install sqlite` | Download from sqlite.org or `winget install SQLite.SQLite` |

**Additional tools:**

- **macOS:** `sqldiff` via `brew install sqlite` (included)
- **Linux:** `sqldiff` available in newer distros; if not, build from source or download prebuilt
- **Windows:** Download `sqlite-tools-*.zip` from <https://www.sqlite.org/download.html>

## Post-Install Configuration

### Create ~/.sqliterc

```bash
cat > ~/.sqliterc << 'EOF'
-- Output formatting
.headers on
.mode table
.separator |

-- Performance and safety
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-64000;
PRAGMA foreign_keys=ON;

-- Timing
.timer on

-- Null representation
.nullvalue NULL
EOF
```

### Set PATH for Prebuilt Binaries (Windows)

If using prebuilt `sqlite-tools-*.zip`:

1. Extract to a directory (e.g., `C:\sqlite`)
2. Add to PATH environment variable:

   ```powershell
   [Environment]::SetEnvironmentVariable("PATH", "$env:PATH;C:\sqlite", "User")
   ```

## Verification

```bash
# Check version
sqlite3 --version

# Test basic operation
sqlite3 :memory: "SELECT sqlite_version();"

# Test .sqliterc loading
sqlite3 test.db ".tables"  # Should show headers and formatted output

# Test sqldiff (if installed)
sqldiff --version

# Cleanup test
rm -f test.db
```

## Common Tasks

```bash
# Create/open database
sqlite3 my.db

# Inside sqlite3 CLI:
.databases
.tables
.schema table_name

# Run SQL file
sqlite3 my.db < script.sql

# Export to CSV
sqlite3 my.db ".mode csv" ".output file.csv" "SELECT * FROM table;"

# Backup
sqlite3 my.db ".backup backup.db"

# Analyze (optimize queries)
sqlite3 my.db "ANALYZE;"
```

## Troubleshooting

### "sqlite3: command not found"

- Install not completed. Re-run install for your platform.

### ".sqliterc not loading"

- File must be in home directory: `~/.sqliterc`
- Check permissions: `ls -la ~/.sqliterc`
- Verify with: `sqlite3 :memory: ".show"` to see current settings

### sqldiff not available

- Install separately or build from source.
- macOS: `brew install sqlite`
- Linux: Check distro package manager or download from sqlite.org

### "database is locked"

- Another process has the database open.
- Check with: `lsof | grep my.db` (on Linux/macOS)
- Or wait for other process to finish.
