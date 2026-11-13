import { RepoTimeoutError, maxJobs, maxTimeoutMs } from "./types.js";

export function assertJobs(jobs: number): void {
  if (!Number.isInteger(jobs) || jobs < 1 || jobs > maxJobs) {
    throw new Error(`jobs must be an integer from 1 to ${maxJobs}, received ${jobs}`);
  }
}

export function assertTimeout(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > maxTimeoutMs) {
    throw new Error(`timeoutMs must be a positive number of milliseconds up to ${maxTimeoutMs}, received ${timeoutMs}`);
  }
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  assertJobs(concurrency);
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index] as T, index);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  if (workerCount === 0) {
    return results;
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  assertTimeout(timeoutMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  // A scan that loses the race can still reject later. Attach a handler now so that rejection is not unhandled.
  promise.catch(() => undefined);

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RepoTimeoutError(timeoutMs)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}
