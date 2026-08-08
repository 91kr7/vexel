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
import { mkdirSync, rmSync } from 'node:fs';
import { E2E_DATA_DIR } from './fixtures.js';
// One definition of the base images and of "make sure they are there", shared
// with the server suite, which needs the same guarantee file by file. Kept small
// on purpose: `alpine:3.20` stands in wherever a spec only needs a container
// that stays up, and it declares no `VOLUME`, so no anonymous volume can outlive
// a fixture; `registry:2` is the multi-layer, registry-pulled image the layer
// analyses need; `hello-world` the single-layer one.
import { ensureBaseImages } from '../../../server/test/support/base-images.js';

export default async function globalSetup(): Promise<void> {
  // Playwright starts the web servers before this hook, and the server creates
  // its data directory on import: emptying it is therefore not enough — the
  // directory itself has to be put back, or every write lands on a path that no
  // longer exists.
  rmSync(E2E_DATA_DIR, { recursive: true, force: true });
  mkdirSync(E2E_DATA_DIR, { recursive: true });
  await ensureBaseImages();
}
