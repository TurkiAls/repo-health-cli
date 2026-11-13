import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageName = "repo-health-cli";

interface RepoPackage {
  version: string;
}

export function readPackageVersion(moduleUrl: string = import.meta.url): string {
  let directory = dirname(fileURLToPath(moduleUrl));

  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(directory, "package.json");
    const version = readVersion(candidate);
    if (version) {
      return version;
    }

    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }

  throw new Error("Could not locate the repo-health-cli package version");
}

export const version = readPackageVersion();

function readVersion(candidate: string): string | undefined {
  let raw: string;
  try {
    raw = readFileSync(candidate, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }

  if (!isRepoPackage(parsed)) {
    return undefined;
  }

  return parsed.version;
}

function isRepoPackage(value: unknown): value is RepoPackage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as { name?: unknown; version?: unknown };
  return record.name === packageName && typeof record.version === "string" && record.version.length > 0;
}
