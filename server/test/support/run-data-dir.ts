/**
 * The run's data directory, and how a test is given an empty one.
 *
 * `VEXEL_DATA_DIR` holds everything the application persists — the operator's
 * preferences, the console history, the analysis cache and its index — and all
 * of it outlives the test that wrote it. That is the widest shared state the
 * suite has, and leaving any of it standing breaks the same rule twice: a test
 * **inherits** what another wrote, and a test that expected the defaults finds
 * somebody else's settings (`persistence-routes.test.ts` caught exactly that,
 * reading a `selectedContext` no test of its own had set).
 *
 * Deliberately not "the analysis cache" alone: the guarantee is a clean state,
 * the way a test gets a clean browser, so it covers every namespace the store
 * keeps.
 *
 * **Nothing here imports the application.** `local-store.ts` resolves the data
 * directory once, when it is imported, and several test files point it at a
 * directory of their own by setting `VEXEL_DATA_DIR` before importing the
 * routes they exercise. A helper that pulled the store in would resolve that
 * directory first and freeze it, and those files would then read and write a
 * directory they did not choose — silently: `console-routes.test.ts` asserts a
 * credential never reached its history file, and a history file that is never
 * written passes that assertion while proving nothing. So the directory is read
 * from the environment at the moment the hook runs, and emptied with plain
 * filesystem calls.
 *
 * Removing the files is a state the store already knows how to read: it
 * re-reads each namespace on every call and falls back to the defaults when the
 * file is missing, and recreates the cache directory on demand. The **directory
 * itself** is never removed — that one it resolves once, and a path that stops
 * existing is not a state it knows how to read.
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Where the daemon-backed passes keep the application's data, and never the
 * operator's own `~/.vexel`. The same path the `test:api` and
 * `test:reset-data-dir` scripts name.
 */
export const RUN_DATA_DIR = join(tmpdir(), "vexel-server-test-data");

/** The namespace files `local-store.ts` writes that hold no artifacts of their own. */
const NAMESPACE_FILES = ["preferences.json", "console-history.json"];
/** The analysis cache's index, and the directory of artifacts it points at. */
const CACHE_INDEX_FILE = "analysis-cache-index.json";
const CACHE_DIR = "analysis-cache";

/** Removes the stored namespaces from a data directory, leaving the directory itself in place. */
export function emptyStoredNamespaces(dataDir: string): void {
  for (const file of NAMESPACE_FILES) {
    rmSync(join(dataDir, file), { force: true });
  }
}

/** The same, plus the analysis cache: its index and every artifact the index pointed at. */
export function emptyDataDirContents(dataDir: string): void {
  emptyStoredNamespaces(dataDir);
  rmSync(join(dataDir, CACHE_INDEX_FILE), { force: true });
  rmSync(join(dataDir, CACHE_DIR), { recursive: true, force: true });
  mkdirSync(join(dataDir, CACHE_DIR), { recursive: true });
}
