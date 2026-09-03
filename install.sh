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
  lazydocker      # docker TUI — containers, logs, stats
  fzf             # fuzzy finder — file pickers, preview patterns in CLAUDE.md
  uv              # fast Python packaging — pip/venv replacement
  act             # run GitHub Actions locally
  actionlint      # lint GitHub Actions YAML
  shellcheck      # lint shell scripts

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

  # Structural editing & quality (2026-09)
  ast-grep        # AST-aware find/replace — won't touch strings/comments
  biome           # fast JS/TS lint+format inside configured projects
  yq              # jq for YAML/TOML/XML
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

# ─── qlty (goto linter — no brew formula, install release binary) ──

if command -v qlty >/dev/null 2>&1; then
  echo "  ✓ qlty $(qlty --version 2>/dev/null | head -1 | cut -d' ' -f2) (already installed)"
else
  QLTY_BIN_DIR="$HOME/.local/bin"
  mkdir -p "$QLTY_BIN_DIR"
  case "$(uname -m)" in
    arm64)  QLTY_ASSET="qlty-aarch64-apple-darwin.tar.xz" ;;
    x86_64) QLTY_ASSET="qlty-x86_64-apple-darwin.tar.xz" ;;
    *)      QLTY_ASSET="" ;;
  esac
  if [ -n "$QLTY_ASSET" ] && [ "$(uname -s)" = "Darwin" ]; then
    echo "  → qlty (from github.com/qltysh/qlty releases)..."
    QLTY_TMP="$(mktemp -d)"
    if curl -fsSL "https://github.com/qltysh/qlty/releases/latest/download/$QLTY_ASSET" -o "$QLTY_TMP/qlty.tar.xz" \
       && tar -xJf "$QLTY_TMP/qlty.tar.xz" -C "$QLTY_TMP" \
       && find "$QLTY_TMP" -name qlty -type f -exec /bin/cp -f {} "$QLTY_BIN_DIR/qlty" \; \
       && chmod +x "$QLTY_BIN_DIR/qlty"; then
      info "Installed qlty to $QLTY_BIN_DIR/qlty"
    else
      warn "qlty install failed — get it from https://github.com/qltysh/qlty/releases"
    fi
    rm -rf "$QLTY_TMP"
  else
    warn "Unsupported platform for qlty auto-install — see https://github.com/qltysh/qlty/releases"
  fi
fi

# ─── Optional MCP binaries (Claude Code extras) ──────────

if command -v npm >/dev/null 2>&1; then
  if command -v chrome-devtools-mcp >/dev/null 2>&1; then
    echo "  ✓ chrome-devtools-mcp (already installed)"
  else
    echo "  → chrome-devtools-mcp (browser testing MCP)..."
    npm install -g chrome-devtools-mcp 2>/dev/null || warn "chrome-devtools-mcp install failed (npm)"
  fi
else
  warn "npm not found — skipped chrome-devtools-mcp"
fi

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

# ─── Summary ─────────────────────────────────────────────

echo ""
echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}  speedy-claude installed!${RESET}"
echo -e "${BOLD}══════════════════════════════════════════════════${RESET}"
echo ""
echo "  What changed:"
echo "    • 35+ CLI tools installed via brew/cargo (+qlty release binary)"
echo "    • delta set as git diff pager"
echo "    • zoxide initialized in shell"
echo ""
echo "  Next steps:"
echo "    1. Restart your shell (or source $SHELL_RC)"
echo "    2. Register the hooks + permissions in ~/.claude/settings.json —"
echo "       copy settings.example.json as a starting point (see README)"
echo "    3. Start a new Claude Code session"
echo "    4. Ask Claude to rename something across the codebase"
echo "       — it will now use ast-grep/ambr/sd instead of Read+Edit loops,"
echo "       and every Edit/Write gets syntax-checked automatically"
echo ""
echo "  Skills & CLAUDE.md:"
echo "    If you cloned into ~/.claude/, skills and config are already in place."
echo "    Optional skills are parked in skills-available/ (zero context cost)."
echo ""
echo "  Verify: fd --version && rg --version | head -1 && ast-grep --version && qlty --version"
echo ""
