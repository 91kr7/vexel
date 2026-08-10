/**
 * Runs once, before any spec.
 *
 * Two jobs, both of them about starting from a known state instead of inheriting
 * whatever the previous run left:
 *
 * 1. **The images, and the registry they come from.** A run gets its images from
 *    a registry of its own, on this machine, so that no spec ever reaches Docker
 *    Hub: a registry exposed on the internet occasionally does not answer, and
 *    when it does not, the failure lands on whichever assertion happened to need
 *    an image. This hook runs the server workspace's own preparation commands —
 *    the same two the server passes chain, not a second implementation of them —
 *    so there is one definition and one behaviour whichever suite is running.
 *    What they set up is shared infrastructure, not fixtures: no spec removes it,
 *    and `global-teardown.ts` stops the registry once the whole run is over.
 * 2. **The application's own store.** The server persists preferences and the
 *    analysis cache under `VEXEL_DATA_DIR`. Wiping that directory here is what
 *    makes a run independent of every run before it; `playwright.config.ts`
 *    points the server at it, so the operator's own `~/.vexel` is neither read
 *    nor written by a run.
 *
 * Both hold in the arrangement the suite now drives: a single Express process,
 * built by the run itself and serving the built interface and the API on one
 * port (see `playwright.config.ts`). There is no dev server and no second
 * process to account for.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { E2E_DATA_DIR } from './fixtures.js';
import { execFileAsync } from '../../../server/test/support/docker-cli.js';

/** The workspace root, from which the workspace-scoped npm scripts are run. */
const REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export default async function globalSetup(): Promise<void> {
  // Playwright starts the web server before this hook, and the server creates
  // its data directory on import: emptying it is therefore not enough — the
  // directory itself has to be put back, or every write lands on a path that no
  // longer exists. As true of the built server as it was of the dev one; it
  // resolves the directory once, at import.
  rmSync(E2E_DATA_DIR, { recursive: true, force: true });
  mkdirSync(E2E_DATA_DIR, { recursive: true });

  for (const script of ['test:images', 'test:registry']) {
    // Ten minutes, not the default thirty seconds: on a machine that holds none
    // of these images this is the one step of a run that legitimately fetches
    // them, and a cold `moby/buildkit` alone is a hundred megabytes. It is still
    // a deadline — a run that cannot start must say so rather than hang.
    const { stdout } = await execFileAsync('npm', ['run', script, '-w', 'server'], {
      cwd: REPOSITORY_ROOT,
      timeout: 600_000,
    });
    process.stdout.write(stdout);
  }
}
