/**
 * Inserts a run of entries into the analysis cache of the data directory named
 * by `VEXEL_DATA_DIR`, then exits.
 *
 * Spawned by the cross-process half of `test/unit/analysis-cache-store.test.ts`:
 * the guarantee under test there — two processes sharing one data directory,
 * neither losing the other's entries — cannot be observed from inside a single
 * process, so it takes a second one.
 *
 * `startAtEpochMs` makes the overlap deliberate rather than lucky: both
 * children wait for the same instant before their first insert, so the runs
 * interleave whatever each one's startup cost happened to be.
 */
import { insert } from "../../src/persistence/analysis-cache-store.js";

const label = process.argv[2] ?? "child";
const count = Number(process.argv[3] ?? "20");
const sourcePath = process.argv[4] ?? "";
const startAtEpochMs = Number(process.argv[5] ?? "0");

const waitMs = startAtEpochMs - Date.now();
if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

for (let index = 0; index < count; index += 1) {
  await insert(`${label}:${index}`, sourcePath);
}
