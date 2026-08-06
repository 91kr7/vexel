// Content-addressed cache for extraction/analysis artifacts, keyed by image
// content digest (REQ-113): never recompute the same content twice.
import { copyFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { cacheDir, readNamespace, writeNamespace } from "./local-store.js";

export interface AnalysisCacheEntry {
  digest: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

type CacheIndex = Record<string, AnalysisCacheEntry>;

function readIndex(): CacheIndex {
  return readNamespace<CacheIndex>("analysis-cache-index", {});
}

function writeIndex(index: CacheIndex): Promise<void> {
  return writeNamespace("analysis-cache-index", index);
}

export function lookup(digest: string): AnalysisCacheEntry | undefined {
  const entry = readIndex()[digest];
  if (!entry) return undefined;
  if (!existsSync(join(cacheDir(), entry.fileName))) return undefined;
  return entry;
}

export async function insert(digest: string, sourcePath: string): Promise<AnalysisCacheEntry> {
  const destination = join(cacheDir(), digest);
  copyFileSync(sourcePath, destination);
  const entry: AnalysisCacheEntry = {
    digest,
    fileName: digest,
    sizeBytes: statSync(destination).size,
    createdAt: new Date().toISOString(),
  };
  const index = readIndex();
  index[digest] = entry;
  await writeIndex(index);
  return entry;
}

export async function invalidate(digest: string): Promise<void> {
  const index = readIndex();
  const entry = index[digest];
  if (!entry) return;
  delete index[digest];
  await writeIndex(index);
  const file = join(cacheDir(), entry.fileName);
  if (existsSync(file)) rmSync(file);
}

export function totalSizeBytes(): number {
  return Object.values(readIndex()).reduce((sum, entry) => sum + entry.sizeBytes, 0);
}

export async function clear(): Promise<void> {
  const index = readIndex();
  for (const entry of Object.values(index)) {
    const file = join(cacheDir(), entry.fileName);
    if (existsSync(file)) rmSync(file);
  }
  await writeIndex({});
}

export function reclaimOrphans(): void {
  const index = readIndex();
  const knownFiles = new Set(Object.values(index).map((entry) => entry.fileName));
  for (const fileName of readdirSync(cacheDir())) {
    if (!knownFiles.has(fileName)) rmSync(join(cacheDir(), fileName));
  }
}
