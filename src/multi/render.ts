import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MultiRepoRow, MultiScanReport } from "./types.js";
import { healthJsonName, healthMarkdownName } from "./types.js";

export function renderMultiJson(report: MultiScanReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function renderMultiMarkdown(report: MultiScanReport): string {
  const lines = [
    "# Repository Health Table",
    "",
    `Scanned **${report.repoCount}** repositories with parallelism **${report.parallelism}** and a per-repository timeout of **${report.timeoutMs}ms**.`,
    `Generated: ${report.generatedAt}`,
    `Tool version: ${report.toolVersion}`,
    "",
    "| Rank | Repository | Health | Maintainer | Passed | Failed | Warnings | Missing | Status | Duration |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |",
    ...report.ranked.map((row) => formatRow(row, report.ranked)),
    "",
    "## Summary",
    "",
    `- Successful: ${report.summary.ok}`,
    `- Timed out: ${report.summary.timedOut}`,
    `- Errored: ${report.summary.errored}`,
    `- Average health: ${formatAverage(report.summary.averageScore)}`,
    `- Best: ${formatNamedScore(report.summary.best)}`,
    `- Lowest: ${formatNamedScore(report.summary.worst)}`
  ];

  const failures = report.ranked.filter((row) => row.status !== "ok");
  if (failures.length > 0) {
    lines.push("", "## Failures", "");
    lines.push(...failures.map((row) => `- ${inlineCode(displayName(row, report.ranked))}: ${row.error ?? row.status}`));
  }

  return `${lines.join("\n")}\n`;
}

export async function writeHealthOutputs(
  directory: string,
  report: MultiScanReport
): Promise<{ markdownPath: string; jsonPath: string }> {
  await mkdir(directory, { recursive: true });
  const markdownPath = path.join(directory, healthMarkdownName);
  const jsonPath = path.join(directory, healthJsonName);
  await writeFile(markdownPath, renderMultiMarkdown(report));
  await writeFile(jsonPath, renderMultiJson(report));
  return { markdownPath, jsonPath };
}

function formatRow(row: MultiRepoRow, rows: readonly MultiRepoRow[]): string {
  return `| ${row.rank} | ${inlineCode(displayName(row, rows))} | ${formatNumber(row.score)} | ${formatNumber(row.maintainerReadinessScore)} | ${formatNumber(row.passed)} | ${formatNumber(row.failed)} | ${formatNumber(row.warnings)} | ${row.missingFiles.length} | ${row.status} | ${row.durationMs}ms |`;
}

export function displayName(row: Pick<MultiRepoRow, "name" | "path">, rows: readonly Pick<MultiRepoRow, "name">[]): string {
  const duplicates = rows.filter((other) => other.name === row.name).length > 1;
  return duplicates ? row.path : row.name;
}

function formatNumber(value: number | null): string {
  return value === null ? "—" : String(value);
}

function formatAverage(value: number | null): string {
  if (value === null) {
    return "n/a";
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatNamedScore(score: MultiScanReport["summary"]["best"]): string {
  if (!score) {
    return "n/a";
  }
  return `${inlineCode(score.name)} (${score.score})`;
}

function inlineCode(value: string): string {
  return `\`${value.replaceAll("`", "'").replace(/\|/g, "\\|").replace(/\r?\n/g, " ")}\``;
}
