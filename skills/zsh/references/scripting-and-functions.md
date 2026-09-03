# Scripting and Functions

## Script Structure

A typical Zsh script starts with a shebang and emulation settings:

```bash
#!/usr/bin/env zsh
emulate -L zsh      # Local zsh emulation; do not leak option changes

setopt EXTENDED_GLOB
setopt ERR_EXIT

# Script body
```

### Shebang

```bash
#!/usr/bin/env zsh
```

Use `env` for portability. Avoids hardcoding `/bin/zsh` or `/usr/bin/zsh`.

### `emulate -L zsh`

**Always use this in scripts to avoid leaking option changes to the parent shell.**

- `emulate -L` sets emulation mode locally (limited scope)
- `-L` flag ensures changes do not affect the calling shell

Without `-L`, `setopt` changes persist after the script exits.

### Common Script Options

| Option | Effect |
| --- | --- |
| `ERR_EXIT` | Exit on first error (like `set -e` in bash) |
| `EXTENDED_GLOB` | Enable `^`, `~`, `#` glob operators |
| `PIPE_FAIL` | Return error if any command in pipeline fails |
| `WARN_NESTED_ZLE` | Warn if ZLE is used inside functions |

## `autoload` — Lazy Loading Functions

`autoload` defers function definition until first call, improving startup time.

### Declaring Functions for Autoloading

In `~/.zshrc` or before calling the function:

```bash
autoload -Uz my_function
```

Flags:

- `-U` — Suppress alias expansion (recommended)
- `-z` — Load as a zsh function (default)
- `-k` — Load as a ksh-style function

### Defining Functions for Autoloading

Create a file `~/.zsh/functions/my_function`:

```bash
# This file contains the function body only, no "function my_function { }"
# just the body

print "This is my_function"
print "Called with args: $@"
```

Add to `$fpath` in `.zshrc`:

```bash
fpath=(~/.zsh/functions $fpath)
autoload -Uz my_function
```

When `my_function` is first called, Zsh loads the file from `$fpath`.

### Listing Autoloadable Functions

```bash
print -l ${(ok)functions}  # All loaded functions
```

## `zparseopts` — Parse Script Flags

`zparseopts` is Zsh's flag parser (no bash equivalent).

### Basic Usage

```bash
#!/usr/bin/env zsh
emulate -L zsh

zparseopts -D -E -- \
  v=verbose \
  f:=file \
  h=help

if [[ -n $help ]]; then
  echo "Usage: script -v -f FILE"
  exit 0
fi

if [[ -n $verbose ]]; then
  echo "Verbose mode"
fi

if [[ -n $file ]]; then
  echo "File: $file"
fi
```

Flags:

- `-D` — Delete recognized options from `$@`
- `-E` — Allow long options (e.g., `--verbose`)
- `--` — Separate options from positional arguments

### Parsing Examples

```bash
zparseopts -D -E -- \
  h=help \
  v=verbose \
  o:=output
```

- `h` — Boolean flag `-h`
- `v` — Boolean flag `-v`
- `o:` — Option `-o FILE` (`:` indicates argument required)

After parsing:

- `$help` — non-empty if `-h` was passed
- `$verbose` — non-empty if `-v` was passed
- `$output` — contains the value after `-o`

## `zcompile` — Bytecode Compilation

`zcompile` precompiles Zsh scripts and functions to bytecode for faster loading.

### Compile a Script

```bash
zcompile script.sh
```

Creates `script.sh.zwc` (Zsh Word Code).

### Compile a Function

```bash
zcompile -U ~/.zsh/functions/my_function
```

The `-U` flag mimics `autoload -U`.

### Verify Bytecode

```bash
file script.sh.zwc
# Output: script.sh.zwc: Zsh compiled script V1 (bytecode format)
```

## Functions

### Defining Functions

```bash
myfunc() {
  local arg1=$1
  local arg2=$2

  print "arg1: $arg1"
  print "arg2: $arg2"
}

# Call it
myfunc "hello" "world"
```

### Local Variables

Use `local` to scope variables:

```bash
myfunc() {
  local myvar="function scope"
  print $myvar
}

myfunc
# print $myvar  # Error: myvar is not defined
```

### Return Values

Functions return a status code (0 = success):

```bash
myfunc() {
  [[ -f $1 ]] && return 0 || return 1
}

if myfunc "file.txt"; then
  print "File exists"
fi
```

### Anonymous Functions

Zsh supports anonymous (inline) functions:

```bash
(){ print "Hello from anonymous function"; }
```

### Getting `$0` in Autoloaded Functions

By default, `$0` in an autoloaded function is the calling script. To get the function's own name:

```bash
setopt FUNCTION_ARGZERO
autoload -Uz my_function
```

Or use `$FUNCTION` inside the function (Zsh 5.0+):

```bash
myfunc() {
  print "Function name: $FUNCTION"
}
```

## Error Handling

### Exit on Error

```bash
emulate -L zsh
setopt ERR_EXIT

# If this fails, script exits immediately
some_command
```

### `TRAP ERR`

Trap errors and handle them:

```bash
on_error() {
  print "Error at line $1"
  exit 1
}

trap 'on_error $LINENO' ERR

# If this fails, on_error is called
some_command
```

### Conditional Execution

```bash
command1 && print "Success" || print "Failed"
```

## What to Call Out in Answers

When discussing Zsh scripting:

- **`emulate -L zsh`** must be at the top of every script to avoid leaking option changes
- **`autoload` functions** improve startup time and work from `$fpath`
- **`zparseopts`** is powerful and far more readable than bash's `getopts`
- **`zcompile`** can speed up large scripts, but the benefit is marginal for small ones
- **`setopt FUNCTION_ARGZERO`** is needed if a function's autoloaded body needs its own name
- **Error handling** with `ERR_EXIT` and `trap` should always be in production scripts
- **Local variables** are required; Zsh doesn't have function scope by default
