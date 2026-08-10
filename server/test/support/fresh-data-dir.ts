/**
 * Every test starts from a clean application state — the way it starts with a
 * clean browser.
 *
 * Preloaded with `--import` by the daemon-backed passes rather than imported by
 * each test file, so no new file can forget it, and registered on the root suite
 * so it covers every test in the process.
 *
 * Cleared *before* each test, never after: a test that writes state and then
 * relies on it is contracting exactly that (a second extraction served from the
 * cache, a preference surviving a reload) and owns that state for its own
 * duration.
 *
 * The directory is read from the environment **inside** the hook, not captured
 * here: a test file that points the store at a directory of its own does so at
 * its own module scope, which runs after this. See `run-data-dir.ts` for why
 * nothing in this path may import the application.
 */
import "./run-data-dir-env.js";
import { beforeEach } from "node:test";
import { RUN_DATA_DIR, emptyDataDirContents } from "./run-data-dir.js";

beforeEach(() => {
  emptyDataDirContents(process.env.VEXEL_DATA_DIR ?? RUN_DATA_DIR);
});
