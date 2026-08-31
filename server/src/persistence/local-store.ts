// Reads/writes the application's local, per-user data: one JSON file per
// namespace inside a per-user application-data directory (REQ-113, REQ-114,
// REQ-115). Writes are serialized per namespace and land via a
// temp-file-then-rename sequence so concurrent/interrupted writes stay safe.
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SCHEMA_VERSION = 1;

export type StoreNamespace = "preferences" | "console-history" | "analysis-cache-index";

interface StoreRecord<T> {
  schemaVersion: number;
  data: T;
}

export function resolveDataDir(): string {
  return process.env.VEXEL_DATA_DIR ?? join(homedir(), ".vexel");
}

const dataDir = resolveDataDir();
mkdirSync(dataDir, { recursive: true });

const writeQueues = new Map<StoreNamespace, Promise<void>>();

function filePathFor(namespace: StoreNamespace): string {
  return join(dataDir, `${namespace}.json`);
}

export function readNamespace<T>(namespace: StoreNamespace, fallback: T): T {
  const file = filePathFor(namespace);
  if (!existsSync(file)) return fallback;
  try {
    const record = JSON.parse(readFileSync(file, "utf-8")) as StoreRecord<T>;
    if (record.schemaVersion !== SCHEMA_VERSION) return fallback;
    return record.data;
  } catch {
    return fallback;
  }
}

export function writeNamespace<T>(namespace: StoreNamespace, data: T): Promise<void> {
  return enqueue(namespace, () => writeAtomic(namespace, data));
}

/**
 * Read, change and write back a namespace as one indivisible step: the caller's
 * `mutate` sees the file as it is at that moment and nothing else can read it
 * again until the result has landed, so two concurrent updates can no longer
 * each write over the other's change. `mutate` must be synchronous — the guard
 * is never held across an await.
 */
export function updateNamespace<T>(namespace: StoreNamespace, fallback: T, mutate: (current: T) => T): Promise<T> {
  return enqueue(namespace, async () => {
    const release = await acquireNamespaceLock(namespace);
    try {
      const updated = mutate(readNamespace(namespace, fallback));
      writeAtomic(namespace, updated);
      return updated;
    } finally {
      release();
    }
  });
}

function enqueue<T>(namespace: StoreNamespace, task: () => T | Promise<T>): Promise<T> {
  const queued = (writeQueues.get(namespace) ?? Promise.resolve()).then(task, task);
  writeQueues.set(
    namespace,
    queued.then(
      () => undefined,
      () => undefined,
    ),
  );
  return queued;
}

// Tolerances, not cadences: bets on how slow this machine's disk and its other processes may be.
// Sharpest is LOCK_STALE_MS — shortened, a live writer's lock is stolen and persisted state breaks.
const LOCK_POLL_MS = 15;
const LOCK_WAIT_TIMEOUT_MS = 5_000;
const LOCK_STALE_MS = 15_000;

/**
 * Advisory guard against another *process* on the same data directory: `wx`
 * fails when the file already exists, so exactly one holder gets it. A lock
 * older than `LOCK_STALE_MS` belonged to a process that died before releasing
 * it and is broken; a lock that cannot be taken at all (contention past the
 * timeout, or a data directory that refuses the file) degrades to the
 * in-process queue rather than failing the caller's operation.
 */
async function acquireNamespaceLock(namespace: StoreNamespace): Promise<() => void> {
  const lockFile = `${filePathFor(namespace)}.lock`;
  const giveUpAt = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  for (;;) {
    try {
      closeSync(openSync(lockFile, "wx"));
      return () => rmSync(lockFile, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") return () => undefined;
      if (lockAgeMs(lockFile) > LOCK_STALE_MS) {
        rmSync(lockFile, { force: true });
        continue;
      }
      if (Date.now() >= giveUpAt) return () => undefined;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, LOCK_POLL_MS);
      });
    }
  }
}

function lockAgeMs(lockFile: string): number {
  try {
    return Date.now() - statSync(lockFile).mtimeMs;
  } catch {
    // Released between the failed open and this check: not stale, retry.
    return 0;
  }
}

function writeAtomic<T>(namespace: StoreNamespace, data: T): void {
  const record: StoreRecord<T> = { schemaVersion: SCHEMA_VERSION, data };
  const file = filePathFor(namespace);
  const tempFile = `${file}.${process.pid}.tmp`;
  writeFileSync(tempFile, JSON.stringify(record, null, 2), "utf-8");
  renameSync(tempFile, file);
}

export function cacheDir(): string {
  const dir = join(dataDir, "analysis-cache");
  mkdirSync(dir, { recursive: true });
  return dir;
}
