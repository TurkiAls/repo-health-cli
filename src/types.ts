export type Severity = "info" | "warning" | "critical";

export interface CheckResult {
  id: string;
  title: string;
  status: "pass" | "fail" | "warn";
  severity: Severity;
  message: string;
  recommendation?: string;
  file?: string;
  line?: number;
  column?: number;
  ruleId?: string;
}

export interface ScanOptions {
  root: string;
  configPath?: string;
}

export interface SecurityPatternConfig {
  id: string;
  label: string;
  pattern: string;
  severity?: Exclude<Severity, "info">;
}

export interface RepoHealthConfig {
  ignorePaths?: string[];
  requiredFiles?: string[];
  requiredPaths?: string[];
  security?: {
    allowlistFiles?: string[];
    additionalPatterns?: SecurityPatternConfig[];
  };
}

export interface ScanReport {
  root: string;
  configPath?: string;
  score: number;
  maintainerReadinessScore: number;
  passed: number;
  failed: number;
  warnings: number;
  results: CheckResult[];
  missingFiles: string[];
  securityWarnings: CheckResult[];
  recommendations: string[];
}
