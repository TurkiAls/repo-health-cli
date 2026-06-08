export type Severity = "info" | "warning" | "critical";

export interface CheckResult {
  id: string;
  title: string;
  status: "pass" | "fail" | "warn";
  severity: Severity;
  message: string;
  recommendation?: string;
  file?: string;
}

export interface ScanOptions {
  root: string;
}

export interface ScanReport {
  root: string;
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
