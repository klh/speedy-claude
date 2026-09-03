# Azure CLI Authentication and Configuration

## Interactive Login

### Browser-Based Flow

```bash
az login
```

1. Opens browser to login page
2. Authenticate with Microsoft account or organizational identity
3. Browser redirects back with authorization
4. Credentials cached locally in `~/.azure/`

### Device Code Flow (for headless systems)

```bash
az login --use-device-code
```

Returns device code and URL:

```output
To sign in, use a web browser to open the page https://microsoft.com/devicelogin
and enter the code XXXXXX to authenticate.
```

Useful for:

- SSH sessions without browser
- Automated environments
- Remote machines

## Service Principal Authentication

### Login with Service Principal

```bash
az login --service-principal \
  -u <app-id> \
  -p <password-or-cert> \
  --tenant <tenant-id>
```

Example:

```bash
az login --service-principal \
  -u "12345678-1234-1234-1234-123456789012" \
  -p "client-secret-value" \
  --tenant "contoso.onmicrosoft.com"
```

### Credentials File

Create `~/.azure/credentials`:

```ini
[default]
subscription_id = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
client_id = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
secret = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
tenant = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

## Managed Identity (VM/ACI)

On Azure resources (VMs, App Service, Container Instances), use managed identity:

```bash
az login --identity
```

No credentials needed. Azure metadata service provides temporary access token.

Useful for:

- Azure VMs
- App Service / Functions
- Container Instances
- Kubernetes (with pod identity)

## Environment Variables Reference

| Variable | Purpose | Example |
| --- | --- | --- |
| `AZURE_SUBSCRIPTION_ID` | Default subscription | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `AZURE_TENANT_ID` | Directory tenant | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `AZURE_CLIENT_ID` | Service principal app ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `AZURE_CLIENT_SECRET` | Service principal secret | `client-secret-value` |
| `AZURE_CONFIG_DIR` | Config directory | `~/.azure` or custom path |
| `AZURE_HTTP_USER_AGENT` | User agent string | Custom HTTP header |

### Example: Service Principal via Environment

```bash
export AZURE_SUBSCRIPTION_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_TENANT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_CLIENT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export AZURE_CLIENT_SECRET="client-secret-value"

az account show  # Verifies auth
```

## Multi-Tenant Scenarios

### Switch Tenant

```bash
az login --tenant <tenant-id-or-name>
```

### List Available Tenants

```bash
az account tenant list
```

### Specify Tenant in Command

```bash
az group list --tenant <tenant-id>
```

## Sovereign Clouds

Azure CLI supports national clouds: China, GovCloud, Germany.

### List Available Clouds

```bash
az cloud list
```

Output:

```json
{
  "cloudName": "AzureCloud",
  "endpoints": {...}
},
{
  "cloudName": "AzureChinaCloud",
  ...
}
```

### Switch Cloud

```bash
# Switch to China cloud
az cloud set --name AzureChinaCloud

# Switch back to public cloud
az cloud set --name AzureCloud
```

### Endpoints by Cloud

| Cloud | Portal | Endpoint |
| --- | --- | --- |
| Public | portal.azure.com | <https://management.azure.com> |
| China | portal.azure.cn | <https://management.chinacloudapi.cn> |
| GovCloud | portal.azure.us | <https://management.usgovcloudapi.net> |
| Germany | portal.microsoftazure.de | <https://management.microsoftazure.de> |

## Configuration Isolation (CI/CD)

Use separate config directory in pipelines:

```bash
export AZURE_CONFIG_DIR="/tmp/azure-config-$$"
az login --service-principal -u ... -p ... --tenant ...
az group list  # Uses isolated config
# Config automatically cleaned up after pipeline
```

Benefits:

- Prevents credential leakage between jobs
- Isolates default subscriptions per job
- No shared state interference

## Troubleshooting

### Expired Token

**Error:**

```output
[ERROR] AADSTS50058: Silent sign-in request failed.
User may need to reauthenticate.
```

**Solution:**

```bash
az logout
az login
```

### Subscription Not Found

**Error:**

```output
[ERROR] Could not find subscription matching: <name-or-id>
```

**Solution:**

```bash
# List available subscriptions
az account list --output table

# Set default subscription
az account set --subscription "<subscription-id>"
```

### RBAC Permission Denied

**Error:**

```output
[ERROR] The user does not have permission to perform action
'Microsoft.Compute/virtualMachines/read' over scope
```

**Solution:**

1. Check current user/principal: `az account show`
2. Check role assignments: `az role assignment list --all`
3. Request RBAC role assignment from administrator

### Multi-Tenant Issues

**Error:**

```output
[ERROR] Multiple subscriptions with the same ID found
in different tenants
```

**Solution:**

```bash
# Explicitly specify tenant when multiple exist
az account set --subscription "<subscription-id>" --tenant "<tenant-id>"
```

### Config Directory Problems

**Error:**

```output
[ERROR] Could not create configuration directory: ~/.azure
```

**Solution:**

```bash
# Create directory manually
mkdir -p ~/.azure

# Or use custom location
export AZURE_CONFIG_DIR="$HOME/.config/azure"
mkdir -p "$AZURE_CONFIG_DIR"
```
