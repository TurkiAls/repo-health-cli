import { stat } from "node:fs/promises";
import path from "node:path";
import { InvalidArgumentError } from "commander";
import type { Command } from "commander";
import { discoverRepositories } from "./discover.js";
import { renderMultiJson, renderMultiMarkdown, writeHealthOutputs } from "./render.js";
import { scanRepositories } from "./scan-many.js";
import { defaultJobs, defaultTimeoutMs, maxJobs, maxTimeoutMs } from "./types.js";

export interface MultiCommandIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  cwd: string;
  setExitCode: (code: number) => void;
}

interface MultiFlags {
  list?: string;
  dir?: string;
  jobs: number;
  timeout: number;
  config?: string;
  out?: string;
  json?: boolean;
  markdown?: boolean;
  minScore?: number;
}

export function registerMultiCommand(program: Command, io: MultiCommandIo = defaultIo()): void {
  program.configureOutput({
    writeOut: (text) => io.stdout(text),
    writeErr: (text) => io.stderr(text)
  });

  program
    .command("multi")
    .description("Scan a list or directory of repositories and print a ranked health table.")
    .argument("[target]", "Directory of repositories, or a text/JSON list of paths")
    .option("--list <file>", "Text or JSON file of repository paths")
    .option("--dir <path>", "Directory whose child folders are repositories")
    .option("--jobs <n>", `Maximum repositories scanned at once (1-${maxJobs})`, parseJobs, defaultJobs)
    .option("--timeout <ms>", `Per-repository timeout in milliseconds (max ${maxTimeoutMs})`, parseTimeout, defaultTimeoutMs)
    .option("--config <path>", "Config file forwarded to each repository scan")
    .option("--out <dir>", "Write health.md and health.json into this directory")
    .option("--json", "Print the JSON table to stdout")
    .option("--markdown", "Print the Markdown table to stdout")
    .option("--min-score <n>", "Exit with code 1 when a scanned repository scores below this value", parseMinScore)
    .addHelpText(
      "after",
      `
Examples:
  $ repo-health multi --dir ./repos --out ./health-report
  $ repo-health multi --list repos.txt --jobs 4 --timeout 20000
  $ repo-health multi ./repos --json
`
    )
    .action(async (target: string | undefined, flags: MultiFlags) => {
      const discovered = await resolveInputs(target, flags, io.cwd);
      const repos = await discoverRepositories({
        cwd: io.cwd,
        listFiles: discovered.listFiles,
        directories: discovered.directories
      });
      const report = await scanRepositories({
        repos,
        jobs: flags.jobs,
        timeoutMs: flags.timeout,
        configPath: flags.config
      });
      const markdown = renderMultiMarkdown(report);
      const json = renderMultiJson(report);

      if (flags.out) {
        const written = await writeHealthOutputs(path.resolve(io.cwd, flags.out), report);
        io.stderr(`Wrote ${written.markdownPath}\nWrote ${written.jsonPath}\n`);
      }

      const wantJson = flags.json === true;
      const wantMarkdown = flags.markdown === true || !wantJson;
      if (wantMarkdown) {
        io.stdout(markdown);
      }
      if (wantJson) {
        io.stdout(json);
      }

      const minScore = flags.minScore;
      const belowMinimum =
        minScore !== undefined && report.ranked.some((row) => row.status === "ok" && (row.score ?? 0) < minScore);
      if (report.summary.timedOut > 0 || report.summary.errored > 0 || belowMinimum) {
        io.setExitCode(1);
      }
    });
}

export function defaultIo(): MultiCommandIo {
  return {
    stdout: (text) => {
      process.stdout.write(text);
    },
    stderr: (text) => {
      process.stderr.write(text);
    },
    cwd: process.cwd(),
    setExitCode: (code) => {
      process.exitCode = code;
    }
  };
}

async function resolveInputs(
  target: string | undefined,
  flags: MultiFlags,
  cwd: string
): Promise<{ listFiles: string[]; directories: string[] }> {
  const listFiles = flags.list ? [flags.list] : [];
  const directories = flags.dir ? [flags.dir] : [];

  if (target) {
    const absolute = path.resolve(cwd, target);
    const kind = await targetKind(absolute);
    if (kind === "directory") {
      directories.push(absolute);
    } else if (kind === "file") {
      listFiles.push(absolute);
    }
  }

  if (listFiles.length === 0 && directories.length === 0) {
    throw new Error("Provide a directory or list of repositories. Example: repo-health multi --dir ./repos");
  }

  return { listFiles, directories };
}

async function targetKind(target: string): Promise<"file" | "directory"> {
  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      return "directory";
    }
    if (info.isFile()) {
      return "file";
    }
    throw new Error(`Target is not a file or directory: ${target}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Target is not")) {
      throw error;
    }
    throw new Error(`Target does not exist: ${target}`);
  }
}

function parseJobs(value: string): number {
  const parsed = parseWholeNumber(value, "--jobs");
  if (parsed < 1 || parsed > maxJobs) {
    throw new InvalidArgumentError(`--jobs must be an integer from 1 to ${maxJobs}`);
  }
  return parsed;
}

function parseTimeout(value: string): number {
  const parsed = parseWholeNumber(value, "--timeout");
  if (parsed < 1 || parsed > maxTimeoutMs) {
    throw new InvalidArgumentError(`--timeout must be an integer from 1 to ${maxTimeoutMs}`);
  }
  return parsed;
}

function parseMinScore(value: string): number {
  const parsed = parseWholeNumber(value, "--min-score");
  if (parsed > 100) {
    throw new InvalidArgumentError("--min-score must be an integer from 0 to 100");
  }
  return parsed;
}

function parseWholeNumber(value: string, flag: string): number {
  if (!/^[0-9]+$/.test(value)) {
    throw new InvalidArgumentError(`${flag} must be an integer, received ${value}`);
  }
  return Number(value);
}
