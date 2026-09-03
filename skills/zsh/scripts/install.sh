#!/usr/bin/env bash
set -euo pipefail

# Zsh installer for macOS, Linux

detect_platform() {
  local system=$(uname -s)
  if [[ "$system" == "Darwin" ]]; then
    echo "macos"
  elif [[ "$system" == "Linux" ]]; then
    if [[ -f /etc/os-release ]]; then
      source /etc/os-release
      echo "${ID:-linux}"
    else
      echo "linux"
    fi
  else
    echo "unknown"
  fi
}

main() {
  local platform=$(detect_platform)

  # Check if zsh is available
  if command -v zsh &>/dev/null; then
    local version=$(zsh --version)
    echo "[OK] $version"
    echo "[HINT] Zsh is already available"
    echo "[HINT] See references/install-and-setup.md for post-install configuration"
    return 0
  fi

  case "$platform" in
    macos)
      echo "[INFO] Installing Zsh on macOS via Homebrew..."
      if command -v brew &>/dev/null; then
        brew install zsh
        echo "[OK] Zsh installed via Homebrew"
        echo "[WARN] To use as default shell:"
        echo "[HINT]   sudo bash -c 'echo /opt/homebrew/bin/zsh >> /etc/shells'"
        echo "[HINT]   chsh -s /opt/homebrew/bin/zsh"
      else
        echo "[ERROR] Homebrew not found. Install from https://brew.sh"
        exit 1
      fi
      ;;

    debian|ubuntu)
      echo "[INFO] Installing Zsh on Debian/Ubuntu..."
      sudo apt update
      sudo apt install -y zsh
      echo "[OK] Zsh installed successfully"
      ;;

    fedora|rhel|centos)
      echo "[INFO] Installing Zsh on Fedora/RHEL..."
      sudo dnf install -y zsh
      echo "[OK] Zsh installed successfully"
      ;;

    arch)
      echo "[INFO] Installing Zsh on Arch Linux..."
      sudo pacman -S --noconfirm zsh
      echo "[OK] Zsh installed successfully"
      ;;

    alpine)
      echo "[INFO] Installing Zsh on Alpine..."
      sudo apk add zsh
      echo "[OK] Zsh installed successfully"
      ;;

    *)
      echo "[ERROR] Unsupported platform: $platform"
      exit 1
      ;;
  esac

  # Verify installation
  if command -v zsh &>/dev/null; then
    zsh --version
    echo "[OK] Installation verified"
    echo ""
    echo "[HINT] Create ~/.zshrc with your settings"
    echo "[HINT] See references/install-and-setup.md for complete setup steps"
  else
    echo "[ERROR] Installation verification failed"
    exit 1
  fi
}

main "$@"
