import { fork, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { ScanReport } from "../types.js";
import { RepoTimeoutError } from "./types.js";

interface WorkerSuccess {
  ok: true;
  report: ScanReport;
}

interface WorkerFailure {
  ok: false;
  message: string;
}

type WorkerMessage = WorkerSuccess | WorkerFailure;

export function resolveWorkerLaunch(moduleUrl: string = import.meta.url): { filename: string; execArgv: string[] } {
  if (moduleUrl.endsWith(".ts")) {
    const require = createRequire(moduleUrl);
    return {
      filename: fileURLToPath(new URL("./worker.ts", moduleUrl)),
      execArgv: ["--import", require.resolve("tsx")]
    };
  }

  return {
    filename: fileURLToPath(new URL("./worker.js", moduleUrl)),
    execArgv: []
  };
}

export function scanIsolated(root: string, configPath: string | undefined, timeoutMs: number): Promise<ScanReport> {
  const { filename, execArgv } = resolveWorkerLaunch();

  return new Promise((resolve, reject) => {
    const child = fork(filename, [], {
      execArgv,
      stdio: ["ignore", "ignore", "pipe", "ipc"]
    });
    let outcome: "pending" | "done" = "pending";
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });

    const timer = setTimeout(() => {
      if (outcome !== "pending") {
        return;
      }
      outcome = "done";
      stopChild(child);
      reject(new RepoTimeoutError(timeoutMs));
    }, timeoutMs);

    child.on("message", (message: unknown) => {
      if (isReady(message)) {
        if (outcome !== "pending") {
          return;
        }
        try {
          child.send({ root, configPath });
        } catch (error) {
          outcome = "done";
          clearTimeout(timer);
          stopChild(child);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
        return;
      }
      if (outcome !== "pending") {
        return;
      }
      outcome = "done";
      clearTimeout(timer);
      const parsed = readMessage(message);
      if (!parsed) {
        stopChild(child);
        reject(new Error("Repository scan process returned an unreadable result"));
        return;
      }
      if (parsed.ok) {
        resolve(parsed.report);
        return;
      }
      reject(new Error(parsed.message));
    });

    child.once("error", (error: Error) => {
      if (outcome !== "pending") {
        return;
      }
      outcome = "done";
      clearTimeout(timer);
      stopChild(child);
      reject(error);
    });

    child.once("exit", (code) => {
      // A result message queued in the same turn should win over the exit event.
      setImmediate(() => {
        if (outcome !== "pending") {
          return;
        }
        outcome = "done";
        clearTimeout(timer);
        const detail = stderr.trim();
        const suffix = detail ? `: ${detail}` : "";
        reject(new Error(`Repository scan process exited with code ${code}${suffix}`));
      });
    });
  });
}

function stopChild(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // The process already exited.
  }
}

function isReady(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { ready?: unknown }).ready === true;
}

function readMessage(value: unknown): WorkerMessage | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const record = value as { ok?: unknown; report?: ScanReport; message?: unknown };
  if (record.ok === true && typeof record.report === "object" && record.report !== null) {
    return { ok: true, report: record.report };
  }
  if (record.ok === false && typeof record.message === "string") {
    return { ok: false, message: record.message };
  }
  return null;
}
