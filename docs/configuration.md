# Configuration

`repo-health-cli` automatically reads `repo-health.config.json` from the scanned repository root.

You can also pass a specific config path:

```bash
repo-health scan . --config ./repo-health.config.json
```

## Example

```json
{
  "ignorePaths": ["fixtures", "examples/incomplete-repo"],
  "requiredFiles": ["README.md", "LICENSE", "SECURITY.md", "package.json"],
  "requiredPaths": [".github/workflows", ".github/ISSUE_TEMPLATE"],
  "security": {
    "allowlistFiles": ["docs/example-output.md"],
    "additionalPatterns": [
      {
        "id": "internal-ticket",
        "label": "Internal ticket reference",
        "pattern": "INTERNAL-[0-9]+",
        "severity": "warning"
      }
    ]
  }
}
```

## Fields

| Field | Purpose |
| --- | --- |
| `ignorePaths` | Skips folders or files from scans. |
| `requiredFiles` | Replaces the default required-file list. |
| `requiredPaths` | Replaces the default required-path list. |
| `security.allowlistFiles` | Skips specific files during security scanning. |
| `security.additionalPatterns` | Adds project-specific regex checks. |

Keep allowlists narrow. Do not use config to hide real secrets.
