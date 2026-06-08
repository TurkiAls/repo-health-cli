import type { ScanReport } from "../types.js";

export function renderText(report: ScanReport): string {
  const lines = [
    `Repository health: ${report.score}/100`,
    `Maintainer readiness: ${report.maintainerReadinessScore}/100`,
    `Passed: ${report.passed} | Failed: ${report.failed} | Warnings: ${report.warnings}`
  ];

  if (report.missingFiles.length > 0) {
    lines.push("", "Missing files:");
    lines.push(...report.missingFiles.map((file) => `- ${file}`));
  }

  if (report.securityWarnings.length > 0) {
    lines.push("", "Security warnings:");
    lines.push(...report.securityWarnings.map((warning) => `- ${warning.file ?? "repository"}: ${warning.title}`));
  }

  if (report.recommendations.length > 0) {
    lines.push("", "Recommendations:");
    lines.push(...report.recommendations.slice(0, 8).map((recommendation) => `- ${recommendation}`));
  }

  return `${lines.join("\n")}\n`;
}
