/**
 * Points the application's data directory at the run's own, before anything can
 * read it.
 *
 * `local-store.ts` resolves `VEXEL_DATA_DIR` **once, when it is imported**, and
 * falls back to the operator's `~/.vexel`. The npm scripts set it, so a whole
 * pass is safe; a test file run directly was not, and wrote to the operator's
 * real preferences and analysis cache. That was tolerable while nothing emptied
 * anything. It is not tolerable now that every test starts by clearing what it
 * finds — so this settles the question before it can be asked, rather than
 * leaving a reset pointed at a directory that might be somebody's own.
 *
 * Its own module, and the first import of the preload, because import order is
 * the whole point: a module that pulls in the store before this has run has
 * already resolved the wrong directory.
 */
import { mkdirSync } from "node:fs";
import { RUN_DATA_DIR } from "./run-data-dir.js";

process.env.VEXEL_DATA_DIR ??= RUN_DATA_DIR;
mkdirSync(process.env.VEXEL_DATA_DIR, { recursive: true });
