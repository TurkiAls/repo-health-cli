# repo-health-cli

A TypeScript CLI for auditing open-source repository readiness.

`repo-health-cli` helps maintainers find the missing pieces that make a public repository easier to trust, contribute to, and maintain.

## Problem

Many repositories are published before they have the basics:

- no README
- no license
- no security policy
- no contributing path
- no CI
- no issue templates
- committed env files
- unclear maintainer quality gates

That makes the repo harder to evaluate and riskier to use.

## Solution

`repo-health-cli` scans a local repository and reports:

- repository health score
- maintainer-readiness score
- missing OSS files
- missing quality scripts
- suspicious env/secret patterns
- recommendations for maintainers

## Features

- Required-file checks: README, LICENSE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, CHANGELOG, `.gitignore`, `package.json`
- GitHub workflow/template checks
- Build/test/lint script checks
- Basic committed env file detection
- Suspicious keyword scan for common provider and secret patterns
- Text, JSON, and Markdown output
- TypeScript implementation
- Vitest test suite
- GitHub Actions CI

## Installation

This package is not published to npm yet. Use it locally:

```bash
git clone https://github.com/TurkiAls/repo-health-cli.git
cd repo-health-cli
npm install
npm run build
```

## Usage

```bash
npm run build
node dist/cli.js scan .
node dist/cli.js scan . --json
node dist/cli.js scan . --markdown
```

During local development:

```bash
npm run demo
```

## Example Output

```text
Repository health: 72/100
Maintainer readiness: 64/100
Passed: 10 | Failed: 2 | Warnings: 3

Missing files:
- SECURITY.md
- .github/pull_request_template.md

Recommendations:
- Add SECURITY.md to improve repository readiness.
- Add a test script so maintainers and CI have a clear quality gate.
```

## JSON Output Example

```json
{
  "score": 72,
  "maintainerReadinessScore": 64,
  "missingFiles": ["SECURITY.md"],
  "securityWarnings": [],
  "recommendations": ["Add SECURITY.md to improve repository readiness."]
}
```

## Markdown Output Example

```markdown
# Repository Health Report

Score: **72/100**
Maintainer readiness: **64/100**

## Missing Files

- `SECURITY.md`
```

## Roadmap

- npm package publishing workflow
- config file support
- GitHub API integration
- SARIF/security report output
- repository score badge generator
- richer documentation examples
- more secret scanning patterns
- monorepo support

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), then open a focused issue or pull request.

## Security

Do not paste secrets into issues or pull requests. See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).

## Maintainer Note

This is an early-stage project. The goal is practical maintainer quality, not pretending a simple scanner replaces dedicated security tooling.
