#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Platform {
  if ($IsWindows) { return 'windows' }
  if ($IsMacOS) { return 'macos' }
  if ($IsLinux) { return 'linux' }
  return 'unknown'
}

function Main {
  $platform = Get-Platform

  # Check if zsh is available
  if (Get-Command zsh -ErrorAction SilentlyContinue) {
    $version = & zsh --version
    Write-Host "[OK] $version"
    Write-Host "[HINT] Zsh is already available"
    Write-Host "[HINT] See 'references/install-and-setup.md' for post-install configuration"
    return
  }

  switch ($platform) {
    'windows' {
      Write-Host "[INFO] Installing Zsh on Windows via WSL2..."
      Write-Host "[INFO] This requires admin rights and will install WSL2"
      Write-Host "[WARN] WSL2 requires Hyper-V or Windows 11 native virtualization"
      Write-Host ""

      if (Get-Command wsl -ErrorAction SilentlyContinue) {
        & wsl --install
        Write-Host "[OK] WSL2 installed. Please restart your computer."
        Write-Host "[HINT] After restart, install zsh in WSL2:"
        Write-Host "[HINT]   wsl -- sudo apt update && sudo apt install -y zsh"
      } else {
        Write-Host "[ERROR] Cannot install WSL2. Try manually:"
        Write-Host "[HINT]   wsl --install"
        exit 1
      }
    }

    'macos' {
      Write-Host "[INFO] Installing Zsh on macOS via Homebrew..."
      if (Get-Command brew -ErrorAction SilentlyContinue) {
        & brew install zsh
        Write-Host "[OK] Zsh installed via Homebrew"
        Write-Host "[WARN] To use as default shell:"
        Write-Host "[HINT]   sudo bash -c 'echo /opt/homebrew/bin/zsh >> /etc/shells'"
        Write-Host "[HINT]   chsh -s /opt/homebrew/bin/zsh"
      } else {
        Write-Host "[ERROR] Homebrew not found. Install from https://brew.sh"
        exit 1
      }
    }

    'linux' {
      Write-Host "[INFO] Installing Zsh on Linux..."
      if (Test-Path '/etc/os-release') {
        $osInfo = Get-Content /etc/os-release | ConvertFrom-StringData
        $distro = $osInfo.ID

        switch ($distro) {
          { $_ -in 'debian', 'ubuntu' } {
            & sudo apt update
            & sudo apt install -y zsh
          }
          { $_ -in 'fedora', 'rhel', 'centos' } {
            & sudo dnf install -y zsh
          }
          'arch' {
            & sudo pacman -S --noconfirm zsh
          }
          'alpine' {
            & sudo apk add zsh
          }
          default {
            Write-Host "[WARN] Unknown distro: $distro"
            exit 1
          }
        }
        Write-Host "[OK] Zsh installed successfully"
      }
    }

    default {
      Write-Host "[ERROR] Unsupported platform: $platform"
      exit 1
    }
  }

  # Verify installation
  if (Get-Command zsh -ErrorAction SilentlyContinue) {
    & zsh --version
    Write-Host "[OK] Installation verified"
    Write-Host ""
    Write-Host "[HINT] Create ~/.zshrc with your settings"
    Write-Host "[HINT] See 'references/install-and-setup.md' for complete setup steps"
  } else {
    Write-Host "[ERROR] Installation verification failed"
    exit 1
  }
}

Main
