/**
 * How a test object says it belongs to this run.
 *
 * Split out of `fixtures.ts` so that `base-images.ts` can stamp the images it
 * builds without importing the module that imports it: a cycle between the two
 * would leave whichever one is loaded first reading the other's constants before
 * they exist. Nothing here knows what a fixture is, which is exactly why both
 * sides can depend on it.
 */

/** Label every fixture carries, so a run can recognise — and only ever remove — its own objects. */
export const OWNER_LABEL = "vexel.test.run";
/** Label naming the test case a fixture belongs to, for diagnosing leftovers. */
export const CASE_LABEL = "vexel.test.case";

/**
 * Identifies this test process. Node runs test files in separate processes, so
 * the pid alone is not unique across a rerun; the timestamp disambiguates.
 */
export const RUN_ID = `${process.pid}-${Date.now()}`;

/**
 * `docker run` / `docker create` / `docker build` arguments stamping an object
 * as belonging to this run and to the given case. Spread into any command that
 * creates something, so the sweep can recognise it later.
 */
export function ownershipArgs(caseName: string): string[] {
  return ["--label", `${OWNER_LABEL}=${RUN_ID}`, "--label", `${CASE_LABEL}=${caseName}`];
}
