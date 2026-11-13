# Install

`repo-health-cli` installs from the committed `package-lock.json`. That is the reproducible install: the same Node.js and npm majors resolve the same tree.

## Requirements

- Node.js 20 or newer (`.nvmrc` pins 20)
- npm 10 or newer (`packageManager` is `npm@10.9.9`)

## Commands

```bash
git clone https://github.com/TurkiAls/repo-health-cli.git
cd repo-health-cli
npm ci
npx repo-health --version
```

`npm ci` fails if `package.json` and `package-lock.json` disagree, installs the locked versions, and runs `prepare`. `prepare` compiles TypeScript into `dist/`. The executable is `bin/repo-health.js`, which npm links as `repo-health`. It loads the compiled CLI, and the CLI reads its version from `package.json`.

Direct invocation after install:

```bash
node bin/repo-health.js --version
node dist/cli.js --version
```

The library entry points are the package root and `repo-health-cli/multi`.

## Publish

Publishing is manual. The `prepublishOnly` script lints, tests, and builds before `npm publish`. The GitHub Actions publish workflow runs the same checks and then publishes with `NPM_TOKEN`.
