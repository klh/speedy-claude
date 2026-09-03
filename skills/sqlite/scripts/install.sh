#!/usr/bin/env bash
set -euo pipefail

# SQLite3 installer for macOS, Linux

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

  # Check if sqlite3 is already installed
  if command -v sqlite3 &>/dev/null; then
    local version=$(sqlite3 --version)
    echo "[OK] $version"
    echo "[HINT] Run 'references/install-and-setup.md' for post-install configuration"
    return 0
  fi

  case "$platform" in
    macos)
      echo "[INFO] Installing SQLite3 on macOS via Homebrew..."
      if command -v brew &>/dev/null; then
        brew install sqlite
        echo "[OK] SQLite3 installed successfully"
      else
        echo "[ERROR] Homebrew not found. Install from https://brew.sh"
        exit 1
      fi
      ;;

    debian|ubuntu)
      echo "[INFO] Installing SQLite3 on Debian/Ubuntu..."
      sudo apt update
      sudo apt install -y sqlite3
      echo "[OK] SQLite3 installed successfully"
      ;;

    fedora|rhel|centos)
      echo "[INFO] Installing SQLite3 on Fedora/RHEL..."
      sudo dnf install -y sqlite
      echo "[OK] SQLite3 installed successfully"
      ;;

    arch)
      echo "[INFO] Installing SQLite3 on Arch Linux..."
      sudo pacman -S --noconfirm sqlite
      echo "[OK] SQLite3 installed successfully"
      ;;

    alpine)
      echo "[INFO] Installing SQLite3 on Alpine..."
      sudo apk add sqlite
      echo "[OK] SQLite3 installed successfully"
      ;;

    *)
      echo "[ERROR] Unsupported platform: $platform"
      exit 1
      ;;
  esac

  # Verify installation
  if command -v sqlite3 &>/dev/null; then
    sqlite3 --version
    echo "[OK] Installation verified"
    echo ""
    echo "[HINT] Create ~/.sqliterc for default settings"
    echo "[HINT] See references/install-and-setup.md for complete setup steps"
  else
    echo "[ERROR] Installation verification failed"
    exit 1
  fi
}

main "$@"
