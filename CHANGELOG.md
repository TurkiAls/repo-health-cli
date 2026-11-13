# Changelog

## 0.3.0 - 2026-11-13

- Added `repo-health multi` to scan a directory or list of repositories in parallel, with a per-repository timeout, and write a ranked health table as Markdown and JSON.
- Read the CLI version from `package.json` so `repo-health --version` matches the published package.
- Declared the `repo-health` entry point at `bin/repo-health.js`, package exports, and a `prepare` build so `npm ci` produces a working install from the lockfile.

## 0.2.0 - 2026-06-08

- Added `repo-health.config.json` support.
- Added SARIF 2.1.0 output.
- Added line-aware security findings.
- Added stronger token, private-key, cloud credential, and private-IP patterns.
- Added CI and license badges.
- Added Codex use-case documentation.
- Added a manual npm publish workflow gated by `NPM_TOKEN`.

## 0.1.0 - 2026-06-08

- Initial TypeScript CLI scanner.
- Added required-file checks for open-source readiness.
- Added package script checks for build, test, and lint.
- Added basic suspicious env and secret keyword warnings.
- Added text, JSON, and Markdown reporters.
- Added tests, CI, contribution guide, security policy, and issue templates.
