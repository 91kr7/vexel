/**
 * The refresh control, in the browser — INT-15 and INT-18 of
 * `batch-manual-refresh`
 * (plan-docker_management_app-refresh_cache-manual_refresh/REQ-1, REQ-11 to
 * REQ-15, and the batch's first, third and fifth acceptance scenarios).
 *
 * Three rules decide the shape of everything below.
 *
 * - **A real pointer at the visible control's own coordinates** (`CLAUDE.md`):
 *   every press here is `page.mouse.click()` at the control's settled centre,
 *   never `element.click()` and never a dispatched event.
 * - **"Finished" is asserted on the screen, not on the answer.** REQ-11 is the
 *   requirement this feature can fail silently on: a control that leaves its
 *   working state when the server answers satisfies every other clause and
 *   leaves the operator looking at the old list. So each case waits for the
 *   control to be **out of its busy state** and then reads the screen **once**,
 *   with no retry: a row that arrives on the next poll instead is a failure, and
 *   an assertion that retried for a few seconds could not tell the two apart.
 * - **Position is measured, not content** (`CLAUDE.md`): REQ-13's "does not reset
 *   scroll or selection" and REQ-15's "nothing else moved" are claims about
 *   viewport boxes, so boxes are what is read on both sides of the press. A
 *   surface carried out of the viewport keeps every character it had.
 *
 * Fixtures: contexts carry no label, so the name prefix is the only handle there
 * is and each is removed by the test that made it; the volumes carry the
 * ownership labels and are removed in a `finally`. Nothing is asserted about the
 * operator's own daemon — every row is searched for by its own name.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { navEntry, openApp, ownershipArgs } from './support/fixtures.js';
import { boxOf, boxesOf, clickAtItsCentre, twoFrames, type Rect } from './support/settled.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

const RUN_ID = `${process.pid}-${Date.now()}`;

/** How long a reload may take before the case is a failure rather than a slow machine. */
const RELOAD_BUDGET_MS = 30_000;

/** Half a pixel: below what any assertion here distinguishes, above float noise. */
const TOLERANCE_PX = 0.5;

function fixtureName(caseName: string): string {
  return `vexel-e2e-refresh-${caseName}-${RUN_ID}`;
}

async function removeContextQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['context', 'rm', '-f', name]).catch(() => undefined);
}

async function removeVolumeQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['volume', 'rm', '-f', name]).catch(() => undefined);
}

/**
 * Removes any context this file left behind, whatever the run: a spec killed by
 * its own timeout never reaches its `finally`, and a context carries no label.
 */
/** The top bar's refresh control — the header's own, on whichever screen is active. */
function refreshControl(page: Page): Locator {
  return page.locator('.ui-page-header').getByRole('button', { name: 'Refresh', exact: true });
}

function screenContent(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

/** One press, with a real pointer, waiting for the server's own answer to the request it makes. */
async function pressRefresh(page: Page): Promise<void> {
  const control = refreshControl(page);
  await expect(control, 'the header carries no operable refresh control').toBeEnabled();
  const answered = page.waitForResponse(
    (response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/refresh',
    { timeout: RELOAD_BUDGET_MS },
  );
  await clickAtItsCentre(page, control, 'the refresh control');
  const response = await answered;
  expect(response.status(), `the manual reload endpoint answered ${response.status()}`).toBe(200);
}

/**
 * Waits for the control to leave its working state — the moment the product
 * claims the reload has finished, and therefore the moment the screen is read.
 */
async function reloadFinished(page: Page): Promise<void> {
  await expect(refreshControl(page), 'the control never left its working state').not.toHaveAttribute('aria-busy', 'true', {
    timeout: RELOAD_BUDGET_MS,
  });
  // Two frames, so what is read is a laid-out screen and not a mid-commit one.
  // Far below the 3 s the client polls at, which is what this must not wait for.
  await twoFrames(page);
}

function sameBox(before: Rect, after: Rect): boolean {
  return (
    Math.abs(before.x - after.x) < TOLERANCE_PX &&
    Math.abs(before.y - after.y) < TOLERANCE_PX &&
    Math.abs(before.width - after.width) < TOLERANCE_PX &&
    Math.abs(before.height - after.height) < TOLERANCE_PX
  );
}

// REQ-1, REQ-7, REQ-11 — the batch's first acceptance scenario: a context created from a terminal is
// listed after one press, with the operator doing nothing else. The contexts kind has a 300 s period
// and no daemon event of its own, so nothing but the press can put the row on screen inside a test.
test('lists a context created from the terminal once the press has ended', async ({ page }) => {
  const name = fixtureName('listed');
  try {
    await openApp(page, 'contexts');
    await expect(page.getByRole('heading', { level: 1, name: 'Contexts' })).toBeVisible({ timeout: 20_000 });
    const row = screenContent(page).locator('.ui-data-table__row', { hasText: name });
    // The inventory is on screen before the fixture exists, so the list the press reloads is a list
    // that was read before the context was created.
    await expect(screenContent(page).locator('.ui-data-table__row').first()).toBeVisible({ timeout: 20_000 });

    await execFileAsync('docker', ['context', 'create', name, '--docker', 'host=ssh://operator@build-host']);
    expect(
      await row.count(),
      'the new context reached the screen without the operator asking, so this case proves nothing about the control',
    ).toBe(0);

    await pressRefresh(page);
    await reloadFinished(page);

    // Read once, with no retry: "finished" has to mean the screen already shows it.
    expect(
      await row.count(),
      'when the control returned to rest the screen did not yet list the context created from the terminal',
    ).toBe(1);
    await expect(page.locator('.ui-toast__title', { hasText: 'Refreshed' }), 'the reload was not confirmed').toBeVisible();
  } finally {
    await removeContextQuietly(name);
  }
});

// REQ-1 — one refresh control, present and operable on every screen of the application.
test('carries the refresh control on every screen', async ({ page }) => {
  const destinations = [
    'Dashboard',
    'Containers',
    'Compose',
    'Images & layers',
    'Volumes & networks',
    'Registries',
    'Builders & cache',
    'Contexts',
    'Plugins',
    'System & prune',
    'Raw console',
    'About',
  ];
  await openApp(page, 'dashboard');
  for (const destination of destinations) {
    await clickAtItsCentre(page, navEntry(page, destination), `the ${destination} navigation entry`);
    await expect(page.getByRole('heading', { level: 1, name: destination })).toBeVisible({ timeout: 20_000 });
    const control = refreshControl(page);
    await expect(control, `the ${destination} screen carries no refresh control`).toHaveCount(1);
    await expect(control, `the refresh control is not operable on the ${destination} screen`).toBeEnabled();
    const box = await boxOf(control, `the refresh control on the ${destination} screen`);
    expect(box.y, `the refresh control sits above the top of the viewport on the ${destination} screen`).toBeGreaterThanOrEqual(0);
    expect(box.width, `the refresh control has no width on the ${destination} screen`).toBeGreaterThan(0);
  }
});

// REQ-12, REQ-13 — the batch's third acceptance scenario: the detail open at the press reads its own
// object again, and the screen keeps its scroll position, its selection and what it had open.
test('re-reads the open detail and leaves the screen where it was', async ({ page }) => {
  const volumes = [1, 2, 3, 4, 5, 6, 7, 8].map((index) => fixtureName(`vol-${index}`));
  const shown = volumes[0] as string;
  const inspectReads: string[] = [];
  page.on('request', (request) => {
    const found = /^\/api\/volumes\/([^/]+)\/inspect$/.exec(new URL(request.url()).pathname);
    if (request.method() === 'GET' && found) inspectReads.push(decodeURIComponent(found[1] as string));
  });
  try {
    for (const name of volumes) await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(name), name]);

    await openApp(page, 'volumes-networks');
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible({ timeout: 20_000 });
    const panel = screenContent(page)
      .locator('.ui-stack, .ui-surface')
      .filter({ has: page.getByRole('heading', { level: 2, name: 'Volumes' }) })
      .filter({ has: page.locator('.ui-data-table') })
      .last();
    const row = panel.locator('.ui-data-table__row', { hasText: shown });
    await expect(row, 'the fixture volume never appeared in the list').toBeVisible({ timeout: 20_000 });

    // Selected, and its detail opened, by a real pointer on the row's own first cell.
    await clickAtItsCentre(page, row.locator('.ui-data-table__cell').first(), `the first cell of the row of ${shown}`);
    const detail = panel.locator('.ui-detail-panel');
    await expect(detail, 'the row selection opened no detail').toBeVisible({ timeout: 20_000 });
    await expect(detail, 'the detail opened on another object').toContainText(shown);

    // …and the operator scrolls the screen. The wheel is delivered over the row, near its leading
    // edge: a row wider than the box it is read in has its centre over some other column.
    const beforeWheel = await boxOf(row, `the row of ${shown}`);
    await page.mouse.move(beforeWheel.x + Math.min(60, beforeWheel.width / 2), beforeWheel.y + beforeWheel.height / 2);
    await page.mouse.wheel(0, 300);
    const scrolled = await boxOf(row, `the row of ${shown}`);
    expect(
      scrolled.y,
      'the screen could not be scrolled, so nothing about it keeping its scroll position is being measured',
    ).toBeLessThan(beforeWheel.y - 1);

    const before = await boxesOf(page, { row, detail }, 'the scrolled screen');
    const scrollBefore = await screenContent(page).evaluate((element) => element.scrollTop);
    const selectedBefore = await panel.locator('.ui-data-table__row--selected').innerText();
    const readsBefore = inspectReads.filter((one) => one === shown).length;

    await pressRefresh(page);
    await reloadFinished(page);

    // REQ-12 — the detail open at that moment read its own object again, and did so before the
    // control claimed the reload had ended.
    expect(
      inspectReads.filter((one) => one === shown).length - readsBefore,
      'the detail open at the press never read its own object again',
    ).toBeGreaterThanOrEqual(1);

    // REQ-13 — nothing navigated, nothing closed, nothing moved.
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' }), 'the reload navigated away').toBeVisible();
    await expect(detail, 'the reload closed the open detail').toBeVisible();
    await expect(detail, 'the reload put another object in the open detail').toContainText(shown);
    expect(
      await panel.locator('.ui-data-table__row--selected').innerText(),
      'the reload reset the selection',
    ).toBe(selectedBefore);
    expect(await screenContent(page).evaluate((element) => element.scrollTop), 'the reload reset the scroll position').toBe(scrollBefore);

    const after = await boxesOf(page, { row, detail }, 'the screen after the reload');
    expect(
      sameBox(before.row as Rect, after.row as Rect),
      `the selected row moved from ${JSON.stringify(before.row)} to ${JSON.stringify(after.row)}`,
    ).toBe(true);
    expect(
      sameBox(before.detail as Rect, after.detail as Rect),
      `the open detail moved from ${JSON.stringify(before.detail)} to ${JSON.stringify(after.detail)}`,
    ).toBe(true);
    expect((after.detail as Rect).y, 'the open detail was carried above the top of the viewport').toBeGreaterThanOrEqual(0);
  } finally {
    for (const name of volumes) await removeVolumeQuietly(name);
  }
});

// REQ-14 — the batch's fifth acceptance scenario, second clause: the interface answers normally while
// the reload runs. The endpoint is held open on purpose, so "while it runs" is a real window rather
// than a race with a fast daemon.
test('answers while a reload runs, and navigates nowhere when it ends', async ({ page }) => {
  await page.route('**/api/refresh', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await route.continue();
  });

  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });

  const control = refreshControl(page);
  await clickAtItsCentre(page, control, 'the refresh control');
  await expect(control, 'the control never said it was working').toHaveAttribute('aria-busy', 'true');

  // The operator opens another screen while the reload is still running.
  await clickAtItsCentre(page, navEntry(page, 'Images & layers'), 'the Images & layers navigation entry');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Images & layers' }),
    'the interface did not answer while the reload was running',
  ).toBeVisible({ timeout: 10_000 });
  await expect(control, 'the reload had already ended, so nothing was measured while it ran').toHaveAttribute('aria-busy', 'true');

  await reloadFinished(page);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Images & layers' }),
    'the end of the reload moved the operator off the screen they had opened',
  ).toBeVisible();
});

// REQ-15 — the header shows what it showed before, plus the control: one interactive control, the
// pill and the version badge in the coordinates the control's place at the head of the row preserves,
// and none of it moved by a reload.
test('adds the control to the header and moves nothing else in it', async ({ page }) => {
  await openApp(page, 'dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

  const pageHeader = page.locator('.ui-page-header');
  const actions = page.locator('.ui-page-header__actions');
  const control = refreshControl(page);
  const pill = actions.locator('.ui-status-pill');
  const badge = actions.locator('.ui-badge');

  // The daemon is reachable, so the header carries the pill and the version badge — the two things
  // it showed before this batch, and the two the control must not have moved.
  await expect(badge, 'the header states no negotiated Engine API version').toHaveText(/^Engine API v/);
  await expect(pill).toBeVisible();

  // Nothing else interactive was added: the control is the header's one control.
  await expect(pageHeader.getByRole('button'), 'the header carries a control other than the refresh one').toHaveCount(1);
  await expect(pageHeader.getByRole('button')).toHaveAccessibleName('Refresh');

  const before = await boxesOf(page, { control, pill, badge, actions, header: page.locator('.ui-frame__header') }, 'the header');
  const controlBox = before.control as Rect;
  const pillBox = before.pill as Rect;
  const badgeBox = before.badge as Rect;
  const actionsBox = before.actions as Rect;

  // The control is first in the row and the row is right-aligned, which is what leaves the pill and
  // the badge where they were: the group extends leftwards instead of pushing them along.
  expect(controlBox.x + controlBox.width, 'the control is not before the status pill').toBeLessThanOrEqual(pillBox.x + TOLERANCE_PX);
  expect(pillBox.x + pillBox.width, 'the status pill is not before the version badge').toBeLessThanOrEqual(badgeBox.x + TOLERANCE_PX);
  expect(
    Math.abs(badgeBox.x + badgeBox.width - (actionsBox.x + actionsBox.width)),
    'the version badge is not at the trailing edge of the action row, so the row is not right-aligned',
  ).toBeLessThan(1);
  // At desktop width the three sit on one line.
  expect(controlBox.y, 'the control is not on the pill and badge line').toBeLessThan(pillBox.y + pillBox.height);
  expect(pillBox.y, 'the pill and the badge are not on one line').toBeLessThan(badgeBox.y + badgeBox.height);

  await pressRefresh(page);
  await reloadFinished(page);

  const after = await boxesOf(page, { control, pill, badge, actions, header: page.locator('.ui-frame__header') }, 'the header after a reload');
  for (const part of ['control', 'pill', 'badge', 'actions', 'header']) {
    expect(
      sameBox(before[part] as Rect, after[part] as Rect),
      `the ${part} moved across a reload, from ${JSON.stringify(before[part])} to ${JSON.stringify(after[part])}`,
    ).toBe(true);
  }
});

// REQ-15 — at the phone breakpoint the action row wraps, and that is the arrangement the human
// measured and accepted on 2026-08-28 (`app-shell/specs/shell.md`): the version badge takes a line of
// its own and the header region is 211.2px. Recorded there as an invariant, so it is checked here as
// one rather than reported as a defect.
test('wraps the header action row at the phone breakpoint, to the recorded height', async ({ page }) => {
  const RECORDED_HEADER_HEIGHT_PX = 211.2;

  await openApp(page, 'dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });
  await page.setViewportSize({ width: 390, height: 844 });

  const actions = page.locator('.ui-page-header__actions');
  const control = refreshControl(page);
  const pill = actions.locator('.ui-status-pill');
  const badge = actions.locator('.ui-badge');
  await expect(badge, 'the header states no negotiated Engine API version').toHaveText(/^Engine API v/);

  const boxes = await boxesOf(page, { control, pill, badge, actions, header: page.locator('.ui-frame__header') }, 'the header at 390px');
  const badgeBox = boxes.badge as Rect;
  const pillBox = boxes.pill as Rect;
  const actionsBox = boxes.actions as Rect;

  // The badge takes a line of its own; the control and the pill keep the first.
  expect(badgeBox.y, 'the version badge did not take a line of its own').toBeGreaterThanOrEqual(pillBox.y + pillBox.height - TOLERANCE_PX);
  expect((boxes.control as Rect).y, 'the control left the pill line').toBeLessThan(pillBox.y + pillBox.height);
  // …and nothing overflows the row it wrapped inside.
  for (const [name, box] of [
    ['control', boxes.control as Rect],
    ['pill', pillBox],
    ['badge', badgeBox],
  ] as const) {
    expect(box.x, `the ${name} overflows the action row on the left`).toBeGreaterThanOrEqual(actionsBox.x - TOLERANCE_PX);
    expect(box.x + box.width, `the ${name} overflows the action row on the right`).toBeLessThanOrEqual(
      actionsBox.x + actionsBox.width + TOLERANCE_PX,
    );
  }

  expect(
    Math.abs((boxes.header as Rect).height - RECORDED_HEADER_HEIGHT_PX),
    `the header region is ${(boxes.header as Rect).height}px at the phone breakpoint, not the ${RECORDED_HEADER_HEIGHT_PX}px recorded in app-shell/specs/shell.md`,
  ).toBeLessThan(2);
});
