import { stat } from "node:fs/promises";
import path from "node:path";
import type { ScanReport } from "../types.js";
import { version } from "../version.js";
import { rankRows, summarize } from "./rank.js";
import { assertJobs, assertTimeout, mapWithConcurrency, withTimeout } from "./pool.js";
import { scanIsolated } from "./isolate.js";
import { RepoTimeoutError, defaultJobs, defaultTimeoutMs } from "./types.js";
import type { MultiScanOptions, MultiScanReport, UnrankedRow } from "./types.js";

const recommendationLimit = 5;

export async function scanRepositories(options: MultiScanOptions): Promise<MultiScanReport> {
  const jobs = options.jobs ?? defaultJobs;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  assertJobs(jobs);
  assertTimeout(timeoutMs);

  const repos = uniquePaths(options.repos);
  if (repos.length === 0) {
    throw new Error("No repositories to scan. Pass a directory or a list of repository paths.");
  }

  const generatedAt = (options.now?.() ?? new Date()).toISOString();
  const rows = await mapWithConcurrency(repos, jobs, (repoPath) => scanOne(repoPath, options, timeoutMs));
  const ranked = rankRows(rows);

  return {
    schemaVersion: 1,
    toolVersion: version,
    generatedAt,
    repoCount: ranked.length,
    parallelism: jobs,
    timeoutMs,
    summary: summarize(ranked),
    ranked
  };
}

async function scanOne(repoPath: string, options: MultiScanOptions, timeoutMs: number): Promise<UnrankedRow> {
  const started = Date.now();
  const resolved = path.resolve(repoPath);
  const name = path.basename(resolved);
  const problem = await directoryProblem(resolved);
  if (problem) {
    return failedRow(name, resolved, "error", Date.now() - started, problem);
  }

  try {
    const report = await runScan(resolved, options, timeoutMs);
    return rowFromReport(name, resolved, report, Date.now() - started);
  } catch (error) {
    const durationMs = Date.now() - started;
    if (error instanceof RepoTimeoutError) {
      return failedRow(name, resolved, "timeout", durationMs, error.message);
    }
    const message = error instanceof Error ? error.message : String(error);
    return failedRow(name, resolved, "error", durationMs, message);
  }
}

async function runScan(repoPath: string, options: MultiScanOptions, timeoutMs: number): Promise<ScanReport> {
  const injected = options.scan;
  if (injected) {
    return withTimeout(
      Promise.resolve().then(() => injected(repoPath, options.configPath)),
      timeoutMs
    );
  }
  return scanIsolated(repoPath, options.configPath, timeoutMs);
}

async function directoryProblem(repoPath: string): Promise<string | null> {
  try {
    const info = await stat(repoPath);
    if (!info.isDirectory()) {
      return `Not a directory: ${repoPath}`;
    }
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return `Path does not exist: ${repoPath}`;
    }
    return error instanceof Error ? error.message : String(error);
  }
}

function rowFromReport(name: string, repoPath: string, report: ScanReport, durationMs: number): UnrankedRow {
  return {
    name,
    path: repoPath,
    status: "ok",
    score: report.score,
    maintainerReadinessScore: report.maintainerReadinessScore,
    passed: report.passed,
    failed: report.failed,
    warnings: report.warnings,
    missingFiles: report.missingFiles,
    securityWarningCount: report.securityWarnings.length,
    recommendations: report.recommendations.slice(0, recommendationLimit),
    durationMs,
    error: null
  };
}

function failedRow(
  name: string,
  repoPath: string,
  status: "timeout" | "error",
  durationMs: number,
  message: string
): UnrankedRow {
  return {
    name,
    path: repoPath,
    status,
    score: null,
    maintainerReadinessScore: null,
    passed: null,
    failed: null,
    warnings: null,
    missingFiles: [],
    securityWarningCount: 0,
    recommendations: [],
    durationMs,
    error: message
  };
}

function uniquePaths(repos: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const repo of repos) {
    const resolved = path.resolve(repo);
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    unique.push(resolved);
  }
  return unique;
}
