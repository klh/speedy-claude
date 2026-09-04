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
  bun             # TS runtime for the unified bash-gate hook (brew: oven-sh/bun)
  gitleaks        # secrets scanner — commit/push gate
  ruff            # Python lint+format — syntax gate for the post-edit hook (9.6ms)
  taplo           # TOML checker/formatter — syntax gate (9.1ms)
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

if [ -d "$HOME/.claude/hooks" ] && command -v bun >/dev/null 2>&1; then
  (cd "$HOME/.claude/hooks" && bun install) 2>/dev/null || warn "bun install failed for hooks (shell-quote dep)"
fi
if command -v npm >/dev/null 2>&1; then
  if command -v chrome-devtools-mcp >/dev/null 2>&1; then
    echo "  ✓ chrome-devtools-mcp (already installed)"
  else
    echo "  → chrome-devtools-mcp (browser testing MCP)..."
    npm install -g chrome-devtools-mcp 2>/dev/null || warn "chrome-devtools-mcp install failed (npm)"
  fi
  if command -v prettier >/dev/null 2>&1; then
    echo "  ✓ prettier (already installed)"
  else
    echo "  → prettier (GFM markdown formatter for the md-format hook)..."
    npm install -g prettier 2>/dev/null || warn "prettier install failed (npm)"
  fi
  if command -v esbuild >/dev/null 2>&1; then
    echo "  ✓ esbuild (already installed)"
  else
    echo "  → esbuild (fastest TS/JSX parse gate, 6.8ms)..."
    npm install -g esbuild 2>/dev/null || warn "esbuild install failed (npm)"
  fi
else
  warn "npm not found — skipped chrome-devtools-mcp and esbuild"
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

# ─── LLM Specialist Swarm (MLX, Metal-native) ────────────

if [[ "$(uname -s)" == "Darwin" && "$(uname -m)" == "arm64" ]]; then
  info "Setting up LLM specialist swarm (Apple Silicon only)..."

  # Install mlx-lm via uv (fastest Python package manager)
  if ! command -v mlx_lm.server >/dev/null 2>&1; then
    echo "  → installing mlx-lm via uv..."
    if command -v uv >/dev/null 2>&1; then
      uv tool install mlx-lm
    else
      curl -LsSf https://astral.sh/uv/install.sh | sh
      export PATH="$HOME/.local/bin:$PATH"
      uv tool install mlx-lm
    fi
  else
    echo "  ✓ mlx-lm already installed"
  fi

  # Install playwright for browser automation (MJ/Dinero skills)
  if [ -d "$HOME/.claude/mcp-servers" ] && [ ! -d "$HOME/.claude/mcp-servers/node_modules/playwright" ]; then
    echo "  → installing playwright..."
    (cd "$HOME/.claude/mcp-servers" && bun add playwright 2>/dev/null) || warn "playwright install failed"
  fi

  # Download the specialist models (61GB total, parallel)
  MLX_PYTHON="$(command -v python3)"
  if [ -x "$HOME/.local/share/uv/tools/mlx-lm/bin/python" ]; then
    MLX_PYTHON="$HOME/.local/share/uv/tools/mlx-lm/bin/python"
  fi

  SWARM_MODELS=(
    "mlx-community/Qwen3-4B-Instruct-2507-4bit"       # menial (non-thinking, ~100 TPS)
    "mlx-community/Qwen3.5-9B-MLX-4bit"                # general/Danish (201 langs)
    "mlx-community/Qwen2.5-Coder-32B-Instruct-4bit"    # code specialist
    "mlx-community/Qwen3.5-27B-Claude-4.6-Opus-Distilled-MLX-4bit"  # reasoning
    "mlx-community/Qwen3-Embedding-0.6B-4bit-DWQ"      # embeddings
    "mlx-community/Qwen3-Reranker-0.6B-4bit"           # reranking
  )

  MODELS_NEEDED=0
  for MODEL in "${SWARM_MODELS[@]}"; do
    DIR="$HOME/.cache/huggingface/hub/models--$MODEL"
    if [ ! -d "$DIR" ] || [ "$(du -s "$DIR" 2>/dev/null | cut -f1)" -lt 100000 ]; then
      MODELS_NEEDED=$((MODELS_NEEDED + 1))
    fi
  done

  if [ "$MODELS_NEEDED" -gt 0 ]; then
    echo "  → downloading $MODELS_NEEDED specialist models (~61GB, runs in background)..."
    for MODEL in "${SWARM_MODELS[@]}"; do
      $MLX_PYTHON -c "from huggingface_hub import snapshot_download; snapshot_download('$MODEL')" 2>/dev/null &
    done
    # Don't wait — models download in background while other setup continues
    info "Model downloads started in background. Run 'bun ~/.claude/local-llm/swarm.ts start' after they complete."
  else
    echo "  ✓ all specialist models already cached"
  fi

  # Copy swarm management scripts to PATH
  for SCRIPT in mlx-swarm mlx-swarm-download claude-fast local-llm-stack approve-skill; do
    if [ -f "$HOME/.claude/hooks/$SCRIPT" ]; then
      chmod +x "$HOME/.claude/hooks/$SCRIPT"
      ln -sf "$HOME/.claude/hooks/$SCRIPT" "$HOME/.local/bin/$SCRIPT" 2>/dev/null
      echo "  ✓ $SCRIPT → ~/.local/bin/"
    fi
  done

  # Generate HMAC secret for signed skill approvals
  if [ ! -f "$HOME/.claude/.skill-review-secret" ]; then
    head -c 32 /dev/urandom | xxd -p -c 32 > "$HOME/.claude/.skill-review-secret"
    chmod 600 "$HOME/.claude/.skill-review-secret"
    echo "  ✓ skill approval HMAC secret generated"
  fi

  # Install LaunchAgent for the swarm (auto-start on boot)
  if [ -f "$HOME/.claude/hooks/launchd/com.klh.local-llm.plist" ]; then
    sed "s|__HOME__|$HOME|g" "$HOME/.claude/hooks/launchd/com.klh.local-llm.plist" \
      > "$HOME/Library/LaunchAgents/com.klh.local-llm.plist"
    launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.klh.local-llm.plist" 2>/dev/null \
      || warn "LaunchAgent bootstrap failed (may already be running)"
    echo "  ✓ LaunchAgent com.klh.local-llm installed"
  fi

  # Install LaunchAgent for daily insights (headless analyst runs)
  if [ -f "$HOME/.claude/hooks/launchd/com.klh.claude-insights.plist" ]; then
    sed "s|__HOME__|$HOME|g" "$HOME/.claude/hooks/launchd/com.klh.claude-insights.plist" \
      > "$HOME/Library/LaunchAgents/com.klh.claude-insights.plist"
    launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.klh.claude-insights.plist" 2>/dev/null \
      || warn "LaunchAgent bootstrap failed"
    echo "  ✓ LaunchAgent com.klh.claude-insights installed (daily 06:43 analyst run)"
  fi
else
  warn "Not Apple Silicon (arm64) — LLM swarm skipped"
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
echo "    • LLM specialist swarm setup (if Apple Silicon)"
echo "    • LaunchAgents for local-LLM + daily insights installed"
echo "    • Skill approval HMAC secret generated"
echo ""
echo "  Next steps:"
echo "    1. Restart your shell (or source $SHELL_RC)"
echo "    2. Copy settings.example.json to ~/.claude/settings.json and fill token"
echo "    3. Wait for model downloads to finish, then run: bun ~/.claude/local-llm/swarm.ts start"
echo "    4. Start a new Claude Code session"
echo ""
echo "  LLM Swarm (Apple Silicon):"
echo "    bun ~/.claude/local-llm/swarm.ts start     — start all specialists (3 models, ~20GB RAM)"
echo "    bun ~/.claude/local-llm/swarm.ts status    — check what's running"
echo "    claude-fast <prompt> — local inference (falls back to remote)"
echo ""
echo "  Daily Insights:"
echo "    LaunchAgent runs at 06:43 — findings in ~/.claude-insights/PENDING.md"
echo ""
echo "  Verify: fd --version && rg --version | head -1 && ast-grep --version && qlty --version"
echo "          bun ~/.claude/local-llm/swarm.ts status"
echo ""
