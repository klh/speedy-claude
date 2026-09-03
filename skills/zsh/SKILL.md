---
name: zsh
description: Practical Zsh shell, completion system, ZLE keybindings, and scripting guidance. Use when the agent needs to work with `zsh`, `.zshrc`/.zshenv`/`.zprofile` startup files, shell builtins, `setopt`/`unsetopt` options, globbing and glob qualifiers, `compinit` completion system, ZLE widgets and keybindings, `zparseopts` flag parsing, `autoload` lazy loading, `zcompile` bytecode compilation, `emulate` mode switching, `zmodload` modules, and macOS system zsh or oh-my-zsh/prezto interop.
---

# Zsh

Use this skill to keep Zsh work grounded in the installed shell first, then fall back to zsh.sourceforge.io and the local manual when runtime behavior needs confirmation.

## Prerequisite Check

Run this before proposing Zsh-specific commands:

```bash
command -v zsh >/dev/null 2>&1 || zsh --version
```

If `zsh` is missing, surface that first and point to `scripts/install.sh` or `scripts/install.ps1`. For POSIX-compatible tasks, say when `bash` is an acceptable fallback and when it is not because the request depends on Zsh-specific semantics.

## Quick Start

1. Check the local Zsh version: `zsh --version`
2. Establish the local help surface before guessing:
   - `man zshroadmap`
   - `man zsh`
   - `man zshbuiltins`
   - `man zshoptions`
   - `man zshexpn`
   - `man zshcompsys`
   - `setopt`
   - `print -l ${(ok)builtins}`
3. Use `zsh -c 'command'` to test behavior in a clean session.
4. Separate Zsh semantics from external-command behavior and from startup-file loading order.
5. Isolate `.zshenv`, `.zshrc`, and `.zprofile` when startup behavior is suspect.

## Intent Router

Load only the reference file needed for the active request.

- `references/install-and-setup.md`
  - Installing or configuring Zsh on macOS, Linux, or Windows (WSL2), and post-install configuration.
- `references/cli-and-help.md`
  - `zsh` invocation, startup file load order, built-in help, `man`, and local discovery.
- `references/language-and-expansion.md`
  - Parameter expansion flags, globbing, glob qualifiers, arrays, arithmetic, typed variables, and common Zsh semantics.
- `references/completion-system.md`
  - `compinit` initialization, `zstyle` configuration, completion functions, `compadd`, and debugging.
- `references/scripting-and-functions.md`
  - Script structure, shebangs, `autoload`, `zparseopts`, `zcompile`, functions, and reusable script patterns.
- `references/zle-and-keybindings.md`
  - ZLE (Zsh Line Editor) widgets, `bindkey`, custom keybindings, and ZLE hooks.
- `references/options-and-modules.md`
  - `setopt`/`unsetopt`, `zmodload`, `emulate`, commonly-used options, and useful modules.
- `references/troubleshooting.md`
  - Startup failures, completion breakage, globbing errors, history issues, slow startup, and common error diagnostics.

## Core Workflow

1. Establish runtime truth
   - Test in a clean session: `zsh -c 'print "$ZSH_VERSION"'`
   - Check active options: `setopt`
   - List builtins: `print -l ${(ok)builtins}`
   - Inspect startup files: `echo $ZDOTDIR` (defaults to `$HOME`)

2. Choose the smallest discovery path
   - Help: `man zshroadmap`, `man zsh`, topic pages (`zshexpn`, `zshcompsys`, `zshoptions`)
   - Command discovery: `whence`, `where`, `which`, `type` (bash compat alias)
   - Runtime state: `setopt`, `unsetopt`, `env | sort`

3. Separate task classes before changing code
   - Shell invocation and startup behavior (`.zshenv`, `.zshrc`, `.zprofile`)
   - Language behavior: expansion flags, globbing, arrays, conditionals, arithmetic
   - Completion system: `compinit`, `zstyle`, custom completions
   - ZLE and keybindings: `bindkey`, widgets, custom functions
   - Options, modules, and emulation

4. Prefer reproducible diagnostics
   - Test changes in a fresh shell: `zsh -f -i -c 'source ~/.zshrc; <command>'`
   - Profile startup: `time zsh -i -c exit` (includes .zshrc timing)
   - Trace option changes: `setopt | sort` before and after

## Quick Command Reference

```bash
# Version and help
zsh --version
man zshroadmap                      # guided entry into the manual
man zshbuiltins                     # all builtins
man zshoptions                      # all options
man zshexpn                         # expansion and globbing
man zshcompsys                      # completion system

# Discovery
setopt                              # list active options
print -l ${(ok)builtins}            # list all builtins
zmodload                            # list loaded modules
autoload -U compinit && compinit    # init completion
bindkey                             # list key bindings
whence -a command                   # find command in path

# Testing
zsh -f                              # no startup files
zsh -c 'command'                    # run command in clean shell
time zsh -i -c exit                 # measure startup time

# Scripting
zsh -n script.sh                    # syntax check
zcompile script.sh                  # compile to bytecode
zparseopts -D -E -- opt1 opt2=ARG   # parse script flags
```

## Safety Notes

| Area | Guardrail |
| --- | --- |
| Startup files | `.zshenv` loads for every shell; `.zshrc` interactive only; `.zprofile` login only. Prefer `zsh -f` to skip all startup files when isolating. |
| Option side-effects | `setopt GLOB_DOTS`, `NULL_GLOB`, `EXTENDED_GLOB` change globbing globally; test with `zsh -f -O <option>` to verify behavior before adding to `.zshrc`. |
| Completion init | Call `compinit` only once per session; duplicate calls cause slowness. Use `~/.zcompdump*` caching. |
| `emulate` scope | Use `emulate -L zsh` inside functions to avoid leaking option changes to the parent shell. |
| History | `HISTFILE` and `SAVEHIST` must both be set for history to save. `setopt SHARE_HISTORY` affects all sessions. |
| macOS system zsh | `/bin/zsh` is 5.9 on macOS 15; Apple cannot update it. Install via Homebrew for latest features. |

Recovery note: if `zsh` is unavailable, stop at install guidance unless the task is truly POSIX-only. Do not silently map Zsh completion, ZLE, or option behavior onto `bash`.

## Source Policy

- Treat installed Zsh behavior, `man`, and `zsh --help` output as runtime truth.
- Use the zsh.sourceforge.io manual for language semantics and invocation details.
- Use Homebrew documentation for macOS installation and path guidance.

## Resource Index

- `scripts/install.sh`
  - Purpose: Install or upgrade Zsh on macOS or Linux.
- `scripts/install.ps1`
  - Purpose: Install or upgrade Zsh on Windows (WSL2) or any platform via PowerShell.
- `assets/templates/zshrc-starter.txt`
  - Purpose: Minimal `.zshrc` template with essential options and settings.
