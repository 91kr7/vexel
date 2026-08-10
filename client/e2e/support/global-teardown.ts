/**
 * Runs once, after every spec of every project.
 *
 * The only thing a run leaves running is the throwaway registry `global-setup`
 * started: the specs that make the product pull an image need one that outlives
 * them all, so no spec may stop it. This is where it goes, so the run puts the
 * machine back as it found it.
 *
 * The data directory needs nothing here: every test starts with the analysis
 * cache empty, so it never holds more than the test currently running put in it.
 * The base images stay, deliberately — they are shared infrastructure and
 * removing them would only make the next run pay for them again.
 */
import { stopSharedRegistry } from '../../../server/test/support/base-images.js';

export default async function globalTeardown(): Promise<void> {
  await stopSharedRegistry();
}
