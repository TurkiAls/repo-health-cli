# Multi-repo scan

`repo-health multi` scans a directory of repositories, or a list of paths, and prints a health table ranked from healthiest to least healthy. Successful scans come first. Timeouts rank next. Errors rank last. Ties break on maintainer readiness, then name, then path.

The command always builds both a Markdown table and a JSON report. Choose where they go:

```bash
repo-health multi --dir ./repos --out ./health-report
repo-health multi --list repos.txt --json
repo-health multi ./repos --markdown --json
```

`--out` writes `health.md` and `health.json`. Stdout is Markdown unless `--json` is set. Passing both `--markdown` and `--json` prints both documents to stdout.

## What gets scanned

`--dir` uses each immediate child directory that looks like a repository. A child counts when it contains one of `.git`, `package.json`, `README.md`, `LICENSE`, `go.mod`, `Cargo.toml`, `pyproject.toml`, or `composer.json`. Hidden directories, `node_modules`, `dist`, and `coverage` are skipped. Symlinked directories are included.

`--list` reads a text file or a JSON file. Text files are one path per line. Blank lines and `#` comments are ignored. JSON files are either an array of paths or an object with a `repos` or `repositories` array. Relative paths are resolved from the list file's directory. The same repository is scanned once when paths canonicalize to one location.

A positional argument can be either a directory or a list file:

```bash
repo-health multi ./repos
repo-health multi ./repos.txt
```

## Parallelism and timeout

```bash
repo-health multi --dir ./repos --jobs 4 --timeout 30000
```

`--jobs` is the maximum number of repositories scanned at once. The default is 4, and the maximum is 64. `--timeout` is the per-repository limit in milliseconds. The default is 30000, and the maximum is 30 minutes.

Each repository is scanned in its own process. When the timeout fires, that process is stopped and the row is marked `timeout`. A missing path or a scan that throws is marked `error`. The table is still written.

The command exits with code 1 when any repository times out, errors, or scores below `--min-score`. A finished table of successful scans exits 0.

```bash
repo-health multi --dir ./repos --min-score 70 --out ./health-report
```

`--config` forwards one config file to every scan. Paths inside that file are resolved the same way as `repo-health scan --config`.

## Markdown

The table columns are rank, repository, health, maintainer readiness, passed, failed, warnings, missing files, status, and duration. The summary lists the average health of successful scans, the best score, and the lowest successful score. Failures are listed under the table.

## JSON

`health.json` is a single object:

- `schemaVersion` is `1`
- `toolVersion` is the package version
- `parallelism` and `timeoutMs` are the limits used for the run
- `summary` has counts, the average score, and the best and lowest successful repositories
- `ranked` is the table, best first, including `score: null` for timeouts and errors

Scores are maintainer guidance. They do not certify that a repository is secure or complete.
