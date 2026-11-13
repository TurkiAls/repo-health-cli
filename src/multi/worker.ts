import { scanRepository } from "../scanner.js";

interface WorkerRequest {
  root: string;
  configPath?: string;
}

if (typeof process.send !== "function") {
  throw new Error("The multi-repo worker must be started as a child process");
}

const send = process.send.bind(process);

process.on("message", (message: unknown) => {
  if (isReady(message)) {
    return;
  }
  void run(message);
});

send({ ready: true }, () => undefined);

async function run(message: unknown): Promise<void> {
  if (!isWorkerRequest(message)) {
    reply({ ok: false, message: "Invalid worker data" });
    return;
  }

  try {
    const report = await scanRepository({ root: message.root, configPath: message.configPath });
    reply({ ok: true, report });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    reply({ ok: false, message: text });
  }
}

function reply(payload: { ok: boolean; report?: unknown; message?: string }): void {
  send(payload, () => {
    process.exit(0);
  });
}

function isReady(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as { ready?: unknown }).ready === true;
}

function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as { root?: unknown; configPath?: unknown };
  if (typeof record.root !== "string" || record.root.length === 0) {
    return false;
  }
  return record.configPath === undefined || typeof record.configPath === "string";
}
