/** Label every e2e fixture carries, so a run can recognise — and only ever remove — its own objects. */
export const OWNER_LABEL = 'vexel.test.run';
/** Label naming the spec a fixture belongs to, for diagnosing leftovers. */
export const CASE_LABEL = 'vexel.test.case';

/**
 * Identifies this Playwright run. Workers are separate processes, so the pid
 * alone is not unique across a rerun; the timestamp disambiguates.
 */
export const RUN_ID = `${process.pid}-${Date.now()}`;

/**
 * `docker run` / `docker create` arguments stamping a fixture as belonging to
 * this run and to the given case, so the sweep can recognise it later.
 */
export function ownershipArgs(caseName: string): string[] {
  return ['--label', `${OWNER_LABEL}=${RUN_ID}`, '--label', `${CASE_LABEL}=${caseName}`];
}
