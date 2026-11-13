import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { readPackageVersion, version } from "../src/version.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("packaging", () => {
  it("reads the version from package.json for source and dist layouts", () => {
    const pkg = readJson(path.join(repoRoot, "package.json"));
    const lock = readJson(path.join(repoRoot, "package-lock.json"));
    const lockRoot = lock.packages as { "": { version?: string } };

    expect(version).toBe(pkg.version);
    expect(readPackageVersion(pathToFileURL(path.join(repoRoot, "dist", "version.js")).href)).toBe(pkg.version);
    expect(lock.version).toBe(pkg.version);
    expect(lockRoot[""]?.version).toBe(pkg.version);
  });

  it("declares the entry point, exports, and reproducible install scripts", () => {
    const pkg = readJson(path.join(repoRoot, "package.json"));
    const bin = pkg.bin as { "repo-health"?: string };
    const exportsField = pkg.exports as { "."?: { import?: string }; "./multi"?: { import?: string } };
    const scripts = pkg.scripts as { prepare?: string; prepublishOnly?: string };
    const engines = pkg.engines as { node?: string; npm?: string };

    expect(typeof pkg.version).toBe("string");
    expect(bin["repo-health"]).toBe("./bin/repo-health.js");
    expect(exportsField["."]?.import).toBe("./dist/cli.js");
    expect(exportsField["./multi"]?.import).toBe("./dist/multi/index.js");
    expect(scripts.prepare).toContain("build");
    expect(scripts.prepublishOnly).toContain("npm test");
    expect(engines.node).toContain("20");
    expect(engines.npm).toContain("10");
    expect(pkg.packageManager).toBe("npm@10.9.9");
  });

  it("prints that version from the CLI entry point", async () => {
    const pkg = readJson(path.join(repoRoot, "package.json"));
    const result = await execFileAsync("node", ["--import", "tsx", path.join(repoRoot, "src/cli.ts"), "--version"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(result.stdout.trim()).toBe(pkg.version);
  });
});

function readJson(file: string): Record<string, unknown> & { version?: string; packages?: unknown } {
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown> & { version?: string; packages?: unknown };
}
