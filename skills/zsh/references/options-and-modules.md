# Options and Modules

## `setopt` and `unsetopt`

Zsh has over 150 options that control shell behavior. Enable with `setopt`, disable with `unsetopt`.

### Viewing Options

```bash
# Show all active options
setopt

# Show all inactive options (if available)
unsetopt

# Check a specific option
setopt GLOB_DOTS  # Enable
setopt | grep GLOB_DOTS  # Check if active
```

### Setting Options in `.zshrc`

```bash
setopt AUTO_CD           # Change directory without typing cd
setopt GLOB_DOTS         # Include hidden files in globbing
setopt EXTENDED_GLOB     # Enable ^, ~, # glob operators
setopt HIST_IGNORE_DUPS  # Ignore duplicate commands in history
```

## Commonly-Used Options

| Option | Effect |
| --- | --- |
| `AUTO_CD` | Type a directory name to `cd` into it |
| `CORRECT` | Suggest corrections for misspelled commands |
| `GLOB_DOTS` | Include hidden files (`.`) when globbing |
| `EXTENDED_GLOB` | Enable `^pattern` (exclude), `pattern1~pattern2` (exclude range), `#pattern`, `##pattern` |
| `HIST_IGNORE_DUPS` | Do not add commands that duplicate the previous entry |
| `HIST_IGNORE_ALL_DUPS` | Remove old duplicates from history when a new duplicate is added |
| `SHARE_HISTORY` | Share history across all Zsh sessions in real-time |
| `APPEND_HISTORY` | Append to history file on exit (default) |
| `INC_APPEND_HISTORY` | Append commands immediately, not on exit |
| `PUSHD_IGNORE_DUPS` | Do not push duplicate directories onto the stack |
| `PROMPT_SUBST` | Allow command substitution in prompts (`$(...)`) |
| `INTERACTIVE_COMMENTS` | Allow comments in interactive shells |
| `NULL_GLOB` | Expand non-matching globs to empty string instead of error |
| `NOMATCH` | Error if glob matches nothing (default; opposite of `NULL_GLOB`) |
| `PIPE_FAIL` | Return error status if any command in a pipeline fails |
| `ALWAYSLASTPROMPT` | Keep prompt at bottom of terminal (useful in scripts) |

### Side Effects of Common Options

| Option | Caution |
| --- | --- |
| `GLOB_DOTS` | Now `*` includes hidden files; use `setopt GLOB_DOTS` with caution |
| `NULL_GLOB` | Non-matching globs become empty, not an error; can hide glob mistakes |
| `EXTENDED_GLOB` | Changes glob syntax; `^`, `~`, `#` now have special meaning |

## Option Reference

See the full list:

```bash
man zshoptions
```

This man page is the authoritative reference for all options.

## `zmodload` — Load Modules

Zsh has loadable modules that extend functionality. View and load them with `zmodload`.

### Listing Loaded Modules

```bash
zmodload
```

Shows all currently loaded modules.

### Loading a Module

```bash
zmodload zsh/datetime    # Load the datetime module
zmodload zsh/mathfunc    # Load the mathfunc module
```

### Checking if a Module is Loaded

```bash
zmodload -l zsh/datetime && echo "Loaded" || echo "Not loaded"
```

## Useful Modules

| Module | Purpose |
| --- | --- |
| `zsh/datetime` | Date and time functions (`strftime`, `strptime`) |
| `zsh/files` | File manipulation functions |
| `zsh/mathfunc` | Math functions (`sin`, `cos`, `sqrt`, `log`, etc.) |
| `zsh/net/tcp` | TCP socket functions |
| `zsh/pcre` | Perl-compatible regular expressions (`pcre_match`, `pcre_study`) |
| `zsh/zftp` | FTP functions |
| `zsh/zutil` | Utility functions for Zsh extensions |
| `zsh/complist` | Enhanced completion listing |
| `zsh/terminfo` | Terminal capability functions |

### Example: Math Functions

```bash
zmodload zsh/mathfunc

# Use math functions
print $(( sin(0) ))      # 0
print $(( cos(0) ))      # 1
print $(( sqrt(16) ))    # 4
print $(( log(10) ))     # 2.302585...
```

### Example: Date/Time

```bash
zmodload zsh/datetime

# Get current timestamp
print $(( EPOCHSECONDS ))

# Format time
print $(strftime "%Y-%m-%d %H:%M:%S" $EPOCHSECONDS)
```

### Example: PCRE Regex

```bash
zmodload zsh/pcre

# Match email pattern
email="test@example.com"
if [[ $email =~ ^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$ ]]; then
  print "Valid email"
fi
```

## `emulate` — Mode Switching

Use `emulate` to switch shell compatibility modes.

### Emulate Bash

```bash
emulate bash

# Now running in Bash mode
```

### Local Emulation (in Functions)

**Always use `-L` flag to avoid leaking emulation to parent shell:**

```bash
myfunc() {
  emulate -L zsh
  setopt EXTENDED_GLOB
  # This function runs in zsh mode with EXTENDED_GLOB
  # Parent shell is unaffected
}
```

### Emulate Other Shells

```bash
emulate ksh     # Korn shell
emulate sh      # POSIX shell
emulate zsh     # Zsh (restore defaults)
```

## Common Setup Pattern

A typical `.zshrc` options section:

```bash
# Options
setopt EXTENDED_GLOB
setopt GLOB_DOTS
setopt AUTO_CD
setopt HIST_IGNORE_DUPS
setopt SHARE_HISTORY
setopt INC_APPEND_HISTORY
setopt INTERACTIVE_COMMENTS
setopt PROMPT_SUBST

# History
HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000

# Modules
zmodload zsh/datetime
zmodload zsh/mathfunc

# Initialization
autoload -Uz compinit && compinit
```

## What to Call Out in Answers

When discussing options and modules:

- **`setopt`/`unsetopt`** — changes are immediate and persist within the shell session
- **`GLOB_DOTS`** and **`EXTENDED_GLOB`** change globbing syntax; mention these explicitly if they're needed
- **`SHARE_HISTORY`** affects all Zsh sessions; use with caution in complex environments
- **Modules** must be loaded with `zmodload` before use; not all are loaded by default
- **`emulate -L`** is essential in functions to avoid leaking changes
- **Math functions** require `zmodload zsh/mathfunc`; Zsh does not load it by default
- **`man zshoptions`** is the definitive reference; always point users there for the full option list
