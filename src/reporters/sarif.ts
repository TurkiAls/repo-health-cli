import type { CheckResult, ScanReport } from "../types.js";

export function renderSarif(report: ScanReport): string {
  const findings = report.results.filter((result) => result.status !== "pass");
  const rules = uniqueRules(findings);

  return `${JSON.stringify(
    {
      version: "2.1.0",
      $schema: "https://json.schemastore.org/sarif-2.1.0.json",
      runs: [
        {
          tool: {
            driver: {
              name: "repo-health-cli",
              informationUri: "https://github.com/TurkiAls/repo-health-cli",
              rules
            }
          },
          results: findings.map(toSarifResult)
        }
      ]
    },
    null,
    2
  )}\n`;
}

function uniqueRules(results: CheckResult[]): Array<{ id: string; name: string; shortDescription: { text: string } }> {
  const seen = new Map<string, CheckResult>();
  for (const result of results) {
    seen.set(result.ruleId ?? result.id, result);
  }

  return Array.from(seen.entries()).map(([id, result]) => ({
    id,
    name: result.title,
    shortDescription: {
      text: result.recommendation ?? result.message
    }
  }));
}

function toSarifResult(result: CheckResult): Record<string, unknown> {
  return {
    ruleId: result.ruleId ?? result.id,
    level: result.severity === "critical" ? "error" : "warning",
    message: {
      text: result.message
    },
    locations: result.file
      ? [
          {
            physicalLocation: {
              artifactLocation: {
                uri: result.file
              },
              region: {
                startLine: result.line ?? 1,
                startColumn: result.column ?? 1
              }
            }
          }
        ]
      : []
  };
}
