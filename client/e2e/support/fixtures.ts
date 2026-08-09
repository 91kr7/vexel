import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Page } from '@playwright/test';

const execFileAsync = promisify(execFile);

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
 */
export async function openApp(page: Page, screenId: string | null = null): Promise<void> {
  await page.request.put('/api/persistence/preferences', { data: { lastScreenId: screenId } });
  await page.goto('/');
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
