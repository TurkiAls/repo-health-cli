import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

export async function exists(root: string, relativePath: string): Promise<boolean> {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function readText(root: string, relativePath: string): Promise<string | null> {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch {
    return null;
  }
}

export async function listFiles(
  root: string,
  ignoredDirectories = new Set([".git", "node_modules", "dist", "coverage"]),
  ignoredPaths: string[] = []
): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }

      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute);
      if (isIgnored(relative, ignoredPaths)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        files.push(relative);
      }
    }
  }

  await walk(root);
  return files.sort();
}

function isIgnored(relativePath: string, ignoredPaths: string[]): boolean {
  return ignoredPaths.some((ignoredPath) => {
    const normalized = ignoredPath.replace(/\/$/, "");
    return relativePath === normalized || relativePath.startsWith(`${normalized}/`);
  });
}
