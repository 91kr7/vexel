import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "vexel-analysis-cache-"));
process.env.VEXEL_DATA_DIR = dataDir;

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

/**
 * Runs `count` inserts in a second process against this test's own data
 * directory, all of them starting at `startAtEpochMs` so two children overlap
 * on purpose.
 */
function insertInAnotherProcess(label: string, count: number, sourcePath: string, startAtEpochMs: number): Promise<void> {
  const child = fileURLToPath(new URL("../support/analysis-cache-insert-child.ts", import.meta.url));
  const workspaceDir = fileURLToPath(new URL("../../", import.meta.url));
  return new Promise((resolve, reject) => {
    const childProcess = spawn(
      process.execPath,
      ["--import", "tsx", child, label, String(count), sourcePath, String(startAtEpochMs)],
      { cwd: workspaceDir, env: { ...process.env, VEXEL_DATA_DIR: dataDir }, stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    childProcess.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    childProcess.once("error", reject);
    childProcess.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`the ${label} process exited ${String(code)}: ${stderr}`))));
  });
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

// local-persistence/specs/extraction-cache-store.md — "An entry recorded by insert is found by a
// later lookup, whatever else was being inserted, invalidated or cleared at the same time ... one
// caller's entry can never be written over by another caller that had already read the index."
//
// The pair below is the one FilesystemExtractionService writes for a single image — the indexed
// tree and the raw tarball it was read from — and losing either of them is what the operator sees
// as an extraction that succeeded and then could not be read back.
test("two inserts issued at the same time are both recorded, neither written over by the other", async () => {
  await clear();
  const tree = sourceFile("concurrent-tree.json", '{"entries":[]}');
  const archive = sourceFile("concurrent-archive.tar", "an exported tarball");

  await Promise.all([insert("filesystem:sha256:concurrent", tree), insert("filesystem-archive:sha256:concurrent", archive)]);

  assert.ok(lookup("filesystem:sha256:concurrent"), "the tree's entry is not in the index");
  assert.ok(lookup("filesystem-archive:sha256:concurrent"), "the tarball's entry is not in the index");
});

// local-persistence/specs/extraction-cache-store.md — the same invariant names `invalidate` among
// the changes an insert must survive: a re-extraction invalidating its own keys must not take
// another image's entry with it.
test("an insert issued at the same time as another digest's invalidate survives it, and the invalidated one is gone", async () => {
  await clear();
  const kept = sourceFile("survives-invalidate.txt", "keep me");
  const doomed = sourceFile("doomed.txt", "remove me");
  await insert("sha256:doomed", doomed);

  await Promise.all([insert("sha256:kept", kept), invalidate("sha256:doomed")]);

  assert.ok(lookup("sha256:kept"), "the insert's entry was written over by the concurrent invalidate");
  assert.equal(lookup("sha256:doomed"), undefined);
});

// local-persistence/specs/extraction-cache-store.md — the same guarantee holds "for two processes
// sharing one data directory", which is what the parallel API pass is: one data directory, one
// process per test file. Only the promised half is asserted here — that neither process loses an
// entry — not the bounds LocalStore states around it (a killed lock holder, a filesystem without
// exclusive creation, a whole-value writeNamespace overwrite).
test("two processes inserting into one data directory at the same time each keep every entry", async () => {
  await clear();
  const source = sourceFile("cross-process.bin", "shared artifact content");
  const perProcess = 40;
  // Both children wait for the same instant before their first insert, so the
  // two runs interleave instead of merely following one another.
  const startAt = Date.now() + 2_000;

  await Promise.all([
    insertInAnotherProcess("alpha", perProcess, source, startAt),
    insertInAnotherProcess("beta", perProcess, source, startAt),
  ]);

  const missing: string[] = [];
  for (const label of ["alpha", "beta"]) {
    for (let index = 0; index < perProcess; index += 1) {
      if (!lookup(`${label}:${index}`)) missing.push(`${label}:${index}`);
    }
  }
  assert.deepEqual(missing, [], `${missing.length} of ${perProcess * 2} entries were lost`);
});
