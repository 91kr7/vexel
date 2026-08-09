// Content-addressed cache for extraction/analysis artifacts, keyed by image
// content digest (REQ-113): never recompute the same content twice.
import { copyFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { cacheDir, readNamespace, updateNamespace } from "./local-store.js";

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

// Every change to the index goes through here: read, change and write back are
// one indivisible step, so a concurrent insert cannot be written over by an
// insert that had already read the index before it.
function updateIndex(mutate: (index: CacheIndex) => CacheIndex): Promise<CacheIndex> {
  return updateNamespace<CacheIndex>("analysis-cache-index", {}, mutate);
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
  await updateIndex((index) => {
    index[digest] = entry;
    return index;
  });
  return entry;
}

export async function invalidate(digest: string): Promise<void> {
  let removed: AnalysisCacheEntry | undefined;
  await updateIndex((index) => {
    removed = index[digest];
    delete index[digest];
    return index;
  });
  if (!removed) return;
  const file = join(cacheDir(), removed.fileName);
  if (existsSync(file)) rmSync(file);
}

export function totalSizeBytes(): number {
  return Object.values(readIndex()).reduce((sum, entry) => sum + entry.sizeBytes, 0);
}

export async function clear(): Promise<void> {
  let removed: AnalysisCacheEntry[] = [];
  await updateIndex((index) => {
    removed = Object.values(index);
    return {};
  });
  for (const entry of removed) {
    const file = join(cacheDir(), entry.fileName);
    if (existsSync(file)) rmSync(file);
  }
}

export function reclaimOrphans(): void {
  const index = readIndex();
  const knownFiles = new Set(Object.values(index).map((entry) => entry.fileName));
  for (const fileName of readdirSync(cacheDir())) {
    if (!knownFiles.has(fileName)) rmSync(join(cacheDir(), fileName));
  }
}
