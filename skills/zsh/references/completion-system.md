# Completion System

Zsh's completion system is one of its greatest strengths. It provides intelligent, context-aware command completion.

## Initialization

### Basic Initialization

In your `.zshrc`:

```bash
autoload -Uz compinit
compinit
```

The `-U` flag prevents alias expansion. The `-z` flag loads from a zsh script (no conversion). `compinit` initializes the completion system and generates a dump file (`~/.zcompdump`) for faster startup.

### Post-Update Reset

If you install new completion functions, regenerate the dump:

```bash
compinit -u
```

The `-u` flag forces an update even if the dump is recent.

### Troubleshooting Slow Startup

If Zsh startup is slow after `compinit`:

```bash
# Delete the dump file
rm ~/.zcompdump*

# Reinitialize
zsh -c 'autoload -Uz compinit && compinit'

# Or optimize: check for updates less frequently
compinit -C  # Skip update checks if dump is recent
```

## How It Works

The completion system has three main layers:

1. **Completion functions** (`_complete`, `_main_complete`, etc.) — triggered by `<Tab>`
2. **Widget system** — maps keystrokes to completion actions
3. **`compadd`** — adds completion candidates

When you press `<Tab>`, Zsh calls the appropriate completion function, which uses `compadd` to generate candidates.

## The `zstyle` System

`zstyle` configures completion behavior. Syntax:

```bash
zstyle 'context' setting value
```

### Common Contexts

| Context | Applies To |
| --- | --- |
| `:completion:*` | All completions |
| `:completion:*:commands` | Command name completions |
| `:completion:*:descriptions` | Descriptions in listings |
| `:completion:*:git:*` | Git-specific completions (if function exists) |

### Essential Settings

#### Enable Menu Selection

```bash
zstyle ':completion:*' menu select
```

Allows arrow-key navigation through completion candidates.

#### Colors for File Types

```bash
zstyle ':completion:*' list-colors "di=34:*.sh=32:*.txt=37"
```

Colors directories blue, shell scripts green, text files white.

#### Case-Insensitive Matching

```bash
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'
```

Matches lowercase input against uppercase options.

#### Approximate Matching (Typo Tolerance)

```bash
zstyle ':completion:*' matcher-list '' 'm:{a-z}={A-Z}' 'r:|[._-]=* r:|=* l:|=*'
```

The last pattern allows `l:|=*` to match if you type a prefix (e.g., `gr` matches `great`).

#### Group Completions by Category

```bash
zstyle ':completion:*' group-name ''
zstyle ':completion:*:descriptions' format '%B%d%b'
```

Groups completions (e.g., "commands", "files") with bold headers.

#### Ignore Directories When Listing Files

```bash
zstyle ':completion:*:*:cd:*' ignored-patterns '.*'
```

When using `cd`, ignore hidden directories.

## Writing Simple Completions

### Basic Completion Function

Create a file `_mycmd` in `~/.zsh/completions/` or anywhere on `$fpath`:

```bash
#compdef mycmd

_arguments \
  '-h[show help]' \
  '-v[verbose]' \
  '1: :_files'
```

This defines:

- `-h` option with description "show help"
- `-v` option with description "verbose"
- First positional argument: any file

Load your custom completions in `.zshrc`:

```bash
fpath=(~/.zsh/completions $fpath)
autoload -Uz compinit && compinit
```

### Using `compadd`

Directly add candidates:

```bash
_simple_complete() {
  local items=(apple banana cherry)
  compadd -a items
}
```

The `-a` flag tells `compadd` to treat the argument as an array.

### `compdef` — Alias a Completion

If two commands share the same completion, alias it:

```bash
compdef _git git-flow
```

This tells `git-flow` to use the completion from `_git`.

## Debugging Completions

### Enable Debug Tracing

```bash
zstyle ':completion:*' debug on
```

Or use environment variables:

```bash
ZSH_COMPLETION_DEBUG=1 zsh
```

Then press `<Tab>` to see debug output.

### List Completion State

```bash
print -l ${(ko)compstate}
```

Shows internal completion state (e.g., current word, context, prefix).

## Common `zstyle` Recipes

### Recipe: Basic User-Friendly Setup

```bash
# In ~/.zshrc
autoload -Uz compinit
compinit

# Enable menu selection
zstyle ':completion:*' menu select

# Case-insensitive
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'

# Colors for files
zstyle ':completion:*' list-colors "di=34:*.sh=32"

# Group descriptions
zstyle ':completion:*' group-name ''
zstyle ':completion:*:descriptions' format '%B%d%b'
```

### Recipe: Aggressive Typo Tolerance

```bash
zstyle ':completion:*' matcher-list \
  '' \
  'm:{a-zA-Z}={A-Za-z}' \
  'r:|[._-]=* r:|=*' \
  'l:|=* r:|=*'
```

This enables:

1. Exact match
2. Case-insensitive
3. Partial-word matching (`gr` → `great`)
4. Substring matching

### Recipe: Partial-Word Matching

```bash
zstyle ':completion:*' matcher-list 'r:|.=* m:{a-z}={A-Z}'
```

Allows `l.sh` to match `localhost.sh`.

## What to Call Out in Answers

When discussing Zsh completions:

- **`compinit` initialization** is required; it's not automatic
- **Completion functions** live on `$fpath`, not in a single directory
- **`zstyle` configuration** applies globally; changes take effect after `compinit` or in a new shell
- **Menu selection** (`zstyle ':completion:*' menu select`) transforms `<Tab>` into a navigable list
- **Typo tolerance** requires careful `matcher-list` configuration; test before deploying
- **Performance** can suffer if too many completion functions are on `$fpath`; clean up unused ones
- Use `compinit -C` in `.zshrc` for faster startup if you don't install new completions frequently
