# CLI and Help

## Invocation Modes

### Interactive Shell

```bash
zsh
```

Loads `.zshenv`, `.zprofile`, and `.zshrc`.

### Login Shell

```bash
zsh -l
```

Ensures `.zprofile` and `.zlogin` are loaded.

### Script Mode

```bash
zsh script.sh
```

Loads `.zshenv` only; `.zshrc` is skipped. Useful for running Zsh scripts without interactive configuration.

### No Startup Files

```bash
zsh -f
```

Skips all startup files. Useful for testing in a clean environment.

### Emulation Mode

```bash
zsh --emulate bash
```

Run Zsh in Bash-compatible mode. Useful for debugging when Bash and Zsh behavior differ.

## Startup File Load Order

### Login + Interactive Shell

```text
.zshenv
.zprofile
.zshrc
.zlogin
```

### Interactive (Non-login)

```text
.zshenv
.zshrc
```

### Script (Non-interactive)

```text
.zshenv
```

Only `.zshenv` is loaded. Put non-interactive setup here.

### With `-f` (No Startup Files)

No startup files are loaded.

## High-Value Flags

| Flag | Purpose |
| --- | --- |
| `-x` | Enable execution tracing (`set -x`) — shows each command as it's executed |
| `-n` | Syntax check only; do not execute (like `bash -n`) |
| `-c` | Execute command: `zsh -c 'print "hello"'` |
| `-s` | Read commands from stdin |
| `-i` | Force interactive mode |
| `-l` | Act as login shell |
| `-f` | No startup files |
| `--emulate bash` | Run in Bash compatibility mode |
| `--version` | Print Zsh version |

## Local Help Workflow

### Start with the Roadmap

```bash
man zshroadmap
```

This provides a guided tour of Zsh's 17 man pages and tells you where to find what you need.

### General Zsh Manual

```bash
man zsh
```

Comprehensive reference covering invocation, options, and overview.

### Specific Topic Pages

Use `man` for topic-specific information:

| Man Page | Subject |
| --- | --- |
| `zshbuiltins` | All Zsh builtins (cd, print, autoload, etc.) |
| `zshoptions` | All shell options (setopt/unsetopt) |
| `zshexpn` | Parameter expansion, history expansion, globbing |
| `zshcompsys` | Completion system, `compinit`, `zstyle` |
| `zshzle` | Zsh Line Editor, keybindings, widgets |
| `zshcontrib` | User contributions and extensions |
| `zshmodules` | Loadable modules (`zmodload`) |
| `zshmathfunc` | Math functions |
| `zshparam` | Parameters (variables) |
| `zshfunctions` | Function definitions |
| `zshcalsys` | Calendar system |
| `zsharith` | Arithmetic evaluation |
| `zshall` | Complete manual (very long) |
| `zshpatsys` | Pattern matching system |
| `zshmisc` | Miscellaneous features |
| `zsh_beta_features` | Experimental features |

### Online Documentation

Visit [zsh.sourceforge.io](https://zsh.sourceforge.io) for the full manual, FAQ, and community resources.

## Command Discovery

### `whence` — Find Command Origin

```bash
whence -a ls
```

Shows all definitions of `ls` (builtin, alias, function, external command).

```bash
whence -w ls
```

Shows command type (`builtin`, `alias`, `function`, `file`).

```bash
whence -v ls
```

Verbose output showing the full command definition.

### `where` — Find All Paths

```bash
where zsh
```

Shows all instances of the command in `$PATH`.

### `which` — Bash Compatibility

```bash
which zsh
```

Works in Zsh for bash compatibility but less informative than `whence`.

### `type` — Bash Compatibility Alias

In interactive Zsh, `type` is often aliased to `whence`. Check:

```bash
whence -w type
```

## Useful Local Checks

### Check Zsh Version in Running Shell

```bash
print $ZSH_VERSION
```

### List All Builtins

```bash
print -l ${(ok)builtins}
```

The `(ok)` flag sorts the output alphabetically.

### Check Active Options

```bash
setopt
```

Shows all active options.

```bash
unsetopt
```

Shows all inactive options (in some shells).

### List Loaded Modules

```bash
zmodload
```

Shows all currently loaded modules.

### Check Manual Availability

```bash
man zsh 1>/dev/null 2>&1 && echo "Manual found" || echo "Manual not found"
```

## What to Call Out in Answers

When providing Zsh help:

- Always mention if an answer applies to **macOS system Zsh 5.9** vs. **newer Homebrew Zsh**
- Note when a feature requires a specific option or module
- Call out ZLE, glob qualifiers, and completion as Zsh-specific strengths
- Remind users that `.zshrc` only loads in interactive shells (not scripts)
- Point to `man zshroadmap` as the entry point for self-service learning
