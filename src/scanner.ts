import path from "node:path";
import type { CheckResult, ScanOptions, ScanReport } from "./types.js";
import { checkPackageScripts } from "./checks/packageScripts.js";
import { checkRequiredFiles } from "./checks/requiredFiles.js";
import { checkSecurity } from "./checks/security.js";
import { loadConfig } from "./config.js";

export async function scanRepository(options: ScanOptions): Promise<ScanReport> {
  const root = path.resolve(options.root);
  const { config, configPath } = await loadConfig(root, options.configPath);
  const results = [
    ...(await checkRequiredFiles(root, config.requiredFiles, config.requiredPaths)),
    ...(await checkPackageScripts(root)),
    ...(await checkSecurity(root, config))
  ];

  return buildReport(root, results, configPath);
}

export function buildReport(root: string, results: CheckResult[], configPath?: string): ScanReport {
  const failed = results.filter((result) => result.status === "fail").length;
  const warnings = results.filter((result) => result.status === "warn").length;
  const passed = results.filter((result) => result.status === "pass").length;
  const total = results.length || 1;
  const rawScore = Math.round(((passed + warnings * 0.45) / total) * 100);
  const criticalPenalty = results.filter((result) => result.severity === "critical").length * 15;
  const score = Math.max(0, Math.min(100, rawScore - criticalPenalty));
  const securityWarnings = results.filter((result) => result.id.startsWith("security:") && result.status !== "pass");
  const missingFiles = results
    .filter((result) => result.id.startsWith("required:") && result.status === "fail")
    .map((result) => result.file ?? result.title);
  const recommendations = results
    .filter((result) => result.recommendation)
    .map((result) => result.recommendation as string);

  const maintainerReadinessScore = Math.max(
    0,
    Math.min(100, Math.round(score - missingFiles.length * 2 - securityWarnings.length * 5))
  );

  return {
    root,
    configPath,
    score,
    maintainerReadinessScore,
    passed,
    failed,
    warnings,
    results,
    missingFiles,
    securityWarnings,
    recommendations
  };
}
