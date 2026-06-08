import type { CheckResult } from "../types.js";
import { readText } from "../utils/files.js";

const expectedScripts = ["build", "test", "lint"];

export async function checkPackageScripts(root: string): Promise<CheckResult[]> {
  const packageJson = await readText(root, "package.json");
  if (!packageJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(packageJson) as { scripts?: Record<string, string> };
    return expectedScripts.map((script) => {
      const present = Boolean(parsed.scripts?.[script]);
      return {
        id: `script:${script}`,
        title: `npm run ${script}`,
        status: present ? "pass" : "warn",
        severity: present ? "info" : "warning",
        file: "package.json",
        message: present ? `package.json defines ${script}.` : `package.json does not define ${script}.`,
        recommendation: present ? undefined : `Add a ${script} script so maintainers and CI have a clear quality gate.`
      } satisfies CheckResult;
    });
  } catch {
    return [
      {
        id: "package-json:parse",
        title: "package.json parses",
        status: "fail",
        severity: "critical",
        file: "package.json",
        message: "package.json could not be parsed.",
        recommendation: "Fix package.json syntax before publishing or accepting contributions."
      }
    ];
  }
}
