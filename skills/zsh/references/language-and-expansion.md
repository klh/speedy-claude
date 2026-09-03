# Language and Expansion

## Parameter Expansion Flags

Zsh's parameter expansion uses flag syntax `${(flags)parameter}` to modify values. These are more powerful than Bash.

### Case Modifiers

| Flag | Effect |
| --- | --- |
| `(U)` | Convert to uppercase: `print ${(U)var}` |
| `(L)` | Convert to lowercase: `print ${(L)VAR}` |

### Array Modifiers

| Flag | Effect |
| --- | --- |
| `(o)` | Sort array: `print ${(o)arr}` |
| `(O)` | Sort in reverse: `print ${(O)arr}` |
| `(j:sep:)` | Join array with separator: `print ${(j:,)arr}` |
| `(s:sep:)` | Split string by separator: `print ${(s:,)str}` |

### Type Modifiers

| Flag | Effect |
| --- | --- |
| `(k)` | Array keys (indices/keys): `print ${(k)assoc}` |
| `(v)` | Array values: `print ${(v)assoc}` |

### Escaping

| Flag | Effect |
| --- | --- |
| `(q)` | Quote for shell: `print ${(q)var}` |
| `(Q)` | Remove quotes: `print ${(Q)var}` |

### Expansion Examples

```bash
# Uppercase
var="hello"
print ${(U)var}  # HELLO

# Join array with comma
arr=(a b c)
print ${(j:,)arr}  # a,b,c

# Sort array descending
nums=(3 1 2)
print ${(O)nums}  # 3 2 1

# Get keys of associative array
typeset -A assoc=(key1 val1 key2 val2)
print ${(k)assoc}  # key1 key2
```

## Globbing

### Basic Globbing

- `*` — Match any characters in current directory
- `?` — Match exactly one character
- `[abc]` — Match any of a, b, c
- `[a-z]` — Match any lowercase letter
- `**/*` — Recursive glob (requires `setopt GLOB_STAR`)

### Extended Globbing

Requires `setopt EXTENDED_GLOB`:

| Pattern | Effect |
| --- | --- |
| `^pattern` | Exclude pattern: `ls ^*.txt` |
| `pattern1~pattern2` | Match pattern1 but exclude pattern2: `ls *(py)~test* |
| `#pattern` | Match zero or more repetitions |
| `##pattern` | Match one or more repetitions |

### Glob Qualifiers

Glob qualifiers are applied with `(qualifiers)` at the end of a glob pattern. Requires `setopt EXTENDED_GLOB` for some.

| Qualifier | Effect |
| --- | --- |
| `.` | Regular files only: `ls *(.)` |
| `/` | Directories only: `ls *(/)` |
| `*` | Executable files: `ls *(*)` |
| `@` | Symbolic links: `ls *(@)` |
| `m+7` | Modified more than 7 days ago: `ls *(m+7)` |
| `m-7` | Modified within the last 7 days: `ls *(m-7)` |
| `L+1M` | Larger than 1 MB: `ls *(L+1M)` |
| `L-10k` | Smaller than 10 KB: `ls *(L-10k)` |
| `om` | Sort by modification time: `ls *(om)` |
| `Oc` | Count: `ls *(Oc)` |

### Glob Examples

```bash
# Show only directories
ls *(/)

# Show only regular files modified in the last day
ls *(.-m-1)

# Show executable files larger than 5 MB
ls *(L+5M*)

# Count directories recursively (requires EXTENDED_GLOB)
print ${#$(ls -R *(/N))}
```

## Arrays

### Indexed Arrays

```bash
arr=(a b c)
print $arr          # a (first element)
print ${arr[1]}     # a (first element, 1-indexed by default)
print ${arr[2]}     # b
print ${arr[-1]}    # c (last element)
```

### Array Slicing

```bash
arr=(a b c d e)
print ${arr[2,4]}   # b c d (elements 2 through 4)
print ${arr[2,99]}  # b c d e (stop at end if over-indexed)
```

### Associative Arrays

```bash
typeset -A assoc
assoc[key1]="value1"
assoc[key2]="value2"

print $assoc[key1]  # value1
print ${(k)assoc}   # key1 key2 (all keys)
print ${(v)assoc}   # value1 value2 (all values)
```

### Array Operations

```bash
# Iterate
for item in "${arr[@]}"; do print "$item"; done

# Length
print ${#arr}       # Number of elements

# Append
arr+=(d e f)

# Delete element
unset 'arr[2]'
```

## Arithmetic

### Arithmetic Evaluation

```bash
(( result = 5 + 3 ))
print $result       # 8

# Conditional
if (( x > 10 )); then
  print "x is greater than 10"
fi

# Arithmetic expansion
print $(( 2 ** 8 ))  # 256 (2 to the power of 8)
```

### Floating-Point Arithmetic

Zsh supports floating-point natively:

```bash
print $(( 1.5 + 2.3 ))     # 3.8
print $(( 3.14 * 2 ))       # 6.28
print $(( sqrt(16) ))       # 4.0 (with zsh/mathfunc module)
```

### Common Operators

| Operator | Effect |
| --- | --- |
| `+` `-` `*` `/` `%` | Basic arithmetic |
| `**` `^` | Exponentiation |
| `&&` `\|\|` | Logical AND, OR |
| `==` `!=` `<` `>` `<=` `>=` | Comparison |
| `+=` `-=` `*=` `/=` | Compound assignment |

## Typed Variables

### Integer Variables

```bash
typeset -i count=5
count+=10
print $count        # 15 (arithmetic is implicit)
```

### Float Variables

```bash
typeset -F temp=98.6
print $temp
```

### Read-Only Variables

```bash
typeset -r PI=3.14159
# PI=3.0  # Error: assignment to read-only variable
```

### Local Variables

In functions:

```bash
myfunc() {
  local localvar="value"
  print $localvar
}
```

`local` creates a variable scoped to the function.

### Private Variables

In functions (Zsh 5.8+):

```bash
myfunc() {
  private hidden="secret"
}
```

`private` is like `local` but hidden from debuggers.

## The `print` Builtin

Zsh's `print` is more powerful than `echo`:

| Flag | Effect |
| --- | --- |
| `-n` | No trailing newline |
| `-r` | Raw: interpret backslashes literally |
| `-l` | One item per line (useful for arrays) |
| `-c` | Columnated output |
| `-f fmt` | Format string (like `printf`): `print -f "%.2f\n" 3.14159` |
| `-P` | Interpret prompt sequences (`%n`, `%m`, etc.) |
| `-u fd` | Write to file descriptor `fd` instead of stdout |

### Examples

```bash
# One item per line
arr=(a b c)
print -l $arr

# No trailing newline
print -n "prompt: "

# Formatted output
print -f "Name: %s, Age: %d\n" "Alice" 30

# Raw strings (backslashes literal)
print -r "path\to\file"   # path\to\file (not expanded)
```

### Print Examples

## What to Call Out in Answers

When discussing Zsh expansion and language:

- **Parameter expansion flags** (`(U)`, `(o)`, etc.) are Zsh-specific and much more powerful than Bash
- **Glob qualifiers** (`.`, `/`, `m+7`, `L+1M`) provide file filtering without external commands
- **Floating-point arithmetic** works natively without `bc` or `awk`
- **Typed variables** (`typeset -i`, `typeset -F`) enforce types automatically
- **`print` over `echo`** — `print` is more portable and powerful
- Always test glob behavior with `setopt EXTENDED_GLOB` and `setopt GLOB_DOTS` as they change default behavior
