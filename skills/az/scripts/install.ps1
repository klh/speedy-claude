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

  # Check if az-cli is already installed
  if (Get-Command az -ErrorAction SilentlyContinue) {
    $version = & az --version | Select-Object -First 1
    Write-Host "[OK] $version already installed"
    Write-Host "[HINT] See 'references/install-and-setup.md' for post-install configuration"
    return
  }

  switch ($platform) {
    'windows' {
      Write-Host "[INFO] Installing Azure CLI on Windows via winget..."
      if (Get-Command winget -ErrorAction SilentlyContinue) {
        & winget install Microsoft.AzureCLI
        Write-Host "[OK] Azure CLI installed successfully"
      } else {
        Write-Host "[ERROR] winget not found"
        Write-Host "[HINT] Download from https://learn.microsoft.com/en-us/cli/azure/install-azure-cli"
        exit 1
      }
    }

    'macos' {
      Write-Host "[INFO] Installing Azure CLI on macOS via Homebrew..."
      if (Get-Command brew -ErrorAction SilentlyContinue) {
        & brew install azure-cli
        Write-Host "[OK] Azure CLI installed successfully"
      } else {
        Write-Host "[ERROR] Homebrew not found. Install from https://brew.sh"
        exit 1
      }
    }

    'linux' {
      Write-Host "[INFO] Installing Azure CLI on Linux..."
      if (Test-Path '/etc/os-release') {
        $osInfo = Get-Content /etc/os-release | ConvertFrom-StringData
        $distro = $osInfo.ID

        switch ($distro) {
          { $_ -in 'debian', 'ubuntu' } {
            Invoke-WebRequest -Uri "https://aka.ms/InstallAzureCLIDeb" -OutFile /tmp/install.sh
            & sudo bash /tmp/install.sh
          }
          { $_ -in 'fedora', 'rhel', 'centos' } {
            & sudo dnf install -y azure-cli
          }
          default {
            Write-Host "[WARN] Unknown distro: $distro"
            exit 1
          }
        }
        Write-Host "[OK] Azure CLI installed successfully"
      } else {
        Write-Host "[ERROR] Cannot detect Linux distro"
        exit 1
      }
    }

    default {
      Write-Host "[ERROR] Unsupported platform: $platform"
      exit 1
    }
  }

  # Verify installation
  if (Get-Command az -ErrorAction SilentlyContinue) {
    & az --version | Select-Object -First 1
    Write-Host "[OK] Installation verified"
    Write-Host ""
    Write-Host "[HINT] Login with: az login"
    Write-Host "[HINT] See 'references/install-and-setup.md' for complete setup steps"
  } else {
    Write-Host "[ERROR] Installation verification failed"
    exit 1
  }
}

Main
