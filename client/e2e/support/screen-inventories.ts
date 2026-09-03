/**
 * **The inventories a screen is filled from, arranged in the browser** — the
 * builders and their build cache, the contexts, both plugin inventories, and the
 * repositories a registry is browsed for. The four the server holds are delivered
 * on the live channel, which is where the client reads them from; the
 * repositories, which it does not hold, are still answered at their endpoint.
 *
 * Written by batch 2 of
 * `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table`
 * inside its own criteria file, and **moved here unchanged by batch 4**, whose
 * product-wide sweep (`INT-4`) walks the same screens and owes the same rows. A
 * fixture copied into a second file is a fixture that will one day be two, and
 * the sweep's whole claim is that it measures the lists the other checks
 * measure — which is only true if the screens hold the same rows.
 *
 * **Why these are stubs and the reference lists are not.** A daemon will not
 * produce a builder whose endpoint is its own name or a managed plugin on
 * demand, and obtaining either would move state on the operator's own machine
 * (`docker plugin ls` is host-wide and no label can scope it). The repositories
 * list is stubbed for the reason `registries-row-geometry.spec.ts` records: the
 * only registry every machine has configured is the public index, and no test in
 * this suite reaches it (CLAUDE.md, "No test reaches Docker Hub").
 *
 * Only the **readings** are answered. Every mutation on the same paths — a
 * builder created or removed, a context switched, a plugin enabled or installed
 * — is refused outright rather than passed on, so no stub can ever be mistaken
 * for a command that reached the operator's own daemon, and no assertion
 * depends on one having.
 */
import type { Page, Route } from '@playwright/test';
import { overridePushedValues } from './pushed-values.js';

/**
 * Three builders and three cache records, differing in every value whose
 * presence used to decide a row's height: a reported cache size and one the
 * builder did not report, a long platform list and none at all, a recorded build
 * step and none.
 */
export const BUILDERS = [
  {
    name: 'vexel-e2e-desktop',
    driver: 'docker',
    endpoint: 'vexel-e2e-desktop',
    platforms: ['linux/amd64', 'linux/amd64/v2', 'linux/arm64', 'linux/ppc64le'],
    status: 'running',
    active: true,
  },
  {
    name: 'vexel-e2e-multiarch',
    driver: 'docker-container',
    endpoint: 'tcp://build01.internal.example.test:1234',
    platforms: ['linux/amd64', 'linux/arm64'],
    status: 'running',
    active: false,
    cacheBytes: 16_148_070,
  },
  {
    name: 'vexel-e2e-remote',
    driver: 'remote',
    endpoint: 'tcp://build02.internal.example.test:1234',
    platforms: [],
    status: 'inactive',
    active: false,
  },
];

export const CACHE_RECORDS = [
  {
    id: 'sha256:00e2e0123456789abcdef0123456789abcdef0123456789abcdef0123456789a',
    type: 'regular',
    sizeBytes: 5_242_880,
    usageState: 'reclaimable' as const,
    description: 'RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund && npm run build --workspace client',
  },
  { id: 'sha256:01e2e0123456789abcdef0123456789abcdef0123456789abcdef0123456789b', type: 'source.local', sizeBytes: 1_048_576, usageState: 'shared' as const },
  {
    id: 'sha256:02e2e0123456789abcdef0123456789abcdef0123456789abcdef0123456789c',
    type: 'exec.cachemount',
    sizeBytes: 12_582_912,
    usageState: 'in-use' as const,
    description: 'RUN apk add --no-cache ca-certificates',
  },
];

/** Three contexts: the active one, one carrying a description and one carrying none. */
export const CONTEXTS = [
  {
    name: 'vexel-e2e-active',
    endpoint: 'unix:///var/run/docker.sock',
    kind: 'local' as const,
    tls: false,
    active: true,
    description: 'the stubbed context in use',
  },
  {
    name: 'vexel-e2e-remote-prod',
    endpoint: `ssh://operator@build-host-${'x'.repeat(40)}.example.invalid`,
    kind: 'ssh' as const,
    tls: true,
    active: false,
    description: 'a stubbed context carrying a description',
  },
  {
    name: 'vexel-e2e-bare',
    endpoint: `ssh://operator@another-host-${'y'.repeat(30)}.example.invalid`,
    kind: 'ssh' as const,
    tls: false,
    active: false,
  },
];

/**
 * Fifteen CLI plugins — the shape a stock installation ships, and **enough rows
 * to make the list scroll inside its own `60vh` cap**, which is the state the
 * named case is read in. One of them is refused, so the `WHY UNAVAILABLE` column
 * carries a value and not only its `–`.
 */
export const CLI_PLUGINS = [
  { name: 'buildx', command: 'docker buildx', version: 'v0.36.0-desktop.1', availability: 'enabled' as const },
  { name: 'compose', command: 'docker compose', version: 'v2.40.0', availability: 'enabled' as const },
  { name: 'ai', command: 'docker ai', version: 'v1.9.4', availability: 'available' as const },
  { name: 'cloud', command: 'docker cloud', version: 'v0.3.2', availability: 'available' as const },
  { name: 'debug', command: 'docker debug', version: 'v0.0.42', availability: 'enabled' as const },
  { name: 'desktop', command: 'docker desktop', version: 'v0.1.9', availability: 'enabled' as const },
  { name: 'dev', command: 'docker dev', version: 'v0.1.2', availability: 'available' as const },
  { name: 'extension', command: 'docker extension', version: 'v0.2.27', availability: 'enabled' as const },
  { name: 'feedback', command: 'docker feedback', version: 'v1.0.0-beta.14', availability: 'available' as const },
  { name: 'init', command: 'docker init', version: 'v1.4.0', availability: 'enabled' as const },
  { name: 'mcp', command: 'docker mcp', version: 'v0.24.0-desktop.2', availability: 'available' as const },
  { name: 'model', command: 'docker model', version: 'v0.1.44', availability: 'enabled' as const },
  { name: 'sbom', command: 'docker sbom', version: '0.6.1', availability: 'enabled' as const },
  { name: 'scout', command: 'docker scout', version: 'v1.18.3', availability: 'enabled' as const },
  {
    name: 'refused',
    command: 'docker refused',
    availability: 'unavailable' as const,
    unavailableReason: 'accessing plugin /usr/local/lib/docker/cli-plugins/docker-refused: permission denied',
  },
];

export const DAEMON_PLUGINS = [
  {
    id: 'vexel-e2e-plugin-described',
    name: 'localhost:41234/vexel-e2e-classic-plugin:v1',
    reference: 'localhost:41234/vexel-e2e-classic-plugin:v1',
    enabled: false,
    interfaceTypes: ['docker.volumedriver/1.0'],
    type: 'volume driver',
    description: 'a stubbed reading of a volume driver, carrying a description of its own',
  },
  { id: 'vexel-e2e-plugin-bare', name: 'loki:latest', enabled: true, interfaceTypes: ['docker.logdriver/1.0'], type: 'log driver' },
  {
    id: 'vexel-e2e-plugin-network',
    name: 'weaveworks/net-plugin:latest_release',
    enabled: false,
    interfaceTypes: ['docker.networkdriver/1.0'],
    type: 'network driver',
    description: 'a stubbed reading of a network driver',
  },
];

/**
 * Answers the four inventories in the page, leaving the daemon untouched.
 *
 * Only the **readings** are answered. Every mutation on the same paths — a
 * builder created or removed, a context switched, a plugin enabled or installed
 * — is refused outright rather than passed on, so no stub can ever be mistaken
 * for a command that reached the operator's own daemon, and no assertion here
 * depends on one having.
 */
export async function stubTheInventories(page: Page): Promise<void> {
  const readOnly = async (route: Route, json: unknown) => {
    if (route.request().method() !== 'GET') return route.abort();
    await route.fulfill({ json });
  };

  // The four inventories are values the server holds, and the live channel is the client's only
  // source for one of them
  // (plan-docker_management_app-refresh_cache-client_event_refresh_removal-multiplexed_sse/REQ-39),
  // so they are delivered there instead of being answered at their endpoints — which is what a stub
  // on an endpoint used to be, and nothing else about it changes (`support/pushed-values.ts`).
  await overridePushedValues(page, {
    builders: BUILDERS,
    'build-cache': CACHE_RECORDS,
    contexts: CONTEXTS,
    plugins: { cli: { items: CLI_PLUGINS }, daemon: { items: DAEMON_PLUGINS } },
  });

  await page.route('**/api/builders/cache/*/usage', (route) =>
    readOnly(route, {
      record: CACHE_RECORDS[0],
      references: [],
      unavailableReason: 'NoMatchingImage',
      unavailableDetail: 'No local image carries this build step.',
    }),
  );
  await page.route('**/api/builders/**', (route) => (route.request().method() === 'GET' ? route.fallback() : route.abort()));

  await page.route('**/api/contexts/*/use', (route) => route.abort());

  await page.route('**/api/plugins/inspect*', (route) =>
    readOnly(route, {
      ...DAEMON_PLUGINS[0],
      documentation: 'https://docs.docker.com/engine/extend/',
      mounts: ['/var/lib/docker/plugins/state → /mnt/state'],
      devices: ['/dev/fuse'],
      capabilities: ['CAP_SYS_ADMIN'],
      env: [],
      raw: { Id: 'vexel-e2e-plugin-described', Name: DAEMON_PLUGINS[0].name, Enabled: false },
    }),
  );
  // The switch REQ-36 drives: answered in the page, so the gesture is real and
  // nothing on the daemon is asked to change.
  await page.route('**/api/plugins/enable', async (route) => {
    await route.fulfill({ json: { ...DAEMON_PLUGINS[0], enabled: true } });
  });
  await page.route('**/api/plugins/disable', async (route) => {
    await route.fulfill({ json: { ...DAEMON_PLUGINS[1], enabled: false } });
  });
}

/**
 * The stub the repositories list is filled from: **no test reaches Docker Hub.**
 *
 * Moved here from batch 1's criteria file for the same reason as the four above:
 * the sweep browses the same list, and two definitions of the same two rows
 * would drift.
 */
export async function stubRepositories(page: Page): Promise<void> {
  await page.route('**/api/registries/repositories*', async (route) => {
    await route.fulfill({
      json: [
        { name: 'library/vexel-e2e', description: 'a stubbed repository, so this list has rows', pullCount: 1_800_000_000 },
        { name: 'myorg/vexel-e2e-plain', description: 'a second one, so two rows have a junction', pullCount: 48_000 },
      ],
    });
  });
  await page.route('**/api/registries/tags*', async (route) => {
    await route.fulfill({ json: [{ name: '1.0', sizeBytes: 5_242_880, pullReference: 'docker.io/library/vexel-e2e:1.0' }] });
  });
}
