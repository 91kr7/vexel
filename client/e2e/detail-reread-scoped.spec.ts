/**
 * **A detail view reads again only for the object it shows** —
 * `plan-docker_management_app-refresh_cache`, REQ-7 and REQ-8, the check INT-6 of
 * `batch-detail-reread-scoped` asks for.
 *
 * What is measured, and why in this shape:
 *
 * - **the absence of a read** (REQ-7) is a claim about what the browser asked the server, not about
 *   what is on screen: a re-read of the same container puts the same values back, so no content
 *   assertion can tell one apart from none at all. The requests are therefore counted at the browser,
 *   by the pathname of the inspect endpoint the detail itself calls.
 * - **the negative half is worthless on a dead channel**, so the positive half runs in the same test,
 *   over the same open detail and the same event connection: acting on the shown container must read
 *   it again and move what is on screen. An event channel that never delivered would fail there.
 * - **the detail did not move** is a claim about coordinates (CLAUDE.md): the dialog's viewport box
 *   is read before and after, beside what it says, rather than instead of it.
 * - the detail is opened with a **real pointer at each visible control's coordinates**, through the
 *   card's own control and the tab's own box.
 *
 * The readings come from the Inspect tab, whose values are the inspect payload the hook fetches —
 * the dialog's header states the container as the *list* last carried it, which would move on a list
 * re-read and prove nothing about the detail.
 *
 * Every fixture carries the ownership labels, comes from the suite's own images and is removed with
 * `docker rm -fv` in a `finally`. Nothing is asserted about the operator's own daemon: the list is
 * narrowed to this spec's fixtures and each one is searched for by name.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { boxOf, clickAtItsCentre, type Rect } from './support/settled.js';
import { containerCard, containerDetail, openContainerDetail } from './support/container-cards.js';

const RUN_ID = `${process.pid}-${Date.now()}`;

async function createSleepingContainer(name: string, extraArgs: string[] = []): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), ...extraArgs, '--entrypoint', 'sleep', ALPINE_IMAGE, '300']);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

async function removeVolumeQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['volume', 'rm', '-f', name]).catch(() => undefined);
}

async function idOf(name: string): Promise<string> {
  return (await execFileAsync('docker', ['inspect', '-f', '{{.Id}}', name])).stdout.trim();
}

/** Two identifiers name one container when one is the daemon's truncation of the other. */
function namesOneContainer(one: string, other: string): boolean {
  return one === other || one.startsWith(other) || other.startsWith(one);
}

/**
 * Every read of a container's inspect endpoint the browser issues, as it issues them — the endpoint
 * `useContainerDetail` calls, and the only thing that says whether the daemon was asked at all.
 */
function recordInspectReads(page: Page): string[] {
  const reads: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') return;
    const found = /^\/api\/containers\/([^/]+)\/inspect$/.exec(new URL(request.url()).pathname);
    if (found) reads.push(decodeURIComponent(found[1]));
  });
  return reads;
}

/** Opens the containers screen narrowed to this spec's own fixtures, whatever else the daemon holds. */
async function openContainersNarrowedTo(page: Page, term: string): Promise<void> {
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder('Search name, image or state…').fill(term);
}

/** The detail's Inspect tab, reached by a real pointer at the tab's own box. */
async function openInspectTab(page: Page): Promise<Locator> {
  const detail = containerDetail(page);
  await clickAtItsCentre(page, detail.getByRole('tab', { name: 'Inspect', exact: true }), 'the Inspect tab');
  await expect(detail.getByLabel('Find in payload'), 'the Inspect tab draws no find control').toBeVisible({ timeout: 20_000 });
  return detail;
}

/**
 * `State › Status` as the Inspect tab draws it — a value of the inspect payload itself, so it moves
 * only when the detail has read the container again. The `State` section is open on entry.
 */
async function drawnStatus(page: Page): Promise<string> {
  const section = containerDetail(page)
    .locator('.ui-payload-sections > .ui-collapsible-section')
    .filter({ has: page.locator('.ui-collapsible-section__title', { hasText: /^State$/ }) })
    .first();
  await expect(section, 'the Inspect tab draws no State section').toBeVisible({ timeout: 20_000 });
  const band = section
    .locator('.ui-payload-band')
    .filter({ has: page.locator('.ui-payload-band__label', { hasText: /^Status$/ }) })
    .first();
  await expect(band, 'the State section carries no Status band').toBeVisible({ timeout: 20_000 });
  return ((await band.locator('.ui-payload-band__value').first().textContent()) ?? '').trim();
}

/** The name the dialog's header states, for a check whose subject is which container is shown. */
async function shownName(page: Page): Promise<string> {
  return ((await containerDetail(page).locator('.ui-section-header__title').first().textContent()) ?? '').trim();
}

function boxesMatch(before: Rect, after: Rect): boolean {
  return before.x === after.x && before.y === after.y && before.width === after.width && before.height === after.height;
}

// plan-docker_management_app-refresh_cache/REQ-7, REQ-8 — batch-detail-reread-scoped INT-6 and its
// first two acceptance scenarios: another container's activity leaves the open detail alone, and the
// shown container's own activity still reaches it at once.
test('leaves an open container detail unread for another container, and still reads it for its own', async ({ page }) => {
  const shown = `vexel-e2e-scoped-shown-${RUN_ID}`;
  const other = `vexel-e2e-scoped-other-${RUN_ID}`;
  const inspectReads = recordInspectReads(page);
  try {
    await createSleepingContainer(shown);
    await createSleepingContainer(other);
    await execFileAsync('docker', ['stop', other]);
    const shownId = await idOf(shown);
    const readsOfShown = () => inspectReads.filter((id) => namesOneContainer(id, shownId));

    await openContainersNarrowedTo(page, `vexel-e2e-scoped-`);
    await expect(containerCard(page, shown), 'the shown fixture never appeared in the list').toBeVisible({ timeout: 20_000 });
    await openContainerDetail(page, shown);
    await openInspectTab(page);
    expect(await drawnStatus(page), 'the detail did not open on a running container').toBe('running');

    const boxBefore = await boxOf(containerDetail(page), 'the container detail dialog');
    const readsBefore = readsOfShown().length;

    // The other container is started and then stopped: two lifecycle events of the same kind as the
    // shown container's own, and none of them about it.
    await execFileAsync('docker', ['start', other]);
    await expect(containerCard(page, other), 'the other container never came up on screen').toContainText('RUNNING', { timeout: 20_000 });
    await execFileAsync('docker', ['stop', other]);
    await expect(containerCard(page, other), 'the other container never went down on screen').toContainText('EXITED', { timeout: 20_000 });

    // REQ-7 — the daemon is not asked about the shown container.
    expect(readsOfShown().length - readsBefore, `the open detail was read again for another container's events: ${readsOfShown().slice(readsBefore).join(', ')}`).toBe(0);
    // …and the view did not change: the same container, saying the same thing, in the same place.
    expect(await shownName(page)).toBe(shown);
    expect(await drawnStatus(page), 'the open detail stopped showing what it was opened on').toBe('running');
    const boxAfter = await boxOf(containerDetail(page), 'the container detail dialog');
    expect(boxesMatch(boxBefore, boxAfter), `the dialog moved from ${JSON.stringify(boxBefore)} to ${JSON.stringify(boxAfter)}`).toBe(true);
    expect(boxAfter.y, 'the dialog was carried above the top of the viewport').toBeGreaterThanOrEqual(0);

    // REQ-8 — the shown container's own event still reaches it, over this very connection.
    await execFileAsync('docker', ['stop', shown]);
    await expect.poll(() => drawnStatus(page), { timeout: 20_000, message: 'the open detail never showed the shown container stopped' }).toBe('exited');
    expect(readsOfShown().length, 'the detail showed the new state without reading the container again').toBeGreaterThan(readsBefore);
    expect(await shownName(page)).toBe(shown);
    const boxAtEnd = await boxOf(containerDetail(page), 'the container detail dialog');
    expect(boxAtEnd.y, 'the dialog was carried above the top of the viewport').toBeGreaterThanOrEqual(0);
  } finally {
    await removeContainerQuietly(shown);
    await removeContainerQuietly(other);
  }
});

// plan-docker_management_app-refresh_cache/REQ-8 — batch-detail-reread-scoped, third acceptance
// scenario: a volume's detail still follows the containers that mount it, whichever container the
// event is about.
test('keeps a volume detail following the containers that mount it', async ({ page }) => {
  const volume = `vexel-e2e-scoped-vol-${RUN_ID}`;
  const mounter = `vexel-e2e-scoped-mounter-${RUN_ID}`;
  try {
    await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(volume), volume]);
    await createSleepingContainer(mounter, ['-v', `${volume}:/data`]);

    await openApp(page, 'volumes-networks');
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible({ timeout: 20_000 });
    const panel = page
      .locator('.ui-stack, .ui-surface')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Volumes' }) })
      .filter({ has: page.locator('.ui-data-table') })
      .last();
    const row = panel.locator('.ui-data-table__row', { hasText: volume });
    await expect(row, 'the fixture volume never appeared in the list').toBeVisible({ timeout: 20_000 });

    // A real pointer on the row's own first cell: the action cluster at the row's trailing edge is
    // not the gesture that reveals the detail.
    await clickAtItsCentre(page, row.locator('.ui-data-table__cell').first(), `the first cell of the row of ${volume}`);
    const detail = panel.locator('.ui-detail-panel');
    await expect(detail).toBeVisible({ timeout: 20_000 });
    await expect(detail, 'the volume detail never listed the container mounting it').toContainText(mounter, { timeout: 20_000 });
    const boxBefore = await boxOf(detail, 'the volume detail panel');

    await removeContainerQuietly(mounter);

    await expect(detail, 'the volume detail kept listing a container that no longer exists').not.toContainText(mounter, { timeout: 20_000 });
    const boxAfter = await boxOf(detail, 'the volume detail panel');
    expect(boxAfter.x, 'the volume detail moved sideways while following the change').toBe(boxBefore.x);
    expect(boxAfter.y, 'the volume detail was carried above the top of the viewport').toBeGreaterThanOrEqual(0);
  } finally {
    await removeContainerQuietly(mounter);
    await removeVolumeQuietly(volume);
  }
});
