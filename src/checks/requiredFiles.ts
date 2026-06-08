import type { CheckResult } from "../types.js";
import { exists } from "../utils/files.js";

const requiredFiles = [
  "README.md",
  "LICENSE",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md",
  ".gitignore",
  "package.json"
];

const requiredPaths = [
  ".github/workflows",
  ".github/ISSUE_TEMPLATE",
  ".github/pull_request_template.md"
];

export async function checkRequiredFiles(root: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const file of requiredFiles) {
    const present = await exists(root, file);
    results.push({
      id: `required:${file}`,
      title: `${file} exists`,
      status: present ? "pass" : "fail",
      severity: present ? "info" : "warning",
      file,
      message: present ? `${file} is present.` : `${file} is missing.`,
      recommendation: present ? undefined : `Add ${file} to improve repository readiness.`
    });
  }

  for (const filePath of requiredPaths) {
    const present = await exists(root, filePath);
    results.push({
      id: `required:${filePath}`,
      title: `${filePath} exists`,
      status: present ? "pass" : "fail",
      severity: present ? "info" : "warning",
      file: filePath,
      message: present ? `${filePath} is present.` : `${filePath} is missing.`,
      recommendation: present ? undefined : `Add ${filePath} so contributors understand the workflow.`
    });
  }

  return results;
}
