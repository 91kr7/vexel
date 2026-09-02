/**
 * **The container detail's header carries the container's identity** —
 * `plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor`, REQ-6,
 * REQ-7, REQ-8, REQ-9, REQ-10, driven under REQ-44 and REQ-45: a real pointer at each visible
 * control's own coordinates, geometry asserted beside the content, own labelled fixtures, cleanup in
 * a `finally`, and nothing assumed of the daemon's contents.
 *
 * The three readings this file exists for, and why each is measured rather than only read:
 *
 * - **the absent health pill** (REQ-7) is a claim about *space*, not about text: "nothing occupies
 *   the space where it would be" is false for a pill drawn empty, and a check counting characters
 *   cannot tell the two apart. So the header's items are measured and the gaps between them
 *   compared.
 * - **the long name** (REQ-6, `container-identity-header.md`) is a claim about what gives way: the
 *   name ellipsises rather than pushing the close control off the band, which is a position and not
 *   a string.
 * - **no other dialog's header changed** (REQ-10) is a claim about every dialog this change did not
 *   touch, so what is asserted is the shape their header has always had — the heading element, its
 *   place on the chrome, and the close control beside it where one is asked for.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { boxOf } from './support/settled.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import {
  chooseCardAction,
  closeContainerDetail,
  containerCard,
  containerDetail,
  containerDetailCloseControl,
  containerDetailHeader,
  detailIdentity,
  openContainerDetail,
} from './support/container-cards.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

async function createSleepingContainer(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), ...extraArgs, '--entrypoint', 'sleep', 'alpine:3.20', '300']);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** The daemon's own short id — the twelve characters the list carries (REQ-8). */
async function shortIdOf(name: string): Promise<string> {
  return (await execFileAsync('docker', ['inspect', '-f', '{{.Id}}', name])).stdout.trim().slice(0, 12);
}

/** Waits for the daemon itself to state the outcome, so the header is read against a settled fact. */
async function waitForDaemonHealth(name: string, expected: string): Promise<void> {
  await expect
    .poll(
      async () => (await execFileAsync('docker', ['inspect', '-f', '{{.State.Health.Status}}', name])).stdout.trim(),
      { timeout: 30_000, message: `the daemon never reported ${name} as ${expected}` },
    )
    .toBe(expected);
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The header's items, in the order it draws them, with the box of each: the identity read as a
 * composition rather than as a string. The band holds one arrangement, whose children are the items.
 */
async function headerItems(page: Page): Promise<{ kind: string; box: Rect }[]> {
  return await containerDetailHeader(page).evaluate((band) => {
    const row = band.firstElementChild ?? band;
    return Array.from(row.children).map((item) => {
      const box = item.getBoundingClientRect();
      const kind = item.querySelector('.ui-table-status-dot')
        ? 'dot'
        : item.querySelector('.ui-section-header__title')
          ? 'name'
          : item.classList.contains('ui-badge')
            ? 'pill'
            : item.classList.contains('ui-table-identifier-cell')
              ? 'id'
              : `unknown(${item.className})`;
      return { kind, box: { x: box.x, y: box.y, width: box.width, height: box.height } };
    });
  });
}

/** The horizontal space between each item and the next, rounded to the tenth of a pixel. */
function gapsBetween(items: { box: Rect }[]): number[] {
  return items.slice(1).map((item, index) => {
    const previous = items[index].box;
    return Math.round((item.box.x - (previous.x + previous.width)) * 10) / 10;
  });
}

/** The shape of one dialog's header: the element the title is, where it sits, and what stands beside it. */
async function headerShape(dialog: Locator) {
  return await dialog.evaluate((modal) => {
    const title = modal.querySelector('.ui-modal__title');
    if (title === null) return null;
    const parent = title.parentElement as HTMLElement;
    const close = modal.querySelector('button[aria-label="Close dialog"]');
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    return {
      tag: title.tagName,
      className: title.className,
      parentClass: parent.className,
      indexInParent: Array.from(parent.children).indexOf(title),
      text: title.textContent ?? '',
      title: rect(title),
      modal: rect(modal),
      close: close === null ? null : rect(close),
      closeIsBesideTheTitle: close !== null && title.nextElementSibling === close,
    };
  });
}

/**
 * What every dialog this change did not touch must still show: a heading element on the chrome band,
 * at the top of the card, with the close control beside it where the dialog asks for one.
 */
async function expectUnchangedStringHeader(
  dialog: Locator,
  expectedTitle: string,
  viewport: { width: number; height: number },
  expected: { closeControl: boolean },
) {
  const shape = await headerShape(dialog);
  expect(shape, `the dialog titled "${expectedTitle}" carries no title at all`).not.toBeNull();
  expect(shape!.text).toBe(expectedTitle);
  expect(shape!.tag, 'a dialog that hands the component a string no longer gets its own heading').toBe('H2');
  expect(shape!.className, 'a string title was drawn as composed content').toBe('ui-modal__title');
  expect(shape!.indexInParent, 'the title is no longer the first thing on the chrome band').toBe(0);
  // In the same place: the top band of the card, inside it on both sides.
  expect(shape!.title.y).toBeGreaterThanOrEqual(shape!.modal.y - 0.5);
  expect(shape!.title.y).toBeLessThan(shape!.modal.y + shape!.modal.height / 2);
  expect(shape!.title.x).toBeGreaterThanOrEqual(shape!.modal.x - 0.5);
  expect(shape!.title.x + shape!.title.width).toBeLessThanOrEqual(shape!.modal.x + shape!.modal.width + 0.5);
  expect(shape!.close !== null, 'the dialog gained or lost a close control').toBe(expected.closeControl);
  if (shape!.close !== null) {
    expect(shape!.closeIsBesideTheTitle, 'the close control left the title’s side').toBe(true);
    expect(shape!.close.x, 'the close control is no longer right of the title').toBeGreaterThan(shape!.title.x);
    expect(shape!.close.x + shape!.close.width).toBeLessThanOrEqual(shape!.modal.x + shape!.modal.width + 0.5);
    expect(shape!.close.x).toBeGreaterThanOrEqual(0);
    expect(shape!.close.x + shape!.close.width).toBeLessThanOrEqual(viewport.width);
    expect(shape!.close.y).toBeGreaterThanOrEqual(0);
    expect(shape!.close.y + shape!.close.height).toBeLessThanOrEqual(viewport.height);
  }
}

test.describe('The detail dialog’s header (REQ-6, REQ-7, REQ-8, REQ-9)', () => {
  test.beforeEach(async ({ page }) => {
    // Pinned, not inherited: the last active screen survives by design (REQ-115).
    await openApp(page, 'containers');
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  });

  // REQ-6, REQ-8 — the acceptance scenario: the header says as much as the card the operator left.
  test('states the dot, the bare name, the state pill and the short id of the container it was opened for', async ({ page }) => {
    const name = `vexel-e2e-identity-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });

      await openContainerDetail(page, name);

      // The list re-reads on the daemon's own events, so the starting state is established rather
      // than assumed: a card can be drawn from the re-read the `create` event caused.
      await expect
        .poll(async () => await detailIdentity(page), { timeout: 20_000 })
        .toMatchObject({ dot: 'success', name, state: 'RUNNING', stateTone: 'success', health: null });
      const identity = await detailIdentity(page);
      expect(identity.shortId).toBe(await shortIdOf(name));
      // The prefix is gone: the name stands alone (REQ-6).
      expect(identity.text, 'the withdrawn `Container — ` prefix is still drawn').not.toMatch(/Container\s+—/);
      expect(await headerItems(page)).toMatchObject([{ kind: 'dot' }, { kind: 'name' }, { kind: 'pill' }, { kind: 'id' }]);

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // REQ-7 — the acceptance scenario: one container declaring a health check and one declaring none.
  test('shows the health outcome of a container that has a health check, and nothing at all for one that has none', async ({ page }) => {
    const stem = `vexel-e2e-identity-health-${Date.now()}`;
    const checked = `${stem}-checked`;
    const unchecked = `${stem}-none`;
    try {
      await createSleepingContainer(checked, [
        '--health-cmd',
        'exit 0',
        '--health-interval',
        '1s',
        '--health-timeout',
        '2s',
        '--health-retries',
        '1',
      ]);
      await createSleepingContainer(unchecked);
      await waitForDaemonHealth(checked, 'healthy');
      await page.getByPlaceholder('Search name, image or state…').fill(stem);
      await expect(containerCard(page, checked)).toBeVisible({ timeout: 20_000 });

      await openContainerDetail(page, checked);

      await expect
        .poll(async () => await detailIdentity(page), { timeout: 20_000 })
        .toMatchObject({ name: checked, state: 'RUNNING', health: 'HEALTHY', healthTone: 'success' });
      const withHealth = await headerItems(page);
      expect(withHealth.map((item) => item.kind)).toEqual(['dot', 'name', 'pill', 'pill', 'id']);

      await closeContainerDetail(page);
      await openContainerDetail(page, unchecked);

      await expect
        .poll(async () => await detailIdentity(page), { timeout: 20_000 })
        .toMatchObject({ name: unchecked, state: 'RUNNING', health: null, healthTone: null });
      const withoutHealth = await headerItems(page);
      expect(withoutHealth.map((item) => item.kind), 'a second pill stands where the absent outcome would be').toEqual([
        'dot',
        'name',
        'pill',
        'id',
      ]);

      // …and no gap is held open for it: every item sits the same distance from the next, so the
      // space between the state pill and the short id is the band's own spacing and nothing more.
      const gaps = gapsBetween(withoutHealth);
      const centres = withoutHealth.map((item) => Math.round(item.box.y + item.box.height / 2));
      expect(new Set(centres).size, 'the header wrapped, so these gaps compare items on different lines').toBe(1);
      for (const gap of gaps) {
        expect(gap, `the header's gaps are uneven: ${JSON.stringify(gaps)}`).toBeCloseTo(gaps[0], 0);
      }

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(checked);
      await removeContainerQuietly(unchecked);
    }
  });

  // REQ-9 — the acceptance scenario: the state in the header keeps up with the container, the
  // operator doing nothing. The dialog's own box is asserted beside it: the update must not move it.
  test('follows a state that changes while the detail is open, without the operator acting', async ({ page }) => {
    const name = `vexel-e2e-identity-live-${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });

      await openContainerDetail(page, name);
      const detail = containerDetail(page);
      await expect(detail.getByRole('button', { name: 'Edit configuration' })).toBeVisible({ timeout: 20_000 });
      // The starting state is established, not assumed — and the header reaching it under an open
      // dialog is already the behaviour under test: the list re-reads, the header follows.
      await expect
        .poll(async () => await detailIdentity(page), { timeout: 30_000 })
        .toMatchObject({ dot: 'success', name, state: 'RUNNING' });
      const before = await boxOf(detail, 'the container detail dialog');

      // Stopped by another client of the same daemon: nothing is done to the application at all.
      await execFileAsync('docker', ['stop', '-t', '0', name]);

      await expect
        .poll(async () => await detailIdentity(page), { timeout: 30_000 })
        .toMatchObject({ dot: 'neutral', name, state: 'EXITED', stateTone: 'neutral' });

      const after = await boxOf(detail, 'the container detail dialog');
      expect(after, 'the dialog moved or was resized when its container’s state changed').toEqual(before);
      await expect(containerDetailCloseControl(page)).toBeVisible();

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // container-status.md — "`undefined` means the daemon states no outcome … equally one whose state
  // has no outcome to report": a stopped container's status sentence carries no parenthetical, so
  // its header shows no health pill. Intended, and checked as such: it follows from the header
  // asking the daemon for nothing of its own (REQ-9).
  test('shows no health pill on a stopped container that declares a health check', async ({ page }) => {
    const name = `vexel-e2e-identity-stopped-health-${Date.now()}`;
    try {
      await createSleepingContainer(name, ['--health-cmd', 'exit 0', '--health-interval', '1s', '--health-timeout', '2s', '--health-retries', '1']);
      await waitForDaemonHealth(name, 'healthy');
      await page.getByPlaceholder('Search name, image or state…').fill(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 20_000 });

      await openContainerDetail(page, name);
      await expect.poll(async () => await detailIdentity(page), { timeout: 20_000 }).toMatchObject({ health: 'HEALTHY' });

      await execFileAsync('docker', ['stop', '-t', '0', name]);

      await expect
        .poll(async () => await detailIdentity(page), { timeout: 30_000 })
        .toMatchObject({ name, state: 'EXITED', health: null, healthTone: null });
      expect((await headerItems(page)).map((item) => item.kind)).toEqual(['dot', 'name', 'pill', 'id']);

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // container-identity-header.md — "at a narrow viewport the line wraps instead of clipping or
  // scrolling sideways".
  test('wraps the identity at the phone breakpoint instead of scrolling it sideways', async ({ page }) => {
    const name = `vexel-e2e-identity-narrow-${'segment-of-a-long-name-'.repeat(2)}${Date.now()}`;
    try {
      await page.setViewportSize({ width: 375, height: 812 });
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });

      await openContainerDetail(page, name);
      const detail = containerDetail(page);
      const dialog = await boxOf(detail, 'the container detail dialog');

      const items = await headerItems(page);
      expect(items.map((item) => item.kind)).toEqual(['dot', 'name', 'pill', 'id']);
      for (const item of items) {
        expect(item.box.x, `a header item (${item.kind}) is left of the dialog`).toBeGreaterThanOrEqual(dialog.x - 0.5);
        expect(item.box.x + item.box.width, `a header item (${item.kind}) is right of the dialog`).toBeLessThanOrEqual(
          dialog.x + dialog.width + 0.5,
        );
      }
      const sideways = await containerDetailHeader(page).evaluate((band) => band.scrollWidth - band.clientWidth);
      expect(sideways, 'the header scrolls sideways at the phone breakpoint').toBeLessThanOrEqual(1);

      await closeContainerDetail(page);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // container-identity-header.md — "the name gives way before its neighbours do": a long name
  // ellipsises rather than pushing the pills, the short id or the close control out of place.
  test('lets a long name give way rather than pushing the close control off the band', async ({ page }) => {
    const name = `vexel-e2e-identity-${'a-very-long-container-name-segment-'.repeat(4)}${Date.now()}`;
    try {
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });

      await openContainerDetail(page, name);
      const detail = containerDetail(page);
      const dialog = await boxOf(detail, 'the container detail dialog');
      const viewport = page.viewportSize()!;

      // Everything the header holds is still drawn, and still inside the card.
      const items = await headerItems(page);
      expect(items.map((item) => item.kind)).toEqual(['dot', 'name', 'pill', 'id']);
      for (const item of items) {
        expect(item.box.x, `a header item (${item.kind}) is left of the dialog`).toBeGreaterThanOrEqual(dialog.x - 0.5);
        expect(item.box.x + item.box.width, `a header item (${item.kind}) is right of the dialog`).toBeLessThanOrEqual(
          dialog.x + dialog.width + 0.5,
        );
      }

      // The name is the one that gave way, and the whole of it is still available where it is cut.
      const nameElement = containerDetailHeader(page).locator('.ui-section-header__title');
      const cut = await nameElement.evaluate((element) => ({
        clipped: element.scrollWidth > element.clientWidth,
        title: element.getAttribute('title'),
      }));
      expect(cut.clipped, 'the name was not the element that gave way').toBe(true);
      expect(cut.title, 'the whole name is not available where it is cut').toBe(name);

      // …and the close control is still on the band, inside the card and inside the viewport.
      const close = await boxOf(containerDetailCloseControl(page), 'the dialog’s close control');
      expect(close.x + close.width).toBeLessThanOrEqual(dialog.x + dialog.width + 0.5);
      expect(close.x).toBeGreaterThanOrEqual(0);
      expect(close.x + close.width).toBeLessThanOrEqual(viewport.width);
      expect(close.y).toBeGreaterThanOrEqual(0);
      expect(close.y + close.height).toBeLessThanOrEqual(viewport.height);

      await closeContainerDetail(page);
      // The point of interaction still comes back to the control that opened it (REQ-42).
      await expect(containerCard(page, name).getByRole('button', { name: `Open ${name} details`, exact: true })).toBeFocused();
    } finally {
      await removeContainerQuietly(name);
    }
  });
});

// REQ-10 — "no other dialog's header changes: every other dialog in the product draws the title it
// draws today, in the same place, with its close control unchanged". The acceptance scenario names
// three: the create form, a confirmation, and the layer explorer.
test.describe('No other dialog’s header changed (REQ-10)', () => {
  test('the create form and a confirmation keep the header they have always had', async ({ page }) => {
    const name = `vexel-e2e-other-dialogs-${Date.now()}`;
    try {
      await openApp(page, 'containers');
      await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
      await createSleepingContainer(name);
      await expect(containerCard(page, name)).toBeVisible({ timeout: 15_000 });
      const viewport = page.viewportSize()!;

      // The create form: a sheet, whose title is its own heading at the head of its chrome.
      await page.getByRole('button', { name: 'Run container…' }).click();
      const sheet = page.locator('.ui-form-sheet');
      await expect(sheet).toBeVisible();
      const sheetHeader = await sheet.evaluate((element) => {
        const title = element.querySelector('.ui-form-sheet__title');
        const box = (element.querySelector('.ui-form-sheet__header') as HTMLElement).getBoundingClientRect();
        const sheetBox = element.getBoundingClientRect();
        return {
          tag: title?.tagName ?? null,
          text: title?.textContent ?? null,
          headerTop: box.y,
          sheetTop: sheetBox.y,
          firstOnTheChrome: element.firstElementChild?.classList.contains('ui-form-sheet__header') ?? false,
        };
      });
      expect(sheetHeader.tag).toBe('H2');
      expect(sheetHeader.text).toBe('Run a container');
      expect(sheetHeader.firstOnTheChrome, 'the sheet’s header is no longer the first thing on it').toBe(true);
      expect(sheetHeader.headerTop).toBeGreaterThanOrEqual(sheetHeader.sheetTop - 0.5);
      await sheet.getByRole('button', { name: 'Cancel' }).click();
      await expect(sheet).toHaveCount(0);

      // A confirmation: the product's most numerous dialog, and one that asks for no close control.
      await chooseCardAction(page, name, 'Kill');
      const confirmHeading = page.getByRole('heading', { name: `Confirm: ${name}` });
      await expect(confirmHeading).toBeVisible();
      const confirmation = page.locator('.ui-modal').filter({ has: confirmHeading });
      await expectUnchangedStringHeader(confirmation, `Confirm: ${name}`, viewport, { closeControl: false });
      await confirmation.getByRole('button', { name: 'Cancel' }).click();
      await expect(confirmHeading).toHaveCount(0);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  test('the layer explorer keeps the header it has always had', async ({ page }) => {
    const containerName = `vexel-e2e-other-dialogs-layers-src-${Date.now()}`;
    const tag = `vexel-e2e-other-dialogs-layers-${Date.now()}:v1`;
    try {
      await openApp(page, 'images-layers');
      await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();

      // Built locally from the suite's own single-layer image: nothing is fetched at all.
      await ensureImage(TINY_IMAGE);
      await execFileAsync('docker', ['create', '--name', containerName, ...ownershipArgs(containerName), TINY_IMAGE]);
      await execFileAsync('docker', ['commit', containerName, tag]);
      await page.reload();
      await page.getByPlaceholder('Search reference or digest…').fill(tag);
      const row = page.locator('.ui-data-table__row', { hasText: tag });
      await expect(row).toBeVisible({ timeout: 15_000 });

      await chooseFromRowOverflowMenu(page, row, 'Explore layers…');
      const explorer = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: `Layer stack — ${tag}` }) });
      await expect(explorer).toBeVisible();

      await expectUnchangedStringHeader(explorer, `Layer stack — ${tag}`, page.viewportSize()!, { closeControl: false });

      await page.locator('.ui-modal-overlay').click({ position: { x: 4, y: 4 } });
      await expect(explorer).toHaveCount(0);
    } finally {
      await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
      await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
    }
  });
});
