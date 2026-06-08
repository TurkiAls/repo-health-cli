import path from "node:path";
import type { RepoHealthConfig } from "./types.js";
import { exists, readText } from "./utils/files.js";

const defaultConfigFile = "repo-health.config.json";

export async function loadConfig(root: string, configPath?: string): Promise<{ config: RepoHealthConfig; configPath?: string }> {
  const relativePath = configPath ?? defaultConfigFile;
  const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
  const displayPath = path.relative(root, absolutePath) || relativePath;

  if (!(await exists(path.dirname(absolutePath), path.basename(absolutePath)))) {
    return { config: {} };
  }

  const content = await readText(path.dirname(absolutePath), path.basename(absolutePath));
  if (!content) {
    return { config: {} };
  }

  try {
    return {
      config: JSON.parse(content) as RepoHealthConfig,
      configPath: displayPath
    };
  } catch (error) {
    throw new Error(`Could not parse ${displayPath}: ${(error as Error).message}`);
  }
}
