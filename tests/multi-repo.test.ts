import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerMultiCommand } from "../src/multi/command.js";
import { discoverRepositories } from "../src/multi/discover.js";
import { mapWithConcurrency, withTimeout } from "../src/multi/pool.js";
import { renderMultiJson, renderMultiMarkdown } from "../src/multi/render.js";
import { summarize } from "../src/multi/rank.js";
import { scanRepositories } from "../src/multi/scan-many.js";
import { RepoTimeoutError } from "../src/multi/types.js";
import type { MultiRepoRow, MultiScanReport } from "../src/multi/types.js";
import { scanRepository } from "../src/scanner.js";
import type { ScanReport } from "../src/types.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "repo-health-multi-"));
});

afterEach(async () => {
  process.exitCode = 0;
  await rm(tempRoot, { recursive: true, force: true });
});

describe("discoverRepositories", () => {
  it("finds child repositories and skips hidden, dependency, and unmarked directories", async () => {
    await writeRepo("alpha", "package.json", "{}");
    await writeRepo("beta", "README.md", "# Beta");
    await writeRepo("node_modules/pkg", "package.json", "{}");
    await writeRepo(".hidden", "package.json", "{}");
    await writeRepo("notes", "notes.txt", "not a repo");
    await mkdir(path.join(tempRoot, "empty-dir"));

    const repos = await discoverRepositories({ directories: [tempRoot] });

    expect(repos.map((repo) => path.basename(repo)).sort()).toEqual(["alpha", "beta"]);
  });

  it("reads text and JSON lists, resolves relative paths, and dedupes symlinks", async () => {
    await writeRepo("alpha", "package.json", "{}");
    await writeRepo("beta", "README.md", "# Beta");
    await symlink(path.join(tempRoot, "alpha"), path.join(tempRoot, "alpha-link"));
    await writeFile(path.join(tempRoot, "repos.txt"), "# comment\n\nalpha\n./beta\nalpha-link\n");
    await writeFile(path.join(tempRoot, "repos.json"), JSON.stringify({ repositories: ["beta"] }));
    await writeFile(path.join(tempRoot, "array.json"), JSON.stringify(["alpha", "beta"]));

    const fromText = await discoverRepositories({ listFiles: [path.join(tempRoot, "repos.txt")] });
    const fromJson = await discoverRepositories({ listFiles: [path.join(tempRoot, "repos.json")] });
    const fromArray = await discoverRepositories({ listFiles: [path.join(tempRoot, "array.json")] });

    expect(fromText.map((repo) => path.basename(repo)).sort()).toEqual(["alpha", "beta"]);
    expect(fromJson.map((repo) => path.basename(repo))).toEqual(["beta"]);
    expect(fromArray.map((repo) => path.basename(repo)).sort()).toEqual(["alpha", "beta"]);
  });

  it("rejects an empty directory and an unreadable list", async () => {
    await expect(discoverRepositories({ directories: [tempRoot] })).rejects.toThrow(/No repositories found/);
    await expect(discoverRepositories({ listFiles: [path.join(tempRoot, "missing.txt")] })).rejects.toThrow(/Could not read/);
  });
});

describe("scanRepositories", () => {
  it("ranks healthier repositories first and keeps failures after successes", async () => {
    const repos = await Promise.all(
      ["best", "mid", "low", "hung", "broken"].map(async (name) => {
        const directory = path.join(tempRoot, name);
        await mkdir(directory);
        return directory;
      })
    );

    const report = await scanRepositories({
      repos,
      jobs: 3,
      timeoutMs: 40,
      now: () => new Date("2026-11-13T00:00:00.000Z"),
      scan: fakeScan
    });

    expect(report.generatedAt).toBe("2026-11-13T00:00:00.000Z");
    expect(report.ranked.map((row) => row.name)).toEqual(["best", "mid", "low", "hung", "broken"]);
    expect(report.ranked.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(report.ranked[0]).toMatchObject({ status: "ok", score: 90, maintainerReadinessScore: 80 });
    expect(report.ranked[3]).toMatchObject({ status: "timeout", score: null, error: "Scan timed out after 40ms" });
    expect(report.ranked[4]).toMatchObject({ status: "error", error: "scan exploded" });
    expect(report.summary).toMatchObject({
      ok: 3,
      timedOut: 1,
      errored: 1,
      averageScore: 50,
      best: { name: "best", score: 90 },
      worst: { name: "low", score: 10 }
    });
    expect(renderMultiMarkdown(report)).toContain("## Failures");
    expect(renderMultiJson(report)).toContain("\"status\": \"timeout\"");
  });

  it("breaks score ties with maintainer readiness", async () => {
    const higher = path.join(tempRoot, "tie-high");
    const lower = path.join(tempRoot, "tie-low");
    await mkdir(higher);
    await mkdir(lower);

    const report = await scanRepositories({
      repos: [lower, higher],
      jobs: 2,
      timeoutMs: 1000,
      scan: async (root) => {
        const readiness = path.basename(root) === "tie-high" ? 90 : 10;
        return fakeReport(root, 40, readiness);
      }
    });

    expect(report.ranked.map((row) => row.name)).toEqual(["tie-high", "tie-low"]);
  });

  it("caps parallelism and stops waiting after the per-repo timeout", async () => {
    const repos = await makeDirs(["one", "two", "three", "four"]);
    let active = 0;
    let maxActive = 0;
    const started = Date.now();

    await scanRepositories({
      repos,
      jobs: 2,
      timeoutMs: 1000,
      scan: async (root) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await delay(60);
        active -= 1;
        return fakeReport(root, 70);
      }
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(maxActive).toBe(2);
    expect(Date.now() - started).toBeLessThan(1000);

    const hanging = await makeDirs(["slow-a", "slow-b"]);
    const timeoutStarted = Date.now();
    const timedOut = await scanRepositories({
      repos: hanging,
      jobs: 1,
      timeoutMs: 30,
      scan: () => new Promise(() => undefined)
    });

    expect(Date.now() - timeoutStarted).toBeLessThan(1000);
    expect(timedOut.ranked.every((row) => row.status === "timeout")).toBe(true);
  });

  it("does not surface a rejection that arrives after the timeout", async () => {
    const [repo] = await makeDirs(["late"]);
    if (!repo) {
      throw new Error("expected a repository directory");
    }
    const report = await scanRepositories({
      repos: [repo],
      jobs: 1,
      timeoutMs: 20,
      scan: () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error("late failure")), 120);
        })
    });

    expect(report.ranked[0]?.status).toBe("timeout");
    await delay(180);
  });

  it("records missing paths and non-directories as errors", async () => {
    const filePath = path.join(tempRoot, "not-a-repo.txt");
    await writeFile(filePath, "hello");

    const report = await scanRepositories({
      repos: [path.join(tempRoot, "missing"), filePath],
      jobs: 2,
      timeoutMs: 1000,
      scan: async (root) => fakeReport(root, 100)
    });

    expect(report.ranked.map((row) => row.status)).toEqual(["error", "error"]);
    expect(report.ranked.some((row) => row.error?.includes("does not exist"))).toBe(true);
    expect(report.ranked.some((row) => row.error?.includes("Not a directory"))).toBe(true);
  });

  it("forwards config and keeps recommendation lists short", async () => {
    const [repo] = await makeDirs(["configured"]);
    if (!repo) {
      throw new Error("expected a repository directory");
    }
    const seen: Array<string | undefined> = [];
    const report = await scanRepositories({
      repos: [repo],
      jobs: 1,
      timeoutMs: 1000,
      configPath: path.join(tempRoot, "repo-health.config.json"),
      scan: async (root, configPath) => {
        seen.push(configPath);
        return {
          ...fakeReport(root, 80),
          securityWarnings: [
            {
              id: "security:env:.env",
              title: "Committed env file",
              status: "fail",
              severity: "critical",
              message: ".env is committed and may expose secrets."
            }
          ],
          recommendations: ["one", "two", "three", "four", "five", "six", "seven"]
        };
      }
    });

    expect(seen).toEqual([path.join(tempRoot, "repo-health.config.json")]);
    expect(report.ranked[0]?.securityWarningCount).toBe(1);
    expect(report.ranked[0]?.recommendations).toEqual(["one", "two", "three", "four", "five"]);
  });

  it("renders the same ranking as Markdown and JSON", async () => {
    const repos = await makeDirs(["zeta", "alpha"]);
    const report = await scanRepositories({
      repos,
      jobs: 2,
      timeoutMs: 1000,
      now: () => new Date("2026-11-13T00:00:00.000Z"),
      scan: async (root) => fakeReport(root, path.basename(root) === "alpha" ? 88 : 20)
    });
    const markdown = renderMultiMarkdown(report);
    const parsed = JSON.parse(renderMultiJson(report)) as MultiScanReport;

    expect(markdown).toContain("# Repository Health Table");
    expect(markdown.indexOf("`alpha`")).toBeLessThan(markdown.indexOf("`zeta`"));
    expect(markdown).toContain("| 1 |");
    expect(parsed.ranked.map((row) => row.name)).toEqual(["alpha", "zeta"]);
    expect(parsed.schemaVersion).toBe(1);
  });

  it("escapes table cells and shows full paths when names collide", () => {
    const rows: MultiRepoRow[] = [
      row({ rank: 1, name: "a|b", path: "/repos/one", score: 80 }),
      row({ rank: 2, name: "api", path: "/repos/left/api", score: 70 }),
      row({ rank: 3, name: "api", path: "/repos/right/api", score: 60 })
    ];
    const markdown = renderMultiMarkdown({
      schemaVersion: 1,
      toolVersion: "0.3.0",
      generatedAt: "2026-11-13T00:00:00.000Z",
      repoCount: rows.length,
      parallelism: 1,
      timeoutMs: 1000,
      summary: summarize(rows),
      ranked: rows
    });

    expect(markdown).toContain("`a\\|b`");
    expect(markdown).toContain("`/repos/left/api`");
    expect(markdown).toContain("`/repos/right/api`");
  });

  it("records the default parallelism and timeout", async () => {
    const [repo] = await makeDirs(["defaults"]);
    if (!repo) {
      throw new Error("expected a repository directory");
    }

    const report = await scanRepositories({
      repos: [repo],
      scan: async (root) => fakeReport(root, 64)
    });

    expect(report.parallelism).toBe(4);
    expect(report.timeoutMs).toBe(30_000);
    expect(report.ranked[0]?.score).toBe(64);
  });

  it("stops the scan process when the per-repo timeout expires", async () => {
    await writeRepo("alpha", "README.md", "# Alpha");
    const started = Date.now();
    const report = await scanRepositories({
      repos: [path.join(tempRoot, "alpha")],
      jobs: 1,
      timeoutMs: 1
    });

    expect(Date.now() - started).toBeLessThan(5000);
    expect(report.ranked[0]?.status).toBe("timeout");
    expect(report.summary.timedOut).toBe(1);
  });

  it("rejects invalid limits and an empty repo list", async () => {
    await expect(scanRepositories({ repos: [], jobs: 0 })).rejects.toThrow(/jobs/);
    await expect(scanRepositories({ repos: ["."], timeoutMs: 0 })).rejects.toThrow(/timeoutMs/);
    await expect(scanRepositories({ repos: [] })).rejects.toThrow(/No repositories/);
  });

  it("preserves mapper order and times out a late rejection", async () => {
    const values = await mapWithConcurrency([1, 2, 3], 2, async (value) => {
      await delay(value === 2 ? 40 : 5);
      return value * 10;
    });
    expect(values).toEqual([10, 20, 30]);

    await expect(
      withTimeout(
        new Promise((resolve) => {
          setTimeout(resolve, 200);
        }),
        20
      )
    ).rejects.toBeInstanceOf(RepoTimeoutError);
  });

  it("ranks a real complete repository above an empty one", async () => {
    const empty = path.join(tempRoot, "empty");
    const complete = path.join(tempRoot, "complete");
    await mkdir(empty);
    await writeCompleteRepo(complete);

    const report = await scanRepositories({
      repos: [empty, complete],
      jobs: 2,
      timeoutMs: 5000,
      scan: (root, configPath) => scanRepository({ root, configPath })
    });

    expect(report.ranked[0]?.name).toBe("complete");
    expect(report.ranked[0]?.score ?? 0).toBeGreaterThan(report.ranked[1]?.score ?? 100);
  });
});

describe("multi command", () => {
  it("writes the markdown and JSON tables and exits 1 below the minimum score", async () => {
    await writeRepo("alpha", "README.md", "# Alpha");
    const outDir = path.join(tempRoot, "out");
    const healthy = await runCommand(["multi", "--dir", tempRoot, "--out", outDir, "--jobs", "2", "--timeout", "15000"]);

    expect(healthy.exitCode).toBe(0);
    expect(healthy.stdout).toContain("# Repository Health Table");
    expect(healthy.stderr).toContain(path.join(outDir, "health.md"));
    const markdown = await readFile(path.join(outDir, "health.md"), "utf8");
    const json = JSON.parse(await readFile(path.join(outDir, "health.json"), "utf8")) as MultiScanReport;
    expect(markdown).toContain("`alpha`");
    expect(json.ranked[0]).toMatchObject({ name: "alpha", status: "ok" });
    expect(typeof json.ranked[0]?.score).toBe("number");

    const below = await runCommand([
      "multi",
      "--dir",
      tempRoot,
      "--json",
      "--min-score",
      "100",
      "--jobs",
      "1",
      "--timeout",
      "15000"
    ]);
    const parsed = JSON.parse(below.stdout) as MultiScanReport;
    expect(parsed.ranked[0]?.score).toBeLessThan(100);
    expect(below.exitCode).toBe(1);
  });

  it("accepts a list file and prints both stdout formats", async () => {
    await writeRepo("beta", "package.json", JSON.stringify({ name: "beta" }));
    const listFile = path.join(tempRoot, "repos.txt");
    await writeFile(listFile, "# keep\nbeta\n");

    const result = await runCommand(["multi", listFile, "--markdown", "--json", "--jobs", "1", "--timeout", "15000"]);
    const jsonStart = result.stdout.indexOf("\n{");

    expect(result.stdout).toContain("# Repository Health Table");
    expect(JSON.parse(result.stdout.slice(jsonStart + 1)).ranked[0].name).toBe("beta");
  });

  it("rejects a non-positive job count", async () => {
    await expect(runCommand(["multi", "--jobs", "0", "--dir", tempRoot])).rejects.toThrow(/--jobs/);
  });
});

describe("cli entry point", () => {
  it("scans one repository and a directory of repositories", async () => {
    await writeRepo("gamma", "README.md", "# Gamma");
    const single = await runCli(["scan", path.join(tempRoot, "gamma"), "--json"]);
    const parsedSingle = JSON.parse(single.stdout) as { root: string; score: number };
    expect(parsedSingle.root).toBe(path.join(tempRoot, "gamma"));
    expect(typeof parsedSingle.score).toBe("number");

    const many = await runCli(["multi", "--dir", tempRoot, "--json", "--jobs", "2", "--timeout", "15000"]);
    const parsedMany = JSON.parse(many.stdout) as MultiScanReport;
    expect(parsedMany.ranked).toHaveLength(1);
    expect(parsedMany.ranked[0]).toMatchObject({ name: "gamma", status: "ok" });
  }, 20000);
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runCommand(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  let exitCode = 0;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const program = new Command();
  program.exitOverride();
  registerMultiCommand(program, {
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    cwd: tempRoot,
    setExitCode: (code) => {
      exitCode = code;
    }
  });
  await program.parseAsync(["node", "repo-health", ...args]);
  return { stdout: stdout.join(""), stderr: stderr.join(""), exitCode };
}

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("node", ["--import", "tsx", path.join(repoRoot, "src/cli.ts"), ...args], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

async function makeDirs(names: string[]): Promise<string[]> {
  const directories: string[] = [];
  for (const name of names) {
    const directory = path.join(tempRoot, name);
    await mkdir(directory);
    directories.push(directory);
  }
  return directories;
}

async function writeRepo(name: string, file: string, contents: string): Promise<void> {
  const directory = path.join(tempRoot, name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, file), contents);
}

async function writeCompleteRepo(root: string): Promise<void> {
  const files: Array<[string, string]> = [
    ["README.md", "# Complete"],
    ["LICENSE", "MIT"],
    ["SECURITY.md", "# Security"],
    ["CONTRIBUTING.md", "# Contributing"],
    ["CODE_OF_CONDUCT.md", "# Code of Conduct"],
    ["CHANGELOG.md", "# Changelog"],
    [".gitignore", "node_modules/"],
    ["package.json", JSON.stringify({ scripts: { build: "tsc", test: "vitest", lint: "eslint" } })],
    [".github/workflows/ci.yml", "name: CI"],
    [".github/ISSUE_TEMPLATE/bug_report.md", "bug"],
    [".github/pull_request_template.md", "pr"]
  ];
  for (const [file, contents] of files) {
    const absolute = path.join(root, file);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
  }
}

function fakeScan(root: string): Promise<ScanReport> {
  const name = path.basename(root);
  if (name === "hung") {
    return new Promise(() => undefined);
  }
  if (name === "broken") {
    return Promise.reject(new Error("scan exploded"));
  }
  const scores: Record<string, [number, number]> = {
    best: [90, 80],
    mid: [50, 40],
    low: [10, 5]
  };
  const [score, readiness] = scores[name] ?? [0, 0];
  return Promise.resolve(fakeReport(root, score, readiness));
}

function fakeReport(root: string, score: number, readiness = score): ScanReport {
  return {
    root,
    score,
    maintainerReadinessScore: readiness,
    passed: 1,
    failed: 0,
    warnings: 0,
    results: [],
    missingFiles: [],
    securityWarnings: [],
    recommendations: []
  };
}

function row(overrides: Partial<MultiRepoRow> & Pick<MultiRepoRow, "rank" | "name" | "path" | "score">): MultiRepoRow {
  return {
    status: "ok",
    maintainerReadinessScore: overrides.score,
    passed: 1,
    failed: 0,
    warnings: 0,
    missingFiles: [],
    securityWarningCount: 0,
    recommendations: [],
    durationMs: 5,
    error: null,
    ...overrides
  };
}
