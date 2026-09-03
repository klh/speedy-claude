# ZLE and Keybindings

ZLE (Zsh Line Editor) is Zsh's interactive command-line editor. It's highly customizable with keybindings, widgets, and hooks.

## What Is ZLE?

ZLE is the engine that processes keystrokes in interactive shells. It's similar to GNU Readline (bash) but more powerful:

- **Keymaps** — multiple sets of keybindings (emacs, vi, etc.)
- **Widgets** — custom functions that respond to keys
- **Hooks** — functions triggered on line-init, keymap-select, etc.

By default, Zsh uses **Emacs keybindings**.

## Viewing Current Keybindings

```bash
bindkey
```

Lists all current keybindings (format: key → widget).

```bash
bindkey -l
```

Lists all available keymaps.

```bash
bindkey -L
```

Shows keybindings in a format suitable for inclusion in `.zshrc`.

## Switching to Vi Mode

```bash
bindkey -v
```

Enables Vi keybindings. Now you can use `h j k l` to navigate, `i` to insert, etc.

### Switching Back to Emacs

```bash
bindkey -e
```

## Basic Keybinding Syntax

### Binding a Key to a Built-In Widget

```bash
# Bind Ctrl-L to clear-screen widget
bindkey '^L' clear-screen

# Bind Ctrl-R to history-incremental-search-backward
bindkey '^R' history-incremental-search-backward
```

### Binding a Key Sequence

```bash
# Bind Alt-Left to backward-word
bindkey '^[[1;3D' backward-word

# Bind Escape-j to jump-to-line (custom example)
bindkey -M emacs '^[j' jump-to-line
```

**Note:** Some terminals send different escape sequences. Use `read -t 1 -k` to determine the key code:

```bash
read -k key
bindkey -s "$key" 'my-widget'
```

## Custom Widgets

A ZLE widget is a function that responds to keystrokes.

### Creating a Custom Widget

```bash
# Define a function
my_widget() {
  LBUFFER="${LBUFFER}hello"  # Insert "hello" at current position
}

# Register it as a ZLE widget
zle -N my_widget

# Bind a key to it
bindkey '^[h' my_widget
```

### Available Widget Hooks

| Variable | Meaning |
| --- | --- |
| `LBUFFER` | Text to the left of cursor |
| `RBUFFER` | Text to the right of cursor |
| `BUFFER` | Entire command line |
| `CURSOR` | Cursor position (0-indexed) |

### Example: Custom Insert Widget

```bash
insert_date() {
  LBUFFER="${LBUFFER}$(date +%Y-%m-%d)"
}

zle -N insert_date
bindkey '^[d' insert_date
```

Press `Alt-d` to insert today's date at the cursor.

## Useful Built-In Widgets

| Widget | Effect |
| --- | --- |
| `clear-screen` | Clear the screen and redraw the prompt |
| `history-incremental-search-backward` | Search history backward |
| `history-incremental-search-forward` | Search history forward |
| `expand-history` | Expand `!` history references |
| `edit-command-line` | Open current line in `$EDITOR` |
| `backward-word` | Move one word back |
| `forward-word` | Move one word forward |
| `kill-line` | Delete from cursor to end of line |
| `kill-whole-line` | Delete entire line |
| `yank` | Paste from kill ring |
| `beginning-of-line` | Move to start of line |
| `end-of-line` | Move to end of line |

## The `edit-command-line` Widget

Edit long commands in your favorite editor:

```bash
autoload -U edit-command-line
zle -N edit-command-line
bindkey '^X^E' edit-command-line
```

Now press `Ctrl-X Ctrl-E` to open the current command line in `$EDITOR`.

## ZLE Hooks

ZLE can trigger functions at specific points.

### `zle-line-init` Hook

Executed when a new command line is created (typically when Zsh starts).

```bash
zle-line-init() {
  emulate -L zsh
  # Custom prompt setup
  print -n "[$KEYMAP] "
}

zle -N zle-line-init
```

### `zle-keymap-select` Hook

Executed when the keymap changes (e.g., insert → normal in vi mode).

```bash
zle-keymap-select() {
  if [[ $KEYMAP == vicmd ]]; then
    print -n '[NORMAL] '
  else
    print -n '[INSERT] '
  fi
}

zle -N zle-keymap-select
```

## Multi-Line Editing

### Using `edit-command-line`

For complex commands, use the editor integration:

```bash
autoload -U edit-command-line
zle -N edit-command-line
bindkey '^X^E' edit-command-line
```

### Setting `EDITOR`

Make sure `$EDITOR` is set:

```bash
export EDITOR=vim  # or nano, emacs, etc.
```

## Key Code Discovery

To find the key code for a key combination:

```bash
# Run this in Zsh
setopt extendedglob
read -k key
printf 'Key code: %s\n' ${(qV)key}
```

Press your key combination, and Zsh will print the code.

## `.zshrc` Keybinding Template

A typical keybinding setup:

```bash
# In ~/.zshrc

# Emacs mode (default)
bindkey -e

# History search
bindkey '^R' history-incremental-search-backward
bindkey '^S' history-incremental-search-forward

# Word navigation
bindkey '^[b' backward-word
bindkey '^[f' forward-word

# Edit command line
autoload -U edit-command-line
zle -N edit-command-line
bindkey '^X^E' edit-command-line

# Custom widgets (example)
my_date_widget() {
  LBUFFER="${LBUFFER}$(date +%Y-%m-%d)"
}
zle -N my_date_widget
bindkey '^[d' my_date_widget
```

## Switching Between Keymaps in Vi Mode

If using vi mode (`bindkey -v`):

- Insert mode: press `i`
- Normal mode: press `Esc`
- Visual mode: press `v` in normal mode

ZLE automatically handles mode-specific widgets.

## What to Call Out in Answers

When discussing ZLE and keybindings:

- **`bindkey` discovery** — always run `bindkey` to see current bindings before adding new ones
- **Emacs vs Vi** — the default is Emacs; use `bindkey -v` for vi mode
- **Custom widgets** — they're powerful but require understanding `LBUFFER`, `RBUFFER`, `BUFFER`, `CURSOR`
- **`edit-command-line`** — one of the most useful widgets; mention it for complex command editing
- **Key codes** — terminal-dependent; use `read -k` to discover them
- **Hooks** — `zle-line-init` and `zle-keymap-select` are entry points for customization
- **Multi-line editing** — `edit-command-line` opens the line in `$EDITOR` for complex editing tasks
