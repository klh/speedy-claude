# Troubleshooting

## First-Pass Triage

When something is wrong, gather diagnostic information:

```bash
# Check version
zsh --version

# Check active options
setopt

# Check if in Zsh
echo $ZSH_VERSION

# Check loaded modules
zmodload

# Test in clean shell
zsh -f -i -c exit
```

## Startup Failures

### Symptom: Zsh Won't Start / Exits Immediately

**Cause:** Syntax error in `.zshenv`, `.zprofile`, or `.zshrc`.

**Diagnosis:**

```bash
zsh -x -c ''
```

This runs Zsh in trace mode (`-x`) and with no commands (`-c ''`), printing each command executed. Look for error messages.

**Fix:**

1. Check the syntax of your startup files:

   ```bash
   zsh -n ~/.zshrc
   ```

   This checks syntax without executing.

2. Comment out lines in `.zshrc` and test incrementally:

   ```bash
   # zsh -i -c exit  # Test startup
   ```

3. Isolate the problematic file:

   ```bash
   mv ~/.zshrc ~/.zshrc.bak
   zsh -f
   # If it works, the problem is in .zshrc
   ```

### Symptom: "Command Not Found" Errors at Startup

**Cause:** A command in `.zshrc` is not available at startup.

**Diagnosis:**

```bash
zsh -x
# Look for "command not found" errors
```

**Fix:**

Use `command -v` to check availability before running:

```bash
# In .zshrc
if command -v my_cmd &>/dev/null; then
  my_cmd
fi
```

## Completion Breakage

### Symptom: Completion Doesn't Work / Hangs

**Cause 1:** `compinit` not called.

**Fix:**

```bash
autoload -Uz compinit
compinit
```

**Cause 2:** Corrupted dump file (`~/.zcompdump*`).

**Fix:**

```bash
rm ~/.zcompdump*
zsh -c 'autoload -Uz compinit && compinit'
```

**Cause 3:** Too many completion functions on `$fpath`.

**Fix:**

Check `$fpath`:

```bash
print -l $fpath
```

Remove unused directories:

```bash
# In .zshrc, before compinit
fpath=(~/.zsh/completions /usr/share/zsh/site-functions)
```

## Globbing Errors

### Symptom: Glob Pattern Doesn't Match / Unexpected Results

**Cause 1:** `EXTENDED_GLOB` not enabled.

**Example:**

```bash
setopt EXTENDED_GLOB
ls ^*.txt  # Now excludes .txt files
```

**Cause 2:** `GLOB_DOTS` not enabled for hidden files.

**Example:**

```bash
setopt GLOB_DOTS
ls .*  # Now matches hidden files
```

**Cause 3:** `NULL_GLOB` changes behavior.

**Example:**

```bash
# Without NULL_GLOB
ls *.nonexistent  # Error: no matches found

# With NULL_GLOB
setopt NULL_GLOB
ls *.nonexistent  # Returns empty list
```

## History Not Saving

### Symptom: Commands Not in History After Exit

**Cause:** `HISTFILE` or `SAVEHIST` not set, or conflict with other shells.

**Diagnosis:**

```bash
print $HISTFILE
print $SAVEHIST
```

**Fix:**

In `.zshrc`:

```bash
HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000

# Also add one of these:
setopt APPEND_HISTORY        # Append on exit (default)
setopt INC_APPEND_HISTORY    # Append immediately
```

### Symptom: History is Being Overwritten

**Cause:** `SHARE_HISTORY` with conflicting shell instances.

**Fix:**

If using multiple terminal windows:

```bash
# Instead of SHARE_HISTORY:
setopt APPEND_HISTORY
setopt INC_APPEND_HISTORY
unsetopt SHARE_HISTORY
```

## Slow Startup

### Symptom: `zsh -i -c exit` Takes > 1 Second

**Diagnosis:**

```bash
time zsh -i -c exit
```

If slow, profile startup:

```bash
zsh -i -x -c exit 2>&1 | head -50
```

Look for slow commands or large numbers of iterations.

**Common Causes:**

1. **Oh-My-Zsh or frameworks**
   - They load many plugins and functions
   - Comment them out temporarily to measure baseline

2. **Too many completion functions**
   - Remove unused entries from `$fpath`

3. **Network operations in `.zshrc`**
   - Avoid `git`, `curl`, etc. in startup files
   - Use lazy loading for heavy operations

**Fixes:**

1. **Use `compinit -C`** to skip some checks:

   ```bash
   autoload -Uz compinit
   if [[ -f ~/.zcompdump && ~/.zcompdump -nt /usr/share/zsh/site-functions ]]; then
     compinit -C
   else
     compinit
   fi
   ```

2. **`zcompile` slow functions:**

   ```bash
   zcompile ~/.zshrc
   zcompile ~/.zsh/completions/*
   ```

3. **Lazy-load plugins:**

   ```bash
   my_plugin() {
     # Plugin code here
   }
   # Don't call it at startup; call it on demand
   ```

## `emulate` Problems

### Symptom: Option Changes Leak to Parent Shell

**Cause:** Not using `emulate -L` in functions.

**Example (Wrong):**

```bash
myfunc() {
  emulate bash  # Options change parent shell!
  # ...
}
```

**Example (Correct):**

```bash
myfunc() {
  emulate -L bash  # Local scope only
  # ...
}
```

## Common Errors Reference

| Error Message | Cause | Fix |
| --- | --- | --- |
| `zsh: command not found: compinit` | `compinit` not found in `$fpath` | Ensure `autoload -Uz compinit` is called |
| `zsh: no matches found: *.txt` | No files match glob | Enable `setopt NULL_GLOB` or use `^` for excluded patterns |
| `parse error: bad substitution` | Syntax error in expansion | Check `${...}` syntax; test with `zsh -n` |
| `bad pattern: ^...` | `^` operator requires `EXTENDED_GLOB` | Add `setopt EXTENDED_GLOB` |
| `HISTFILE not set` | History won't save | Set `HISTFILE=~/.zsh_history` and `SAVEHIST=10000` |
| `_compinit_init: initialization failed` | Completion system error | Delete `~/.zcompdump*` and reinitialize |
| `[many lines of completion output]` | Infinite loop in completion function | Check for recursive calls in `~/.zsh/completions/` |

## Debugging Tools

### Trace Execution

```bash
zsh -x script.sh 2>&1 | less
```

Prints each command as it executes.

### Syntax Check

```bash
zsh -n script.sh
```

Checks syntax without executing.

### Profiling

```bash
time zsh -i -c exit
```

Measures startup time.

### Check Specific Option

```bash
zsh -O AUTO_CD -c 'print "Option enabled"'
```

Test with an option enabled (`-O`) or disabled (`-o`).

## What to Call Out in Answers

When troubleshooting Zsh:

- **`zsh -f`** is your first tool to isolate startup-file issues
- **`zsh -n`** checks syntax without running code
- **`zsh -x`** traces execution for debugging
- **`rm ~/.zcompdump*`** is the standard fix for completion problems
- **`emulate -L`** is essential to prevent option leakage
- **`setopt EXTENDED_GLOB`** must be set before using `^`, `~`, `#` in globs
- **History files** require both `HISTFILE` and `SAVEHIST` to be set
- **`time zsh -i -c exit`** is the standard profiling command for startup issues
