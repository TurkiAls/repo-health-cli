#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "cli.js");

if (!existsSync(cli)) {
  process.stderr.write("repo-health is not built. From the package root, run npm ci so prepare can compile dist/cli.js.\n");
  process.exit(1);
}

await import(pathToFileURL(cli).href);
