import type { CheckResult } from "../types.js";
import { listFiles, readText } from "../utils/files.js";

const suspiciousPatterns: Array<{ id: string; label: string; pattern: RegExp }> = [
  { id: "openai", label: "OpenAI credential pattern", pattern: /OPENAI[A-Z0-9_]*(KEY|TOKEN|SECRET)\s*[:=]\s*["']?[^"'\s]{8,}|sk-[A-Za-z0-9_-]{20,}/i },
  { id: "supabase", label: "Supabase credential pattern", pattern: /SUPABASE[A-Z0-9_]*(KEY|TOKEN|SECRET|URL)\s*[:=]\s*["']?[^"'\s]{8,}|https:\/\/[a-z0-9-]+\.supabase\.co/i },
  { id: "vercel", label: "Vercel credential pattern", pattern: /VERCEL[A-Z0-9_]*(KEY|TOKEN|SECRET)\s*[:=]\s*["']?[^"'\s]{8,}/i },
  { id: "stripe", label: "Stripe credential pattern", pattern: /STRIPE[A-Z0-9_]*(KEY|TOKEN|SECRET)\s*[:=]\s*["']?[^"'\s]{8,}|pk_live_[A-Za-z0-9]+|sk_live_[A-Za-z0-9]+/i },
  { id: "paddle", label: "Paddle credential pattern", pattern: /PADDLE[A-Z0-9_]*(KEY|TOKEN|SECRET)\s*[:=]\s*["']?[^"'\s]{8,}/i },
  { id: "generic-token", label: "generic secret assignment", pattern: /(TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY|DATABASE_URL|JWT)\s*[:=]\s*["']?[^"'\s]{8,}/i },
  { id: "jwt", label: "JWT-like value", pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { id: "private-key", label: "private key marker", pattern: /BEGIN (RSA |EC |OPENSSH |)?PRIVATE KEY/ }
];

const riskyEnvFiles = new Set([".env", ".env.local", ".env.production", ".env.development"]);
const skippedExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".lock"]);

export async function checkSecurity(root: string): Promise<CheckResult[]> {
  const files = await listFiles(root);
  const results: CheckResult[] = [];

  for (const file of files) {
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
    const content = await readText(root, file);
    if (!content) {
      continue;
    }

    for (const suspicious of suspiciousPatterns) {
      if (suspicious.pattern.test(content)) {
        results.push({
          id: `security:${suspicious.id}:${file}`,
          title: suspicious.label,
          status: "warn",
          severity: "warning",
          file,
          message: `${file} contains ${suspicious.label}. Review before publishing.`,
          recommendation: "Confirm this is documentation/example text, not a real credential or private endpoint."
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
