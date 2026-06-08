# Codex Use Cases

This project is a good fit for Codex because the work is practical, testable, and maintenance-heavy.

## Useful Codex Tasks

- Implement new repository health checks from focused issues.
- Add tests for edge cases across package managers and repository layouts.
- Review pull requests for missing tests, unclear docs, and security regressions.
- Expand SARIF output and security-oriented reporting.
- Improve CLI architecture without changing user-facing output unexpectedly.
- Draft documentation examples from tested command output.
- Prepare release notes from merged changes.

## Guardrails

Codex should not:

- publish packages without maintainer review
- add external services without an issue and approval
- weaken secret scanning to make scores look better
- generate fake activity, fake users, or fake adoption claims

## High-Value Roadmap Items

The best next Codex-assisted issues are:

- config file support hardening
- SARIF output improvements
- GitHub API metadata checks
- monorepo support
- npm publishing workflow
- richer secret-pattern tests

## Maintainer Standard

Every Codex-assisted change should keep these gates green:

```bash
npm run lint
npm test
npm run build
npm audit --audit-level=moderate
node dist/cli.js scan .
```
