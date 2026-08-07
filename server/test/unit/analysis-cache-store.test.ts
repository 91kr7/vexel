import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.VEXEL_DATA_DIR = mkdtempSync(join(tmpdir(), "vexel-analysis-cache-"));

const { cacheDir } = await import("../../src/persistence/local-store.js");
const { lookup, insert, invalidate, totalSizeBytes, clear, reclaimOrphans } = await import(
  "../../src/persistence/analysis-cache-store.js"
);

const sourcesDir = mkdtempSync(join(tmpdir(), "vexel-analysis-cache-sources-"));

function sourceFile(name: string, content: string): string {
  const path = join(sourcesDir, name);
  writeFileSync(path, content, "utf-8");
  return path;
}

// local-persistence/specs/extraction-cache-store.md — a digest never inserted is a cache miss
test("lookup returns undefined for a digest that was never inserted", () => {
  assert.equal(lookup("sha256:never-inserted"), undefined);
});

// local-persistence/specs/extraction-cache-store.md — insert copies the artifact and records it, lookup then finds it
test("insert copies the source file into the cache and lookup then returns the matching entry", async () => {
  const source = sourceFile("first.txt", "first-artifact-content");
  const entry = await insert("sha256:first", source);

  assert.equal(entry.digest, "sha256:first");
  assert.equal(entry.sizeBytes, statSync(source).size);
  assert.deepEqual(lookup("sha256:first"), entry);
});

// local-persistence/specs/extraction-cache-store.md — a lookup never returns a stale artifact: insert overwrites file and index
test("inserting again for the same digest overwrites the previous artifact and index entry", async () => {
  const original = sourceFile("overwrite-1.txt", "short");
  await insert("sha256:overwrite", original);

  const replacement = sourceFile("overwrite-2.txt", "a much longer replacement content");
  const updatedEntry = await insert("sha256:overwrite", replacement);

  const found = lookup("sha256:overwrite");
  assert.deepEqual(found, updatedEntry);
  assert.equal(found?.sizeBytes, statSync(replacement).size);
});

// local-persistence/specs/extraction-cache-store.md — a lookup is a cache miss when the index entry's file is missing on disk
test("lookup is a cache miss when the indexed file has been removed from disk out of band", async () => {
  const source = sourceFile("orphaned-index-entry.txt", "will be removed");
  const entry = await insert("sha256:missing-file", source);
  rmSync(join(cacheDir(), entry.fileName));

  assert.equal(lookup("sha256:missing-file"), undefined);
});

// local-persistence/specs/extraction-cache-store.md — invalidate removes both the entry and its file
test("invalidate removes the entry and its artifact file for the given digest", async () => {
  const source = sourceFile("to-invalidate.txt", "invalidate me");
  const entry = await insert("sha256:invalidate", source);
  const artifactPath = join(cacheDir(), entry.fileName);
  assert.ok(existsSync(artifactPath));

  await invalidate("sha256:invalidate");

  assert.equal(lookup("sha256:invalidate"), undefined);
  assert.equal(existsSync(artifactPath), false);
});

// local-persistence/specs/extraction-cache-store.md — totalSizeBytes sums every indexed entry's size
test("totalSizeBytes sums the sizes of every currently indexed entry", async () => {
  await clear();
  const first = sourceFile("size-a.txt", "12345");
  const second = sourceFile("size-b.txt", "1234567890");
  await insert("sha256:size-a", first);
  await insert("sha256:size-b", second);

  assert.equal(totalSizeBytes(), statSync(first).size + statSync(second).size);
});

// local-persistence/specs/extraction-cache-store.md — clear removes every entry and every artifact file
test("clear removes every entry and every artifact file", async () => {
  const source = sourceFile("to-clear.txt", "clear me");
  await insert("sha256:clear-me", source);

  await clear();

  assert.equal(totalSizeBytes(), 0);
  assert.equal(lookup("sha256:clear-me"), undefined);
});

// local-persistence/specs/extraction-cache-store.md — reclaimOrphans deletes files with no matching index entry
test("reclaimOrphans deletes an unindexed cache file left behind by an interrupted run, keeping indexed ones", async () => {
  await clear();
  const kept = sourceFile("kept.txt", "kept artifact");
  const entry = await insert("sha256:kept", kept);
  const orphanPath = join(cacheDir(), "orphan-file");
  writeFileSync(orphanPath, "leftover from an interrupted run", "utf-8");

  reclaimOrphans();

  assert.equal(existsSync(orphanPath), false);
  assert.ok(existsSync(join(cacheDir(), entry.fileName)));
});
