#!/usr/bin/env bash
set -euo pipefail

# speedy-claude — Make Claude Code 10-1400x faster at file operations
# https://github.com/klh/speedy-claude

BOLD='\033[1m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

info()  { echo -e "${BOLD}${GREEN}[INFO]${RESET} $*"; }
warn()  { echo -e "${BOLD}${YELLOW}[WARN]${RESET} $*"; }
error() { echo -e "${BOLD}${RED}[ERROR]${RESET} $*"; }

# ─── Preflight ───────────────────────────────────────────

command -v brew >/dev/null 2>&1 || { error "Homebrew not found. Install: https://brew.sh"; exit 1; }
command -v cargo >/dev/null 2>&1 || { warn "cargo not found. Installing rust via rustup..."; curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y; source "$HOME/.cargo/env"; }

OS="$(uname -s)"
ARCH="$(uname -m)"
info "Detected: $OS $ARCH"

# ─── Brew packages ───────────────────────────────────────

BREW_TOOLS=(
  # Core file ops (biggest speedup)
  fd              # find replacement — 64x faster
  ripgrep         # grep replacement — 6x faster
  bat             # cat replacement — syntax highlighting
  bat-extras      # batgrep, batdiff, batman, batwatch
  sd              # sed replacement — 12x faster at regex
  difftastic      # diff replacement — AST-aware structural diff
  tree            # directory listing with JSON output
  jq              # JSON processor — replaces python3 -c

  # Bulk operations
  git-delta       # git diff pager — syntax-highlighted
  hyperfine       # statistical benchmarking

  # Disk & navigation
  dust            # du replacement — visual treemap
  tokei           # cloc replacement — instant code stats
  eza             # ls replacement — icons, git, tree
  zoxide          # cd replacement — frecency jumping
  broot           # interactive directory tree

  # Process & system
  procs           # ps replacement — colored, searchable
  bottom          # htop replacement — cross-platform graphs

  # Network & HTTP
  xh              # curl replacement — HTTPie syntax
  hurl            # multi-request HTTP testing
  doggo           # dig replacement — colored, JSON
  aria2           # wget replacement — parallel downloads

  # Git & dev
  lazygit         # git TUI — interactive staging, rebase
  act             # run GitHub Actions locally
  actionlint      # lint GitHub Actions YAML
  shellcheck      # lint shell scripts
  git-standup     # recent git activity by author

  # File ops & monitoring
  fswatch         # file change watcher
  watchexec       # rerun commands on change
  xcp             # cp replacement — 10x faster on NFS

  # Utilities
  gum             # glamorous shell scripts
  micro           # terminal editor
  tldr            # simplified man pages
  serve           # instant static file server
  mkcert          # local TLS certificates
)

info "Installing ${#BREW_TOOLS[@]} brew packages..."
for tool in "${BREW_TOOLS[@]}"; do
  if brew list "$tool" &>/dev/null; then
    echo "  ✓ $tool (already installed)"
  else
    echo "  → $tool..."
    brew install "$tool" 2>/dev/null || warn "Failed to install $tool via brew"
  fi
done

# ─── Cargo packages ──────────────────────────────────────

CARGO_TOOLS=(
  "amber"         # ambr/ambs — parallel codebase-wide search & replace
  "sad"           # diff-preview find & replace
)

info "Installing cargo packages..."
for tool_spec in "${CARGO_TOOLS[@]}"; do
  read -r tool <<< "$tool_spec"
  if command -v "$tool" >/dev/null 2>&1 || cargo install --list | grep -q "^$tool "; then
    echo "  ✓ $tool (already installed)"
  else
    echo "  → $tool..."
    cargo install "$tool" 2>/dev/null || warn "Failed to install $tool via cargo"
  fi
done

# ─── Git config ──────────────────────────────────────────

info "Configuring git..."
if git config --global core.pager &>/dev/null; then
  warn "git core.pager already set to '$(git config --global core.pager)'. Skipping."
else
  git config --global core.pager delta
  git config --global interactive.diffFilter "delta --color-only"
  info "Set delta as git diff pager"
fi

# ─── Shell integration ───────────────────────────────────

SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ]; then
  if grep -q "zoxide init" "$SHELL_RC" 2>/dev/null; then
    echo "  ✓ zoxide already in $SHELL_RC"
  else
    echo "" >> "$SHELL_RC"
    echo "# speedy-claude: zoxide smart cd" >> "$SHELL_RC"
    echo 'eval "$(zoxide init zsh)"' >> "$SHELL_RC"
    info "Added zoxide init to $SHELL_RC"
  fi
fi

# ─── Skills installation ─────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$SCRIPT_DIR/skills"
CLAUDE_SKILLS="$HOME/.claude/skills"

if [ -d "$SKILLS_DIR" ]; then
  SKILL_COUNT=$(find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  info "Installing $SKILL_COUNT skills into $CLAUDE_SKILLS..."
  mkdir -p "$CLAUDE_SKILLS"
  for skill_dir in "$SKILLS_DIR"/*/; do
    skill_name=$(basename "$skill_dir")
    if [ -d "$CLAUDE_SKILLS/$skill_name" ]; then
      echo "  ✓ $skill_name (already exists, skipping)"
    else
      cp -r "$skill_dir" "$CLAUDE_SKILLS/$skill_name"
      echo "  → $skill_name"
    fi
  done
else
  warn "skills/ directory not found. Skipping skills installation."
  warn "For full bootstrap, clone the repo: git clone https://github.com/klh/speedy-claude.git"
fi

# ─── CLAUDE.md integration ───────────────────────────────

CLAUDE_GLOBAL="$HOME/.claude/CLAUDE.md"

if [ -f "$CLAUDE_GLOBAL" ]; then
  if grep -q "CLI Speed Tools" "$CLAUDE_GLOBAL" 2>/dev/null; then
    echo "  ✓ CLAUDE.md already contains speed tools config"
  else
    if [ -f "$SCRIPT_DIR/CLAUDE.md" ]; then
      echo "" >> "$CLAUDE_GLOBAL"
      cat "$SCRIPT_DIR/CLAUDE.md" >> "$CLAUDE_GLOBAL"
      info "Appended speed tools config to $CLAUDE_GLOBAL"
    else
      warn "CLAUDE.md not found in repo. Add the CLAUDE.md rules manually."
    fi
  fi
else
  if [ -f "$SCRIPT_DIR/CLAUDE.md" ]; then
    mkdir -p "$HOME/.claude"
    cp "$SCRIPT_DIR/CLAUDE.md" "$CLAUDE_GLOBAL"
    info "Created $CLAUDE_GLOBAL with speed tools config"
  fi
fi

# ─── Summary ─────────────────────────────────────────────

echo ""
echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  speedy-claude installed!${RESET}"
echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"
echo ""
echo "  What changed:"
echo "    • 30+ CLI tools installed via brew/cargo"
echo "    • delta set as git diff pager"
echo "    • zoxide initialized in shell"
echo "    • CLAUDE.md updated with speed rules"
echo "    • Skills copied to ~/.claude/skills/"
echo ""
echo "  Next steps:"
echo "    1. Restart your shell (or source $SHELL_RC)"
echo "    2. Start a new Claude Code session"
echo "    3. Ask Claude to rename something across the codebase"
echo "       — it will now use ambr/sd/sad instead of Read+Edit loops"
echo ""
echo "  Verify: fd --version && rg --version | head -1 && delta --version"
echo ""
