# Azure CLI Command Cookbook

## Preflight and Context

```bash
az account show --output json
az account list --output table
az account set --subscription "<subscription-id>"
az group list --output table
```

## Resource Inspection Patterns

### List and Filter Resources

```bash
# All resources in subscription
az resource list --output table

# Resources in specific group
az resource list --resource-group my-rg --output table

# By type
az resource list --resource-type Microsoft.Compute/virtualMachines --output table

# With query filtering
az resource list \
  --query "[?resourceGroup=='my-rg'].{Name:name,Type:type}" \
  --output table
```

### Show Resource Details

```bash
# Resource group details
az group show --name my-rg --output json

# Specific resource
az resource show \
  --name my-vm \
  --resource-group my-rg \
  --resource-type Microsoft.Compute/virtualMachines

# Deployment details
az deployment group show \
  --resource-group my-rg \
  --name my-deployment
```

## ARM Deployment Patterns

### Create Deployment (Plan First)

```bash
# Dry-run to see what will change
az deployment group what-if \
  --resource-group my-rg \
  --template-file template.json \
  --parameters params.json

# Review output, then deploy
az deployment group create \
  --resource-group my-rg \
  --template-file template.json \
  --parameters params.json
```

### Parameter File Format

`parameters.json`:

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "vmName": {
      "value": "my-vm"
    },
    "vmSize": {
      "value": "Standard_B2s"
    }
  }
}
```

### List Deployment Results

```bash
az deployment group list --resource-group my-rg --output table
az deployment group show \
  --resource-group my-rg \
  --name my-deployment \
  --query properties
```

## Bicep Deployment Patterns

### Compile and Deploy Bicep

```bash
# Compile Bicep to ARM
az bicep build --file main.bicep --outfile main.json

# Or deploy directly (auto-compiles)
az deployment group create \
  --resource-group my-rg \
  --template-file main.bicep \
  --parameters location=westus environment=prod
```

### Bicep with Parameters

`main.bicep`:

```bicep
param vmName string
param location string
param vmSize string = 'Standard_B2s'

resource vm 'Microsoft.Compute/virtualMachines@2021-03-01' = {
  name: vmName
  location: location
  properties: {
    hardwareProfile: {
      vmSize: vmSize
    }
  }
}
```

Deploy:

```bash
az deployment group create \
  --resource-group my-rg \
  --template-file main.bicep \
  --parameters vmName=my-vm location=westus
```

## RBAC Patterns

### List Role Assignments

```bash
# All assignments in subscription
az role assignment list --output table

# Assignments for specific scope
az role assignment list \
  --resource-group my-rg \
  --output table

# For specific user
az role assignment list \
  --assignee user@example.com \
  --output table
```

### Assign Roles

```bash
# Assign role to user
az role assignment create \
  --assignee user@example.com \
  --role "Contributor" \
  --resource-group my-rg

# By service principal
az role assignment create \
  --assignee-object-id "<object-id>" \
  --role "Reader" \
  --scope "/subscriptions/<id>"
```

## Key Vault Patterns

### List Secrets

```bash
az keyvault secret list \
  --vault-name my-vault \
  --output table

# With values
az keyvault secret list \
  --vault-name my-vault \
  --query "[].{name:name,value:value}" \
  --output table
```

### Get Secret Value

```bash
az keyvault secret show \
  --vault-name my-vault \
  --name db-password \
  --query value \
  --output tsv
```

## AKS Patterns

### Get Cluster Credentials

```bash
# Download kubeconfig for kubectl
az aks get-credentials \
  --resource-group my-rg \
  --name my-cluster

# Verify
kubectl cluster-info
```

### Inspect Cluster

```bash
az aks show \
  --resource-group my-rg \
  --name my-cluster \
  --output table

az aks node-pool list \
  --resource-group my-rg \
  --cluster-name my-cluster
```

## Output Shaping

### Query Patterns

```bash
# Simple field projection
az group list --query "[].name" --output table

# Multi-field hash
az group list \
  --query "[].{Name:name,Location:location}" \
  --output table

# Filtering
az resource list \
  --query "[?resourceGroup=='my-rg']" \
  --output json

# Sorting
az vm list \
  --query "sort_by(@, &name)" \
  --output table
```

### Output Formats

| Format | Use |
| --- | --- |
| `json` | Scripting, parsing |
| `table` | Human review |
| `tsv` | CSV-like parsing |
| `yaml` | Configuration files |
| `none` | Suppress output |

## Scope and Subscription Management

### Specify Subscription in Every Mutation

```bash
# Create resource in specific subscription
az deployment group create \
  --subscription "<subscription-id>" \
  --resource-group my-rg \
  --template-file template.json
```

### Multi-Subscription Workflows

```bash
# Get current subscription
az account show --query id

# Switch subscription
az account set --subscription "prod-subscription"

# List subscriptions
az account list --output table
```

## Best Practices

- Always use `--what-if` before `create/update` on production
- Use `--no-wait` for long operations in scripts
- Always specify `--subscription` in automation
- Prefer `--query` to filter results (reduces JSON parsing)
- Store credentials in Key Vault, not in env vars
- Use managed identity on VMs/AKS instead of credentials
