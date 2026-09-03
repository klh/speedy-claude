#!/usr/bin/env bash
set -euo pipefail

# Azure CLI installer for macOS, Linux

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

  # Check if az-cli is already installed
  if command -v az &>/dev/null; then
    local version=$(az --version | head -1)
    echo "[OK] $version already installed"
    echo "[HINT] Run 'references/install-and-setup.md' for post-install configuration"
    return 0
  fi

  case "$platform" in
    macos)
      echo "[INFO] Installing Azure CLI on macOS via Homebrew..."
      if command -v brew &>/dev/null; then
        brew install azure-cli
        echo "[OK] Azure CLI installed successfully"
      else
        echo "[ERROR] Homebrew not found. Install from https://brew.sh"
        exit 1
      fi
      ;;

    debian|ubuntu)
      echo "[INFO] Installing Azure CLI on Debian/Ubuntu..."
      echo "[INFO] Adding Microsoft apt repository..."

      curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
      echo "[OK] Azure CLI installed successfully"
      ;;

    fedora|rhel|centos)
      echo "[INFO] Installing Azure CLI on Fedora/RHEL..."
      sudo dnf install -y azure-cli
      echo "[OK] Azure CLI installed successfully"
      ;;

    arch)
      echo "[INFO] Installing Azure CLI on Arch Linux..."
      sudo pacman -S --noconfirm azure-cli
      echo "[OK] Azure CLI installed successfully"
      ;;

    alpine)
      echo "[INFO] Installing Azure CLI on Alpine..."
      sudo apk add azure-cli
      echo "[OK] Azure CLI installed successfully"
      ;;

    *)
      echo "[ERROR] Unsupported platform: $platform"
      echo "[HINT] Install manually from https://learn.microsoft.com/en-us/cli/azure/install-azure-cli"
      exit 1
      ;;
  esac

  # Verify installation
  if command -v az &>/dev/null; then
    az --version | head -1
    echo "[OK] Installation verified"
    echo ""
    echo "[HINT] Login with: az login"
    echo "[HINT] See references/install-and-setup.md for complete setup steps"
  else
    echo "[ERROR] Installation verification failed"
    exit 1
  fi
}

main "$@"
