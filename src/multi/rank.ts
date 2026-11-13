import type { MultiRepoRow, MultiScanSummary, RepoScanStatus, UnrankedRow } from "./types.js";

const statusOrder: Record<RepoScanStatus, number> = {
  ok: 0,
  timeout: 1,
  error: 2
};

export function rankRows(rows: readonly UnrankedRow[]): MultiRepoRow[] {
  const sorted = [...rows].sort((left, right) => compareRows(left, right));
  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function summarize(ranked: readonly MultiRepoRow[]): MultiScanSummary {
  const successful = ranked.filter(isScored);
  const scores = successful.map((row) => row.score);
  const best = successful[0];
  const worst = successful[successful.length - 1];

  return {
    ok: ranked.filter((row) => row.status === "ok").length,
    timedOut: ranked.filter((row) => row.status === "timeout").length,
    errored: ranked.filter((row) => row.status === "error").length,
    averageScore: average(scores),
    best: best ? { name: best.name, path: best.path, score: best.score } : null,
    worst: worst ? { name: worst.name, path: worst.path, score: worst.score } : null
  };
}

function isScored(row: MultiRepoRow): row is MultiRepoRow & { score: number } {
  return row.status === "ok" && row.score !== null;
}

function compareRows(left: UnrankedRow, right: UnrankedRow): number {
  const statusDelta = statusOrder[left.status] - statusOrder[right.status];
  if (statusDelta !== 0) {
    return statusDelta;
  }

  if (left.status === "ok" && right.status === "ok") {
    const scoreDelta = (right.score ?? -1) - (left.score ?? -1);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    const readinessDelta = (right.maintainerReadinessScore ?? -1) - (left.maintainerReadinessScore ?? -1);
    if (readinessDelta !== 0) {
      return readinessDelta;
    }
  }

  const nameDelta = left.name.localeCompare(right.name);
  if (nameDelta !== 0) {
    return nameDelta;
  }
  return left.path.localeCompare(right.path);
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(mean * 10) / 10;
}
