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

  # Check if sqlite3 is already installed
  if (Get-Command sqlite3 -ErrorAction SilentlyContinue) {
    $version = & sqlite3 --version
    Write-Host "[OK] $version"
    Write-Host "[HINT] See 'references/install-and-setup.md' for post-install configuration"
    return
  }

  switch ($platform) {
    'windows' {
      Write-Host "[INFO] Installing SQLite3 on Windows..."
      Write-Host "[INFO] Downloading prebuilt binaries from sqlite.org..."

      $tmpdir = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
      try {
        Push-Location $tmpdir
        Invoke-WebRequest -Uri "https://www.sqlite.org/2024/sqlite-tools-win32-x86-3450000.zip" -OutFile "sqlite-tools.zip"
        Expand-Archive sqlite-tools.zip
        $sqlitedir = "C:\sqlite"
        if (-not (Test-Path $sqlitedir)) {
          New-Item -ItemType Directory -Path $sqlitedir
        }
        Copy-Item sqlite-tools\* -Destination $sqlitedir -Force
        Write-Host "[OK] SQLite3 installed to $sqlitedir"
        Write-Host "[HINT] Adding to PATH. You may need to restart PowerShell."
        [Environment]::SetEnvironmentVariable("PATH", "$env:PATH;$sqlitedir", "User")
      } finally {
        Pop-Location
        Remove-Item $tmpdir -Recurse -Force
      }
    }

    'macos' {
      Write-Host "[INFO] Installing SQLite3 on macOS via Homebrew..."
      if (Get-Command brew -ErrorAction SilentlyContinue) {
        & brew install sqlite
        Write-Host "[OK] SQLite3 installed successfully"
      } else {
        Write-Host "[ERROR] Homebrew not found. Install from https://brew.sh"
        exit 1
      }
    }

    'linux' {
      Write-Host "[INFO] Installing SQLite3 on Linux..."
      if (Test-Path '/etc/os-release') {
        $osInfo = Get-Content /etc/os-release | ConvertFrom-StringData
        $distro = $osInfo.ID

        switch ($distro) {
          { $_ -in 'debian', 'ubuntu' } {
            & sudo apt update
            & sudo apt install -y sqlite3
          }
          { $_ -in 'fedora', 'rhel', 'centos' } {
            & sudo dnf install -y sqlite
          }
          'arch' {
            & sudo pacman -S --noconfirm sqlite
          }
          'alpine' {
            & sudo apk add sqlite
          }
          default {
            Write-Host "[WARN] Unknown distro: $distro"
            exit 1
          }
        }
        Write-Host "[OK] SQLite3 installed successfully"
      }
    }

    default {
      Write-Host "[ERROR] Unsupported platform: $platform"
      exit 1
    }
  }

  # Verify installation
  if (Get-Command sqlite3 -ErrorAction SilentlyContinue) {
    & sqlite3 --version
    Write-Host "[OK] Installation verified"
    Write-Host ""
    Write-Host "[HINT] Create ~/.sqliterc for default settings"
    Write-Host "[HINT] See 'references/install-and-setup.md' for complete setup steps"
  } else {
    Write-Host "[ERROR] Installation verification failed"
    exit 1
  }
}

Main
