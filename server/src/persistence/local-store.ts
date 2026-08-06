// Reads/writes the application's local, per-user data: one JSON file per
// namespace inside a per-user application-data directory (REQ-113, REQ-114,
// REQ-115). Writes are serialized per namespace and land via a
// temp-file-then-rename sequence so concurrent/interrupted writes stay safe.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SCHEMA_VERSION = 1;

export type StoreNamespace = "preferences" | "console-history" | "analysis-cache-index";

interface StoreRecord<T> {
  schemaVersion: number;
  data: T;
}

export function resolveDataDir(): string {
  return process.env.VESSEL_DATA_DIR ?? join(homedir(), ".vessel");
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
  const queued = (writeQueues.get(namespace) ?? Promise.resolve()).then(
    () => writeAtomic(namespace, data),
    () => writeAtomic(namespace, data),
  );
  writeQueues.set(namespace, queued);
  return queued;
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
