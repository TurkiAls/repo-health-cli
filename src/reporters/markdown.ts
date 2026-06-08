import type { ScanReport } from "../types.js";

export function renderMarkdown(report: ScanReport): string {
  const lines = [
    "# Repository Health Report",
    "",
    `Repository: \`${report.root}\``,
    report.configPath ? `Config: \`${report.configPath}\`` : undefined,
    `Score: **${report.score}/100**`,
    `Maintainer readiness: **${report.maintainerReadinessScore}/100**`,
    "",
    "## Summary",
    "",
    `- Passed: ${report.passed}`,
    `- Failed: ${report.failed}`,
    `- Warnings: ${report.warnings}`,
    "",
    "## Missing Files",
    ""
  ].filter((line) => line !== undefined) as string[];

  if (report.missingFiles.length === 0) {
    lines.push("- None");
  } else {
    lines.push(...report.missingFiles.map((file) => `- \`${file}\``));
  }

  lines.push("", "## Security Warnings", "");

  if (report.securityWarnings.length === 0) {
    lines.push("- None");
  } else {
    lines.push(...report.securityWarnings.map((warning) => `- ${warning.message}`));
  }

  lines.push("", "## Recommendations", "");

  if (report.recommendations.length === 0) {
    lines.push("- No recommendations.");
  } else {
    lines.push(...report.recommendations.map((recommendation) => `- ${recommendation}`));
  }

  return `${lines.join("\n")}\n`;
}
