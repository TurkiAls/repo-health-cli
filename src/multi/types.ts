import type { ScanReport } from "../types.js";

export type RepoScanStatus = "ok" | "timeout" | "error";

export class RepoTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Scan timed out after ${timeoutMs}ms`);
    this.name = "RepoTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export interface NamedScore {
  name: string;
  path: string;
  score: number;
}

export interface MultiRepoRow {
  rank: number;
  name: string;
  path: string;
  status: RepoScanStatus;
  score: number | null;
  maintainerReadinessScore: number | null;
  passed: number | null;
  failed: number | null;
  warnings: number | null;
  missingFiles: string[];
  securityWarningCount: number;
  recommendations: string[];
  durationMs: number;
  error: string | null;
}

export interface MultiScanSummary {
  ok: number;
  timedOut: number;
  errored: number;
  averageScore: number | null;
  best: NamedScore | null;
  worst: NamedScore | null;
}

export interface MultiScanReport {
  schemaVersion: 1;
  toolVersion: string;
  generatedAt: string;
  repoCount: number;
  parallelism: number;
  timeoutMs: number;
  summary: MultiScanSummary;
  ranked: MultiRepoRow[];
}

export type RepoScanFn = (root: string, configPath?: string) => Promise<ScanReport>;

export interface MultiScanOptions {
  repos: readonly string[];
  jobs?: number;
  timeoutMs?: number;
  configPath?: string;
  now?: () => Date;
  scan?: RepoScanFn;
}

export type UnrankedRow = Omit<MultiRepoRow, "rank">;

export const defaultJobs = 4;
export const defaultTimeoutMs = 30_000;
export const maxJobs = 64;
export const maxTimeoutMs = 30 * 60 * 1000;
export const healthMarkdownName = "health.md";
export const healthJsonName = "health.json";
