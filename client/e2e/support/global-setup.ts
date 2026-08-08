/**
 * Runs once, before any spec.
 *
 * Two jobs, both of them about starting from a known state instead of inheriting
 * whatever the previous run left:
 *
 * 1. **Base images.** The suite builds its fixtures on three deliberately small
 *    images. Pulling them here, once, keeps a cold daemon from spending a spec's
 *    own time budget on a network pull — a failure that says nothing about the
 *    product. They are shared infrastructure, not fixtures: no spec removes them.
 * 2. **The application's own store.** The server persists preferences and the
 *    analysis cache under `VEXEL_DATA_DIR`. Wiping that directory here is what
 *    makes a run independent of every run before it; `playwright.config.ts`
 *    points the server at it.
 */
import { execFile } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { promisify } from 'node:util';
import { E2E_DATA_DIR } from './fixtures.js';

const execFileAsync = promisify(execFile);

/**
 * Images every fixture is built on. Kept small on purpose: `alpine:3.20` stands
 * in wherever a spec only needs a container that stays up, and it declares no
 * `VOLUME`, so no anonymous volume can outlive a fixture. `registry:2` is the
 * multi-layer, registry-pulled image the layer analyses need; `hello-world` the
 * single-layer one.
 */
const BASE_IMAGES = ['alpine:3.20', 'registry:2', 'hello-world:latest'];

async function ensureImage(reference: string): Promise<void> {
  const present = await execFileAsync('docker', ['image', 'inspect', reference])
    .then(() => true)
    .catch(() => false);
  if (present) return;
  // A registry hiccup is worth one retry: the alternative is every spec that
  // needs the image failing for a reason that has nothing to do with the code.
  await execFileAsync('docker', ['pull', '-q', reference]).catch(async () => {
    await execFileAsync('docker', ['pull', '-q', reference]);
  });
}

export default async function globalSetup(): Promise<void> {
  // Playwright starts the web servers before this hook, and the server creates
  // its data directory on import: emptying it is therefore not enough — the
  // directory itself has to be put back, or every write lands on a path that no
  // longer exists.
  rmSync(E2E_DATA_DIR, { recursive: true, force: true });
  mkdirSync(E2E_DATA_DIR, { recursive: true });
  for (const reference of BASE_IMAGES) {
    await ensureImage(reference);
  }
}
