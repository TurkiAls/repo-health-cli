import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scanRepository } from "../src/scanner.js";
import { renderJson } from "../src/reporters/json.js";
import { renderMarkdown } from "../src/reporters/markdown.js";
import { renderSarif } from "../src/reporters/sarif.js";

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "repo-health-test-"));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

async function write(relativePath: string, content: string): Promise<void> {
  const absolute = path.join(tempRoot, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

describe("scanRepository", () => {
  it("detects a missing README", async () => {
    await write("package.json", JSON.stringify({ scripts: { build: "tsc" } }));

    const report = await scanRepository({ root: tempRoot });

    expect(report.missingFiles).toContain("README.md");
  });

  it("detects a license file", async () => {
    await write("README.md", "# Test");
    await write("LICENSE", "MIT");

    const report = await scanRepository({ root: tempRoot });
    const licenseCheck = report.results.find((result) => result.id === "required:LICENSE");

    expect(licenseCheck?.status).toBe("pass");
  });

  it("detects a security policy file", async () => {
    await write("SECURITY.md", "# Security");

    const report = await scanRepository({ root: tempRoot });
    const securityCheck = report.results.find((result) => result.id === "required:SECURITY.md");

    expect(securityCheck?.status).toBe("pass");
  });

  it("detects suspicious env files", async () => {
    const envName = ["OPENAI", "API", "KEY"].join("_");
    const envValue = ["sk", "example", "value", "12345678901234567890"].join("-");
    await write(".env", `${envName}=${envValue}`);

    const report = await scanRepository({ root: tempRoot });

    expect(report.securityWarnings.some((warning) => warning.id.startsWith("security:env"))).toBe(true);
    expect(report.securityWarnings.some((warning) => warning.line === 1)).toBe(true);
    expect(report.score).toBeLessThan(100);
  });

  it("renders JSON output", async () => {
    await write("README.md", "# Test");

    const report = await scanRepository({ root: tempRoot });
    const json = renderJson(report);

    expect(JSON.parse(json)).toMatchObject({ root: tempRoot });
  });

  it("renders Markdown output", async () => {
    await write("README.md", "# Test");

    const report = await scanRepository({ root: tempRoot });
    const markdown = renderMarkdown(report);

    expect(markdown).toContain("# Repository Health Report");
    expect(markdown).toContain("Maintainer readiness");
  });

  it("renders SARIF output", async () => {
    await write(".env", `${["DATABASE", "URL"].join("_")}=postgres://example`);

    const report = await scanRepository({ root: tempRoot });
    const sarif = JSON.parse(renderSarif(report)) as { version: string; runs: Array<{ results: unknown[] }> };

    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0]?.results.length).toBeGreaterThan(0);
  });

  it("loads repo-health config files", async () => {
    await write("package.json", JSON.stringify({ scripts: { build: "tsc", test: "vitest", lint: "eslint" } }));
    await write("custom-readme.md", "# Custom");
    await write(
      "repo-health.config.json",
      JSON.stringify({
        requiredFiles: ["custom-readme.md", "package.json"],
        requiredPaths: [],
        ignorePaths: ["ignored"],
        security: {
          additionalPatterns: [{ id: "internal-id", label: "Internal ID", pattern: "INTERNAL-[0-9]+", severity: "warning" }]
        }
      })
    );
    await write("ignored/.env", `${["DATABASE", "URL"].join("_")}=postgres://ignored`);
    await write("src/example.txt", "INTERNAL-123");

    const report = await scanRepository({ root: tempRoot });

    expect(report.configPath).toBe("repo-health.config.json");
    expect(report.missingFiles).not.toContain("README.md");
    expect(report.securityWarnings.some((warning) => warning.ruleId === "internal-id")).toBe(true);
    expect(report.securityWarnings.some((warning) => warning.file === "ignored/.env")).toBe(false);
  });

  it("scores a complete repository higher than an incomplete repository", async () => {
    const incomplete = await scanRepository({ root: tempRoot });

    await write("README.md", "# Test");
    await write("LICENSE", "MIT");
    await write("SECURITY.md", "# Security");
    await write("CONTRIBUTING.md", "# Contributing");
    await write("CODE_OF_CONDUCT.md", "# Code of Conduct");
    await write("CHANGELOG.md", "# Changelog");
    await write(".gitignore", "node_modules/");
    await write("package.json", JSON.stringify({ scripts: { build: "tsc", test: "vitest", lint: "eslint" } }));
    await write(".github/workflows/ci.yml", "name: CI");
    await write(".github/ISSUE_TEMPLATE/bug_report.md", "bug");
    await write(".github/pull_request_template.md", "pr");

    const complete = await scanRepository({ root: tempRoot });

    expect(complete.score).toBeGreaterThan(incomplete.score);
    expect(complete.maintainerReadinessScore).toBeGreaterThan(incomplete.maintainerReadinessScore);
  });
});
