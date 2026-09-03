/**
 * Everything that runs around an end-to-end **file** and around a **run**, in
 * one place. Two moments, and they are the whole list:
 *
 * - **before every file** — `cleanDaemonBeforeAll()`, at the top of every spec;
 * - **after the whole run** — the default export, which `playwright.config.ts`
 *   names as its `globalTeardown`.
 *
 * There is no `globalSetup` and there is deliberately nothing to add one for:
 * what a hook could have prepared once, before the first spec, would describe a
 * state no spec was entitled to assume by the second. The third moment, before
 * every **test**, is the application's own state and lives in `test.ts`, because
 * it is a Playwright fixture and shares nothing with these two.
 *
 * The work itself is `server/test/support/lifecycle.ts`, which serves both test
 * trees; this file is only the Playwright wiring.
 */
import { test } from './test.js';
import { resetDaemon, stopSharedRegistry } from '../../../server/test/support/lifecycle.js';

/**
 * What the reset hook may spend, against the 30s a test gets: the reset's own
 * removal deadline is 180s, and on a machine holding none of the base images the
 * first file of a run pays for fetching them — two pulls from Docker Hub at 300s
 * each. Ten minutes is what the `globalSetup` that used to do that work allowed,
 * and the work did not get smaller by moving.
 *
 * Declared on the hook rather than on the file, so no test's budget moves: the
 * reset is the state a file starts from, not a step of its first test.
 */
const CLEAN_DAEMON_BUDGET_MS = 600_000;

/**
 * Registers the daemon reset as this file's first `beforeAll` — once per file,
 * before that file's own fixtures are built and before the first `beforeEach`.
 *
 * The suite is serial and every file drives the same daemon, so without this a
 * file starts from whatever the file before it left standing, and fails later,
 * elsewhere, and differently depending on which files ran first. Calling it is
 * not left to memory: `scripts/check-clean-daemon-conformance.mjs` fails the
 * lint on a spec that does not, and on one that registers a hook ahead of it.
 *
 * **The reset is destructive to the machine it runs on** — see the module it
 * calls, which is where that decision is written down.
 */
export function cleanDaemonBeforeAll(): void {
  test.beforeAll(async () => {
    test.setTimeout(CLEAN_DAEMON_BUDGET_MS);
    await resetDaemon();
  });
}

/**
 * Runs once, after every spec of every project.
 *
 * The only thing a run leaves running is the throwaway registry the first file's
 * reset started: the specs that make the product pull an image need one that
 * outlives them all, and every reset after the first spares it for the same
 * reason. This is where it goes, so the run puts the machine back as it found
 * it.
 *
 * Nothing else needs a hook here. The data directory is empty at the start of
 * every test, so it never holds more than the test currently running put in it,
 * and the base images stay on purpose — they are shared infrastructure, and
 * removing them would only make the next run pay for them again.
 */
export default async function globalTeardown(): Promise<void> {
  await stopSharedRegistry();
}
