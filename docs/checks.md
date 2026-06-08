# Checks

`repo-health-cli` currently checks for:

- README
- license
- security policy
- contributing guide
- code of conduct
- changelog
- gitignore
- package manifest
- GitHub Actions workflow folder
- issue template folder
- pull request template
- build, test, and lint scripts
- committed env files
- common secret and provider keywords
- line-aware security findings
- optional custom patterns from `repo-health.config.json`
- SARIF output for non-passing checks

The scanner is intentionally conservative. A warning means "review before publishing," not "a secret is confirmed."
