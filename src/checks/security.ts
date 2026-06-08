import type { CheckResult, RepoHealthConfig, SecurityPatternConfig, Severity } from "../types.js";
import { listFiles, readText } from "../utils/files.js";

interface SecurityPattern {
  id: string;
  label: string;
  pattern: RegExp;
  severity: Exclude<Severity, "info">;
}

const suspiciousPatterns: SecurityPattern[] = [
  { id: "openai", label: "OpenAI credential pattern", pattern: /OPENAI[A-Z0-9_]*(KEY|TOKEN|SECRET)\s*[:=]\s*["']?[^"'\s]{8,}|sk-[A-Za-z0-9_-]{20,}/i, severity: "critical" },
  { id: "supabase", label: "Supabase credential pattern", pattern: /SUPABASE[A-Z0-9_]*(KEY|TOKEN|SECRET|URL)\s*[:=]\s*["']?[^"'\s]{8,}|https:\/\/[a-z0-9-]+\.supabase\.co/i, severity: "warning" },
  { id: "vercel", label: "Vercel credential pattern", pattern: /VERCEL[A-Z0-9_]*(KEY|TOKEN|SECRET)\s*[:=]\s*["']?[^"'\s]{8,}/i, severity: "critical" },
  { id: "stripe", label: "Stripe credential pattern", pattern: /STRIPE[A-Z0-9_]*(KEY|TOKEN|SECRET)\s*[:=]\s*["']?[^"'\s]{8,}|pk_live_[A-Za-z0-9]+|sk_live_[A-Za-z0-9]+/i, severity: "critical" },
  { id: "paddle", label: "Paddle credential pattern", pattern: /PADDLE[A-Z0-9_]*(KEY|TOKEN|SECRET)\s*[:=]\s*["']?[^"'\s]{8,}/i, severity: "critical" },
  { id: "github-token", label: "GitHub token pattern", pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/, severity: "critical" },
  { id: "npm-token", label: "npm token pattern", pattern: /npm_[A-Za-z0-9]{20,}/, severity: "critical" },
  { id: "aws-key", label: "AWS access key pattern", pattern: /AKIA[0-9A-Z]{16}/, severity: "critical" },
  { id: "generic-token", label: "generic secret assignment", pattern: /(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|DATABASE_URL|JWT)\s*[:=]\s*["']?[^"'\s]{8,}/i, severity: "warning" },
  { id: "jwt", label: "JWT-like value", pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, severity: "critical" },
  { id: "private-key", label: "private key marker", pattern: /BEGIN (RSA |EC |OPENSSH |)?PRIVATE KEY/, severity: "critical" },
  { id: "private-ip", label: "private IP address", pattern: /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})\b/, severity: "warning" }
];

const riskyEnvFiles = new Set([".env", ".env.local", ".env.production", ".env.development"]);
const skippedExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".lock"]);

export async function checkSecurity(root: string, config: RepoHealthConfig = {}): Promise<CheckResult[]> {
  const files = await listFiles(root, undefined, config.ignorePaths);
  const results: CheckResult[] = [];
  const allowlist = new Set(config.security?.allowlistFiles ?? []);
  const patterns = [...suspiciousPatterns, ...toConfiguredPatterns(config.security?.additionalPatterns ?? [])];

  for (const file of files) {
    if (allowlist.has(file)) {
      continue;
    }

    if (riskyEnvFiles.has(file)) {
      results.push({
        id: `security:env:${file}`,
        title: "Committed env file",
        status: "fail",
        severity: "critical",
        file,
        message: `${file} is committed and may expose secrets.`,
        recommendation: "Remove the env file from git history if it contained real credentials and rotate affected secrets."
      });
    }
  }

  const searchableFiles = files.filter((file) => {
    const lower = file.toLowerCase();
    return !Array.from(skippedExtensions).some((extension) => lower.endsWith(extension));
  });

  for (const file of searchableFiles) {
    if (allowlist.has(file)) {
      continue;
    }

    const content = await readText(root, file);
    if (!content) {
      continue;
    }

    const lines = content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const suspicious of patterns) {
        const match = suspicious.pattern.exec(line);
        if (!match) {
          continue;
        }

        results.push({
          id: `security:${suspicious.id}:${file}`,
          title: suspicious.label,
          status: suspicious.severity === "critical" ? "fail" : "warn",
          severity: suspicious.severity,
          file,
          line: index + 1,
          column: match.index + 1,
          ruleId: suspicious.id,
          message: `${file}:${index + 1} contains ${suspicious.label}. Review before publishing.`,
          recommendation: "Do not publish full secret values. Rotate real credentials and remove affected git history if needed."
        });
      }
    }
  }

  if (results.length === 0) {
    results.push({
      id: "security:basic-scan",
      title: "Basic suspicious secret scan",
      status: "pass",
      severity: "info",
      message: "No suspicious env files or secret keywords were found by the basic scanner."
    });
  }

  return results;
}

function toConfiguredPatterns(patterns: SecurityPatternConfig[]): SecurityPattern[] {
  return patterns.map((pattern) => ({
    id: pattern.id,
    label: pattern.label,
    pattern: new RegExp(pattern.pattern, "i"),
    severity: pattern.severity ?? "warning"
  }));
}
