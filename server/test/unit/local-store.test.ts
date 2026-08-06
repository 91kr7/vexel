import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const dataDir = mkdtempSync(join(tmpdir(), "vessel-local-store-"));
process.env.VESSEL_DATA_DIR = dataDir;

const { readNamespace, writeNamespace, resolveDataDir, cacheDir } = await import(
  "../../src/persistence/local-store.js"
);

// local-persistence/specs/local-store.md — resolveDataDir honors the VESSEL_DATA_DIR override
test("resolveDataDir returns VESSEL_DATA_DIR when it is set", () => {
  const previous = process.env.VESSEL_DATA_DIR;
  const override = join(tmpdir(), "vessel-data-dir-override-check");
  process.env.VESSEL_DATA_DIR = override;
  assert.equal(resolveDataDir(), override);
  process.env.VESSEL_DATA_DIR = previous;
});

// local-persistence/specs/local-store.md — resolveDataDir falls back to the per-user directory when unset
test("resolveDataDir falls back to ~/.vessel when VESSEL_DATA_DIR is unset", () => {
  const previous = process.env.VESSEL_DATA_DIR;
  delete process.env.VESSEL_DATA_DIR;
  assert.equal(resolveDataDir(), join(homedir(), ".vessel"));
  process.env.VESSEL_DATA_DIR = previous;
});

// local-persistence/specs/local-store.md — a namespace with no file yet returns the caller's fallback
test("readNamespace returns the fallback when the namespace file does not exist", () => {
  const fallback = { untouched: true };
  assert.deepEqual(readNamespace("console-history", fallback), fallback);
});

// local-persistence/specs/local-store.md — a write is durably readable back under the same namespace
test("writeNamespace persists data that readNamespace then returns", async () => {
  const data = { lastScreenId: "images", logFollow: true };
  await writeNamespace("preferences", data);
  assert.deepEqual(readNamespace("preferences", {}), data);
});

// local-persistence/specs/local-store.md — each namespace lives in its own file, independent of the others
test("writing one namespace does not affect another namespace's stored data", async () => {
  await writeNamespace("preferences", { marker: "preferences-only" });
  assert.deepEqual(readNamespace("console-history", { untouched: true }), { untouched: true });
});

// local-persistence/specs/local-store.md — a record from a mismatched schema version is treated as absent
test("readNamespace falls back when the stored record's schema version does not match the current one", () => {
  writeFileSync(
    join(dataDir, "analysis-cache-index.json"),
    JSON.stringify({ schemaVersion: 999, data: { stale: true } }),
    "utf-8",
  );
  const fallback = { entries: {} };
  assert.deepEqual(readNamespace("analysis-cache-index", fallback), fallback);
});

// local-persistence/specs/local-store.md — concurrent writes to the same namespace serialize instead of interleaving
test("two concurrent writes to the same namespace resolve in call order without corrupting the file", async () => {
  const first = writeNamespace("preferences", { lastScreenId: "first" });
  const second = writeNamespace("preferences", { lastScreenId: "second" });
  await Promise.all([first, second]);
  assert.deepEqual(readNamespace("preferences", {}), { lastScreenId: "second" });
});

// local-persistence/specs/local-store.md — cacheDir creates and returns the analysis-cache subdirectory
test("cacheDir creates and returns the analysis-cache subdirectory of the data directory", () => {
  const dir = cacheDir();
  assert.equal(dir, join(dataDir, "analysis-cache"));
  assert.ok(existsSync(dir));
});
