---
name: az
description: Operate Azure CLI (`az`) for authentication checks, subscription/context inspection, resource group and deployment lookups, and safe command planning. Use when tasks mention Azure CLI commands, Azure subscriptions or tenants, resource groups, ARM/Bicep deployment status, or Azure account troubleshooting from a terminal.
---

# Azure CLI

## Intent Router

| Request | Reference | Load When |
| --- | --- | --- |
| Install tool, first-time setup | `references/install-and-setup.md` | User needs to install Azure CLI or do initial configuration |
| Command patterns, ARM/Bicep | `references/command-cookbook.md` | User needs resource patterns, ARM deployment, AKS, Key Vault, or RBAC examples |
| Authentication, subscriptions | `references/auth-and-config.md` | User needs login setup, service principal, multi-tenant, or sovereign cloud configuration |

## Workflow

1. Run preflight before any Azure command workflow.
2. Check authentication and subscription context.
3. Choose a core command track and run inspect commands first.
4. Require explicit user confirmation before write/delete commands.
5. Re-run context checks and summarize outcomes.

```bash
# Log in, confirm active subscription, and list resource groups
az login
az account show
az group list --output table
```

## Preflight

Use bundled scripts for deterministic checks:

- `scripts/az-preflight.sh`
- `scripts/az-auth-status.sh`
- `scripts/az-context.sh`
- `scripts/az-diagnostics.sh [--json] [--out <file>]`

If the environment cannot access `~/.azure`, set:

```bash
export AZURE_CONFIG_DIR=/tmp/az-config
```

## Core Command Tracks

- Auth and subscription context:
`az login`, `az account show`, `az account list --output table`, `az account set --subscription <id-or-name>`
- Resource group and inventory inspection:
`az group list --output table`, `az resource list --resource-group <rg> --output table`
- Deployment inspection:
`az deployment group list --resource-group <rg> --output table`, `az deployment group show --resource-group <rg> --name <deployment>`
- Output shaping and filters:
Use `--query` and `--output json|table|yaml` for repeatable results.

## Safety Guardrails

- Always run context checks before mutating commands.
- Treat create/update/delete commands as high impact and ask for explicit confirmation first.
- Prefer read/list/show commands before `create`, `update`, `delete`, and `deployment` writes.
- Never print secrets; avoid commands that output credential material.

## Troubleshooting

- If `az` fails because config directory is not writable, set `AZURE_CONFIG_DIR` to a writable path.
- If auth fails, run `az login` and re-check with `scripts/az-auth-status.sh`.
- If output is noisy, add `--only-show-errors` and use `--query` to reduce volume.
- If commands fail due to network issues, capture diagnostics output first, then retry once connectivity is restored.

## References

- `references/command-cookbook.md`
- Azure CLI docs: <https://learn.microsoft.com/en-us/cli/azure/?view=azure-cli-latest>
- Azure command reference index: <https://learn.microsoft.com/en-us/cli/azure/reference-index?view=azure-cli-latest>
