# Install and Setup

## Prerequisites

- macOS 10.15+, Linux kernel 4.4+, or Windows WSL2
- Curl or wget for downloading framework installers (optional)
- `chsh` utility available on your system (usually pre-installed)

## Install by Platform

### macOS (via Homebrew)

```bash
brew install zsh
```

Verify installation:

```bash
zsh --version
```

The Homebrew-installed Zsh is typically newer than the macOS system Zsh (`/bin/zsh` version 5.9). To use the Homebrew version as your default shell:

```bash
sudo bash -c 'echo /opt/homebrew/bin/zsh >> /etc/shells'
chsh -s /opt/homebrew/bin/zsh
```

### macOS System Zsh

macOS includes Zsh at `/bin/zsh` (version 5.9 on macOS 15+), but Apple cannot update it due to licensing. For the latest Zsh features, install via Homebrew.

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install -y zsh
```

Verify:

```bash
zsh --version
```

To set as default shell:

```bash
chsh -s $(which zsh)
```

You may be prompted for your password.

### Linux (Fedora/RHEL/CentOS)

```bash
sudo dnf install -y zsh
```

To set as default shell:

```bash
chsh -s $(which zsh)
```

### Linux (Arch)

```bash
sudo pacman -S --noconfirm zsh
```

To set as default shell:

```bash
chsh -s $(which zsh)
```

### Linux (Alpine)

```bash
sudo apk add zsh
```

Alpine does not have `/etc/shells` by default; you may need to add the Zsh path manually:

```bash
echo /bin/zsh | sudo tee -a /etc/shells
chsh -s /bin/zsh
```

### Windows (WSL2)

If you have WSL2 installed:

```powershell
wsl -- sudo apt update
wsl -- sudo apt install -y zsh
```

Or from inside WSL2:

```bash
sudo apt update
sudo apt install -y zsh
chsh -s $(which zsh)
```

## Changing Your Default Shell

Use `chsh` to set Zsh as your default login shell:

```bash
chsh -s $(which zsh)
```

Verify in a new login shell:

```bash
echo $SHELL
```

If `chsh` requires that the shell be in `/etc/shells`, add it:

```bash
sudo bash -c 'echo /usr/bin/zsh >> /etc/shells'  # or /opt/homebrew/bin/zsh on macOS
chsh -s $(which zsh)
```

### Troubleshooting `chsh`

- **Permission denied**: Use `sudo` and provide your password.
- **Shell not in /etc/shells**: Add it manually as shown above.
- **macOS SIP (System Integrity Protection)**: If using a custom Zsh path and SIP blocks it, add the path to `/etc/shells` while using a standard editor (not `tee`).

## Post-Install Configuration

### Minimal `.zshrc` Template

Create or edit `~/.zshrc`:

```bash
# History configuration
HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000

# Options
setopt HIST_IGNORE_DUPS
setopt SHARE_HISTORY
setopt APPEND_HISTORY
setopt INC_APPEND_HISTORY
setopt AUTO_CD

# Initialize completion system
autoload -Uz compinit
compinit

# Prompt (simple example)
PROMPT='%n@%m:%~$ '
```

### Startup File Load Order

| File | Loaded | Purpose |
| --- | --- | --- |
| `.zshenv` | Every shell | Environment variables, PATH, module loads |
| `.zprofile` | Login shells only | Login-specific setup (PATH extensions, functions) |
| `.zshrc` | Interactive shells only | Interactive settings (aliases, completion, keybindings) |
| `.zlogin` | Login shells only (after `.zshrc`) | Final login shell setup |

**Rule of thumb:**

- Put exports and non-interactive setup in `.zshenv`
- Put login-specific setup in `.zprofile` (rarely needed)
- Put interactive settings in `.zshrc` (aliases, keybindings, completion)

### Optional Frameworks

#### Oh-My-Zsh

A popular community framework with plugins and themes:

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

**Warning:** Oh-My-Zsh can slow down startup. Measure with `time zsh -i -c exit`.

#### Prezto

A lightweight alternative to oh-my-zsh:

```bash
git clone --depth 1 https://github.com/sorin-ionescu/prezto.git "${ZDOTDIR:-$HOME}/.zprezto"
```

Then link the sample config:

```bash
ln -s ~/.zprezto/runcoms/zshrc ~/.zshrc
```

#### Zinit

A modern plugin manager:

```bash
bash -c "$(curl --fail --show-error --silent --location https://raw.githubusercontent.com/zdharma-continuum/zinit/HEAD/scripts/install.sh)"
```

## Verification

After installation and configuration, verify:

```bash
# Check Zsh version
zsh --version

# Check default shell
echo $SHELL

# Check ZSH_VERSION in Zsh
zsh -c 'print $ZSH_VERSION'

# Check configuration files
ls -la ~/.zsh*
```

## Troubleshooting Installation

### Zsh not found after installation

Re-run the installer or check the installation path:

```bash
which zsh
```

If Homebrew installed it to `/opt/homebrew/bin/zsh`, make sure that path is in your `$PATH`.

### `chsh` says "Shell not in /etc/shells"

Add Zsh to `/etc/shells`:

```bash
echo /usr/bin/zsh | sudo tee -a /etc/shells  # Standard location
# OR
echo /opt/homebrew/bin/zsh | sudo tee -a /etc/shells  # Homebrew on Apple Silicon
```

Then retry:

```bash
chsh -s $(which zsh)
```

### Permission denied when running install.sh

If running a system-wide install, use `sudo`:

```bash
sudo bash scripts/install.sh
```

Or install for your user only (preferred):

```bash
bash scripts/install.sh
```
