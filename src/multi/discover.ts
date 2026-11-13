import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { exists } from "../utils/files.js";

const repoMarkers = [".git", "package.json", "README.md", "LICENSE", "go.mod", "Cargo.toml", "pyproject.toml", "composer.json"];
const skippedDirectoryNames = new Set(["node_modules", "dist", "coverage"]);

export interface DiscoverInput {
  cwd?: string;
  listFiles?: readonly string[];
  directories?: readonly string[];
}

export async function discoverRepositories(input: DiscoverInput): Promise<string[]> {
  const cwd = input.cwd ?? process.cwd();
  const found: string[] = [];

  for (const listFile of input.listFiles ?? []) {
    found.push(...(await readListFile(path.resolve(cwd, listFile), cwd)));
  }

  for (const directory of input.directories ?? []) {
    found.push(...(await discoverChildRepositories(path.resolve(cwd, directory))));
  }

  return dedupeExistingPaths(found);
}

async function readListFile(filePath: string, cwd: string): Promise<string[]> {
  let content: string;
  try {
    content = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Could not read repository list ${filePath}: ${(error as Error).message}`);
  }

  const entries = filePath.endsWith(".json") ? parseJsonList(content, filePath) : parseTextList(content);
  if (entries.length === 0) {
    throw new Error(`No repository paths found in ${filePath}`);
  }

  const base = path.dirname(filePath);
  return entries.map((entry) => (path.isAbsolute(entry) ? entry : path.resolve(base || cwd, entry)));
}

function parseTextList(content: string): string[] {
  return content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function parseJsonList(content: string, filePath: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Could not parse ${filePath}: ${(error as Error).message}`);
  }

  const entries = jsonEntries(parsed);
  if (!entries) {
    throw new Error(`${filePath} must be an array of paths or an object with a repos or repositories array`);
  }

  return entries.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function jsonEntries(parsed: unknown): string[] | null {
  if (isStringArray(parsed)) {
    return parsed;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const record = parsed as { repos?: unknown; repositories?: unknown };
  if (isStringArray(record.repos)) {
    return record.repos;
  }
  if (isStringArray(record.repositories)) {
    return record.repositories;
  }
  return null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

export async function discoverChildRepositories(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Could not read repository directory ${directory}: ${(error as Error).message}`);
  }

  const children = entries
    .filter((entry) => !entry.name.startsWith("."))
    .filter((entry) => !skippedDirectoryNames.has(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name));

  const repos: string[] = [];
  for (const child of children) {
    const childPath = path.join(directory, child.name);
    if (!(await isDirectory(childPath))) {
      continue;
    }
    if (await looksLikeRepository(childPath)) {
      repos.push(childPath);
    }
  }

  if (repos.length === 0) {
    throw new Error(
      `No repositories found in ${directory}. Each child directory needs a marker such as .git, package.json, README.md, or LICENSE.`
    );
  }

  return repos;
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    const info = await stat(target);
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function looksLikeRepository(directory: string): Promise<boolean> {
  for (const marker of repoMarkers) {
    if (await exists(directory, marker)) {
      return true;
    }
  }
  return false;
}

async function dedupeExistingPaths(paths: readonly string[]): Promise<string[]> {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const repoPath of paths) {
    const resolved = path.resolve(repoPath);
    let key = resolved;
    try {
      key = await realpath(resolved);
    } catch {
      key = resolved;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(key);
  }

  return unique;
}
