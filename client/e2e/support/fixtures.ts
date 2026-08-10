import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { execFileAsync } from '../../../server/test/support/docker-cli.js';

/**
 * Where the server under test keeps its preferences and analysis cache during an
 * e2e run — never the operator's own `~/.vexel`. `global-setup.ts` wipes it
 * before the run and `playwright.config.ts` hands it to the server process, so a
 * spec can neither inherit the last run's state nor disturb the real one.
 */
export const E2E_DATA_DIR = join(tmpdir(), 'vexel-e2e-data');

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

/**
 * Opens the application on a known screen instead of whichever one the server
 * has persisted.
 *
 * The last active screen survives a reload by design (REQ-115), so a spec that
 * simply navigates to `/` lands wherever the previous test left the application
 * — inside the same file as much as across files. Pinning the preference first
 * makes the starting state the spec's own. `null` selects the default landing
 * screen.
 *
 * Two details are what make the pin actually hold:
 *
 * - **The page is left before the pin is written.** Every screen switch the
 *   application makes persists itself, and that write is fired and not awaited
 *   by the browser. A page still showing the application can therefore have a
 *   `lastScreenId` of its own in flight, which would land on top of the pin.
 *   Navigating away first means there is no such writer left.
 * - **The pin is read back after the load, and the whole sequence is retried if
 *   it did not survive.** A write already on the wire when the page was left can
 *   still reach the server; the read-back is what tells a pin that held from one
 *   that was overtaken, instead of leaving the spec to fail later on a locator
 *   that says nothing about why.
 */
export async function openApp(page: Page, screenId: string | null = null): Promise<void> {
  await expect(async () => {
    await page.goto('about:blank');
    await page.request.put('/api/persistence/preferences', { data: { lastScreenId: screenId } });
    await page.goto('/');
    const stored = (await (await page.request.get('/api/persistence/preferences')).json()) as { lastScreenId?: string | null };
    expect(stored.lastScreenId ?? null, 'a screen the application persisted overtook the pinned one').toBe(screenId);
  }).toPass({ timeout: 30_000 });
}

/**
 * A screen's own entry in the navigation rail.
 *
 * Scoped to the rail on purpose: the landing screen is the Dashboard, whose
 * cross-navigation tiles name the same screens ("Running containers — open the
 * Containers screen"), so an unscoped locator matches several controls.
 */
export function navEntry(page: Page, label: string): Locator {
  return page.getByRole('navigation').getByRole('button', { name: new RegExp(label) });
}

/**
 * The endpoint kind of a context, derived from its endpoint URL exactly as
 * `contexts/specs/contexts-service.md` states: `ssh` for `ssh://`, `tcp` for
 * `tcp://`/`http://`/`https://`, `local` for anything else.
 */
function contextKind(endpoint: string): string {
  if (endpoint.startsWith('ssh://')) return 'ssh';
  if (/^(tcp|http|https):\/\//.test(endpoint)) return 'tcp';
  return 'local';
}

/**
 * How the shell's footer names the context currently in use, `name (kind)`
 * (app-shell/specs/shell.md).
 *
 * The active context is the operator's own Docker configuration, not something a
 * test may assume: on one machine it is `default`, on another `desktop-linux` or
 * a remote one. The expected label is therefore asked of Docker itself — the same
 * source the application reads — instead of being written into the assertion.
 */
export async function activeContextLabel(): Promise<string> {
  const { stdout: shown } = await execFileAsync('docker', ['context', 'show']);
  const name = shown.trim();
  const { stdout: host } = await execFileAsync('docker', [
    'context',
    'inspect',
    name,
    '--format',
    '{{.Endpoints.docker.Host}}',
  ]);
  return `${name} (${contextKind(host.trim())})`;
}

/**
 * The anonymous volumes currently on the daemon. Docker creates one per
 * container for every `VOLUME` an image declares, labels it as anonymous and
 * carries no label of ours, so it cannot be recognised by ownership.
 *
 * Paired with {@link removeAnonymousVolumesSince}, this lets a spec remove the
 * orphans its own fixtures produced without ever touching one that was already
 * there.
 */
export async function anonymousVolumes(): Promise<string[]> {
  const { stdout } = await execFileAsync('docker', [
    'volume',
    'ls',
    '-q',
    '--filter',
    'label=com.docker.volume.anonymous',
  ]).catch(() => ({ stdout: '' }));
  return stdout.split('\n').filter((id) => id.length > 0);
}

/**
 * Removes the anonymous volumes that appeared since `before` was taken.
 *
 * Needed where the application recreates a container: the recreate deliberately
 * keeps the replaced container's volumes, so that editing an environment
 * variable never destroys the data a volume holds. That is the right product
 * behaviour, which makes the orphan the test's to clean up rather than the
 * product's. A volume still in use refuses removal and is left alone.
 */
export async function removeAnonymousVolumesSince(before: string[]): Promise<void> {
  const known = new Set(before);
  const created = (await anonymousVolumes()).filter((id) => !known.has(id));
  for (const id of created) {
    await execFileAsync('docker', ['volume', 'rm', id]).catch(() => undefined);
  }
}
