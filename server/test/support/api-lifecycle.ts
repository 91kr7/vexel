/**
 * Everything that runs around a **daemon-backed server test**, in one place —
 * the counterpart of `client/e2e/support/lifecycle.ts`, for `node --test`.
 *
 * Preloaded with `--import` by `test:api` rather than imported by each file, so
 * no new file can forget it, and it covers two moments:
 *
 * - **before every file**, the daemon is emptied and re-established
 *   ({@link resetDaemon}). `node --test` runs each file in a process of its own,
 *   so a preload evaluated once per process is evaluated once per file;
 * - **before every test**, the application's own state is cleared — the data
 *   directory and the refresh cache.
 *
 * The daemon reset is at **module scope, deliberately, and not in a `before()`
 * hook**. A root `before()` starts ahead of the test file's module scope but
 * does not block it: measured, the hook and the module scope run concurrently.
 * Thirty-two files under `test/api/` ensure the images they need with a
 * top-level `await ensureImages(...)`, so a hook would be pruning images while
 * the file was preparing them. A preload's top-level await does block the entry
 * module, which is the ordering this needs and the only one that is safe.
 *
 * The reset takes as long as it takes: module evaluation is not a test, so no
 * per-test budget applies to it, and the deadlines that bound it are the ones on
 * the docker commands themselves.
 *
 * `run-data-dir-env.ts` stays a module of its own and stays the **first import
 * here**, and that is a constraint rather than a preference: ESM evaluates every
 * import before any statement of this file, so pointing `VEXEL_DATA_DIR` at the
 * run's own directory cannot be done in this body — it has to be done by a
 * module that comes first in import order.
 */
import "./run-data-dir-env.js";
import { beforeEach } from "node:test";
import { resetDaemon } from "./lifecycle.js";
import { RUN_DATA_DIR, emptyDataDirContents } from "./run-data-dir.js";

await resetDaemon();

beforeEach(async () => {
  emptyDataDirContents(process.env.VEXEL_DATA_DIR ?? RUN_DATA_DIR);
  // The refresh cache is server state that outlives a test exactly as the data
  // directory does: a list endpoint answers from what an earlier test's request
  // put there, so a fixture created after that request is invisible to the test
  // that made it. Imported inside the hook, never at module scope, so this file
  // still pulls in nothing of the application before a test file has chosen its
  // own data directory.
  const { resetRefreshCache } = await import("../../src/refresh-cache/refresh-cache.js");
  resetRefreshCache();
});
