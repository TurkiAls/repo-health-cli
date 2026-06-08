# Output Examples

This page shows the three supported output formats.

## Text

```text
Repository health: 100/100
Maintainer readiness: 100/100
Passed: 15 | Failed: 0 | Warnings: 0
```

## JSON

```json
{
  "score": 100,
  "maintainerReadinessScore": 100,
  "failed": 0,
  "warnings": 0,
  "missingFiles": [],
  "securityWarnings": []
}
```

## Markdown

```markdown
# Repository Health Report

Score: **100/100**
Maintainer readiness: **100/100**

## Missing Files

- None
```

## Notes

Scores are guidance for maintainers. They do not certify that a repository is secure, complete, or production-ready.
