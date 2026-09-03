# Azure CLI Install & Setup

## Prerequisites

- macOS 10.13+, Linux (Debian/Fedora/Arch), or Windows
- Azure account with active subscription
- Ability to use package manager or installer

## Install by Platform

| macOS | Debian/Ubuntu | Fedora/RHEL | Windows |
| --- | --- | --- | --- |
| `brew install azure-cli` | See Linux note | `dnf install azure-cli` | `winget install Microsoft.AzureCLI` |

**Debian/Ubuntu:** Add Microsoft apt repository:

```bash
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
sudo apt install azure-cli
```

## Post-Install Configuration

### Login to Azure

```bash
az login
```

Opens browser to sign in. After authentication, shows subscriptions.

### Set Default Subscription

```bash
# List subscriptions
az account list -o table

# Set active subscription
az account set --subscription <subscription-id>
```

### Install Useful Extensions

```bash
# Azure DevOps extension (if using Azure DevOps)
az extension add --name azure-devops

# Interactive extension
az extension add --name interactive
```

### Shell Completion

```bash
# For bash, add to ~/.bashrc:
eval "$(az completion --shell bash)"

# For zsh, add to ~/.zshrc:
eval "$(az completion --shell zsh)"
```

Then reload: `source ~/.bashrc` or `source ~/.zshrc`

## Verification

```bash
# Check version
az --version

# Verify authentication
az account show
```

Expected output shows your subscription ID, tenant ID, and display name.

## Troubleshooting

### "Microsoft.Authorization/roleAssignments/write" error

- You lack permissions on the resource group.
- Ask your Azure admin to grant appropriate role (Contributor, Owner, etc.).

### "Subscription ID could not be found"

- Subscription doesn't exist or you don't have access.
- Run `az account list` to see available subscriptions.

### Authentication expired

- Run `az login` again to re-authenticate.

### Command fails in non-interactive environment

- Use service principal instead of user login:

  ```bash
  az login --service-principal -u <app-id> -p <password> --tenant <tenant-id>
  ```
