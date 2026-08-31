import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { chooseImageRowAnalysis } from './support/images-screen.js';
import { containerCard, dismissContainerDetailByScrim, openContainerDetail } from './support/container-cards.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

/**
 * The library's dialog surface, measured in a real browser: the glass card of a
 * dialog is the size of the dialog it holds — no band of empty glass beside the
 * content (REQ-1), and no content rendered outside the surface meant to contain
 * it (REQ-2). REQ ids belong to
 * `plan-docker_management_app-dialog_sizing/requirements.md`.
 *
 * jsdom measures nothing (`getBoundingClientRect` returns zeros there), and a
 * static assertion over the CSS text would check an implementation rather than
 * the required effect, so this is the only place the property can be verified.
 *
 * Non-destructive throughout: every prune and removal dialog it opens is opened
 * to be measured and **cancelled**, never confirmed. The one object it creates is
 * the container whose detail is the fifth large-format dialog — labelled, never
 * started, and removed by the test that made it; the single image it needs is the
 * suite's own locally built one.
 */

/**
 * Where the batch's numbers were taken, and the viewport the human's acceptance
 * criteria are written against.
 */
test.use({ viewport: { width: 1280, height: 800 } });

/**
 * The ordinary dialog's designed width. It is not the definition of correctness
 * — that is agreement between card and content, asserted separately — but the
 * value this change must leave untouched (REQ-7).
 */
const ORDINARY_DIALOG_WIDTH = 480;

/**
 * The large format's designed width, likewise untouched by this change (REQ-8): `min(1100px, 92vw)`.
 * The layer explorer and the filesystem browser are held to it; the container detail is **not**, and
 * has a width of its own below — do not fold the two together.
 */
function largeDialogWidth(viewportWidth: number): number {
  return Math.min(1100, viewportWidth * 0.92);
}

/**
 * The width the container detail asks for, and only it: the large format's `fluidWidth` modifier,
 * which goes on following the viewport instead of stopping at 1100px
 * (`plan-docker_management_app-containers_card_view-detail_modal/REQ-18`, amended by the human on
 * 2026-08-26 — holding this surface at the constant cost the operator a property column above
 * roughly 1200px, which REQ-4 makes a defect). Written apart from `largeDialogWidth` on purpose: the
 * four other large dialogs keep the cap, and one shared helper is how that distinction would be lost.
 */
function fluidLargeDialogWidth(viewportWidth: number): number {
  return viewportWidth * 0.92;
}

/**
 * Agreement is asserted to the pixel. One pixel of slack absorbs subpixel
 * layout only.
 */
const TOLERANCE_PX = 1;

/**
 * The slack allowed when checking a *designed* width against the boxes that
 * carry it: the glass surface draws a hairline border, so the innermost box
 * legitimately reads up to two pixels less than the outermost one. That border
 * is the card's own edge — never a band of empty glass — so it is excluded from
 * the designed-width check and never from the agreement check.
 */
const HAIRLINE_SLACK_PX = 2;

/**
 * The large format's **viewport bound**, as a ceiling a content-sized dialog must stay strictly
 * under. Since
 * `plan-docker_management_app-containers_card_view-detail_modal-tabs_composition_refactor/REQ-5` the
 * same figure is read two ways: as a *height* by the one dialog that asks for the stable-height
 * opt-in, and as a *maximum* by every dialog that does not. A dialog of the second kind measuring
 * the bound exactly is the failure this ceiling exists to catch — it would mean the opt-in leaked.
 */
function largeDialogHeightBound(viewportHeight: number): number {
  return viewportHeight * 0.85;
}

/**
 * A dialog **sized by its content in height** (REQ-5): shorter than the bound the format carries,
 * and in exact agreement with the content it holds. The first half is what distinguishes it from a
 * dialog given the available height; the second is the delivered guarantee it keeps while doing so.
 *
 * The content is short by construction in every case below — the analyses are measured before they
 * are run, the single-layer image's stack and filesystem hold a handful of rows — so "shorter than
 * the bound" is a statement about the sizing rule and not about the fixture.
 */
function expectSizedByItsContentInHeight(label: string, boxes: DialogBoxes, viewportHeight: number): void {
  const bound = largeDialogHeightBound(viewportHeight);
  expect
    .soft(
      boxes.card.height,
      `${label} — the card measures ${boxes.card.height.toFixed(1)}px against the ${bound.toFixed(
        1,
      )}px bound: it is taking the height available rather than the height its content needs`,
    )
    .toBeLessThan(bound);
  expectLength(label, 'the content is as tall as the glass holding it', boxes.content.height, boxes.glassInner.height);
}

interface Box {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface DialogBoxes {
  /** The overlay's first element child: the grid item, and what the glass paints as. */
  card: Box;
  /** The glass surface itself. */
  glass: Box;
  /** The glass's box inside its own border — what a card of that size actually offers its content. */
  glassInner: Box;
  /** The dialog the card exists to hold. */
  content: Box;
  viewportWidth: number;
}

/**
 * Measures the one open dialog: the overlay's first element child, the glass
 * inside it and the dialog content it holds.
 *
 * Selected through `.ui-modal-overlay` and the content's own class as they are
 * today — 47 files across the client's test trees query this subtree by
 * selector, and the measurement must work on either side of the fix.
 */
async function measureOpenDialog(page: Page, contentSelector: string): Promise<DialogBoxes> {
  return page.evaluate((selector) => {
    const overlays = document.querySelectorAll('.ui-modal-overlay');
    if (overlays.length !== 1) {
      throw new Error(`expected exactly one open dialog overlay, found ${overlays.length}`);
    }
    const card = overlays[0]!.firstElementChild;
    if (!card) throw new Error('the dialog overlay has no element child to measure');
    const glass = card.querySelector('.ui-overlay-glass');
    if (!glass) throw new Error('no overlay-glass surface inside the dialog');
    const content = card.querySelector(selector);
    if (!content) throw new Error(`no ${selector} inside the dialog`);

    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    };
    const glassBox = box(glass);
    const style = getComputedStyle(glass);
    const borderLeft = Number.parseFloat(style.borderLeftWidth);
    const borderRight = Number.parseFloat(style.borderRightWidth);
    const borderTop = Number.parseFloat(style.borderTopWidth);
    const borderBottom = Number.parseFloat(style.borderBottomWidth);

    return {
      card: box(card),
      glass: glassBox,
      glassInner: {
        left: glassBox.left + borderLeft,
        right: glassBox.right - borderRight,
        top: glassBox.top + borderTop,
        bottom: glassBox.bottom - borderBottom,
        width: glassBox.width - borderLeft - borderRight,
        height: glassBox.height - borderTop - borderBottom,
      },
      content: box(content),
      viewportWidth: window.innerWidth,
    };
  }, contentSelector);
}

/**
 * Soft on purpose: every measurement of a run is wanted, not just the first one
 * that disagrees — the numbers are the evidence.
 */
function expectLength(label: string, what: string, measured: number, expected: number, tolerance = TOLERANCE_PX): void {
  expect
    .soft(Math.abs(measured - expected), `${label} — ${what}: measured ${measured.toFixed(1)}px against ${expected.toFixed(1)}px`)
    .toBeLessThanOrEqual(tolerance);
}

/**
 * The property itself, in both directions and on both axes: the glass fills the
 * card, and the content fills the glass — so there is no band of empty glass
 * beside or around the content (REQ-1) and nothing rendered outside the surface
 * holding it (REQ-2), in width (REQ-1, REQ-2) and in height (REQ-10).
 */
function expectCardIsTheSizeOfItsContent(label: string, boxes: DialogBoxes): void {
  expectLength(label, 'the glass surface fills the card in width', boxes.glass.width, boxes.card.width);
  expectLength(label, 'the glass surface fills the card in height', boxes.glass.height, boxes.card.height);

  expectLength(label, 'the content is as wide as the glass holding it', boxes.content.width, boxes.glassInner.width);
  expectLength(label, 'no glass to the left of the content', boxes.content.left, boxes.glassInner.left);
  expectLength(label, 'no glass to the right of the content', boxes.content.right, boxes.glassInner.right);

  expectLength(label, 'the content is as tall as the glass holding it', boxes.content.height, boxes.glassInner.height);
  expectLength(label, 'no glass above the content', boxes.content.top, boxes.glassInner.top);
  expectLength(label, 'no glass below the content', boxes.content.bottom, boxes.glassInner.bottom);
}

/** The designed width, asserted on every box that carries it (REQ-7, REQ-8). */
function expectDesignedWidth(label: string, boxes: DialogBoxes, expected: number): void {
  expectLength(label, 'the card is the designed width', boxes.card.width, expected, HAIRLINE_SLACK_PX);
  expectLength(label, 'the content column is the designed width', boxes.content.width, expected, HAIRLINE_SLACK_PX);
}

/**
 * Where the viewport, and not the designed width, is what limits a dialog: it
 * still keeps a clearance from the edges of the screen and nothing runs off the
 * side (REQ-9).
 */
function expectInsideTheViewport(label: string, boxes: DialogBoxes): void {
  expect.soft(boxes.glass.left, `${label} — the card keeps a clearance from the left edge: left is ${boxes.glass.left.toFixed(1)}px`).toBeGreaterThan(0);
  expect
    .soft(boxes.glass.right, `${label} — the card keeps a clearance from the right edge: right is ${boxes.glass.right.toFixed(1)}px of ${boxes.viewportWidth}px`)
    .toBeLessThan(boxes.viewportWidth);
  expect.soft(boxes.content.left, `${label} — the content starts inside the viewport: left is ${boxes.content.left.toFixed(1)}px`).toBeGreaterThanOrEqual(0);
  expect
    .soft(boxes.content.right, `${label} — the content ends inside the viewport: right is ${boxes.content.right.toFixed(1)}px of ${boxes.viewportWidth}px`)
    .toBeLessThanOrEqual(boxes.viewportWidth);
}

function createContextDialog(page: Page): Locator {
  return page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Create context' }) });
}

/** Opens Contexts → Create context, a `FormDialog` with a paragraph of copy — the case of `bugs-screen/bug-1.png`. */
async function openCreateContextDialog(page: Page): Promise<Locator> {
  await openApp(page, 'contexts');
  await expect(page.getByRole('heading', { level: 2, name: 'Docker contexts' })).toBeVisible();
  await page.getByRole('button', { name: 'Create context' }).click();
  const dialog = createContextDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Opens Volumes & networks → Networks → Prune, a `ConfirmDialog`: a different
 * content composition from a form, which is why the second ordinary dialog is
 * not a second `FormDialog`. Cancelled by every caller — nothing is pruned.
 */
async function openPruneNetworksDialog(page: Page): Promise<Locator> {
  await openApp(page, 'volumes-networks');
  await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();
  // The innermost region carrying both the heading and the list: the panel's
  // section header sits above its card rather than inside it
  // (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`).
  const networksPanel = page
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Networks' }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
  const pruneButton = networksPanel.getByRole('button', { name: 'Prune', exact: true });
  await expect(pruneButton).toBeEnabled({ timeout: 20_000 });
  await pruneButton.click();
  const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Confirm: unused networks' }) });
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Waits for the layer stack to load, retrying through the explorer's own
 * "Retry" action if it does not — the wait `layer-explorer.spec.ts` already
 * needs against this daemon, kept here so the dialog is measured with its final
 * content rather than mid-load.
 */
async function waitForLayerStack(page: Page, dialog: Locator): Promise<void> {
  const row = dialog.locator('.ui-data-table__row').first();
  const retryButton = dialog.getByRole('button', { name: 'Retry' });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await Promise.race([
      row.waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined),
      retryButton.waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined),
    ]);
    if (await row.isVisible()) return;
    if (await retryButton.isVisible()) {
      await page.waitForTimeout(500);
      await retryButton.click();
    }
  }
  await row.waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Opens Images & layers → Explore layers… on the suite's own single-layer image: the `large` format.
 *
 * Reached from the row's own overflow menu, with no row selected and no detail panel open — the
 * entry point the four analyses have now that they are the screen's views rather than the panel's
 * (images/specs/images-screen.md). What is measured here is the dialog's own box, which the surface
 * it is drawn over does not enter into; the row click that used to precede this existed only to open
 * the panel that held the button.
 */
async function openLayerExplorerDialog(page: Page): Promise<Locator> {
  await ensureImage(TINY_IMAGE);
  // Screen, search and gesture from the shared path, so this file and `layer-build-cache.spec.ts`
  // cannot drift apart again; what stays here is what this file demands of the dialog.
  await chooseImageRowAnalysis(page, TINY_IMAGE, 'Explore layers…');
  const dialog = page.locator('.ui-modal--size-large');
  await expect(dialog).toBeVisible();
  await waitForLayerStack(page, dialog);
  return dialog;
}


/**
 * Opens Images & layers → Browse filesystem… on the suite's own single-layer image: the second
 * instance of the `large` format, and one the delivered cases never measured — they all use the
 * layer explorer, so this dialog has never been held to this file's guarantee.
 *
 * The image is deliberately one whose filesystem holds only a handful of root entries (its own file
 * plus Docker's container-creation scaffolding): content demonstrably shorter than the 85vh cap, so
 * a dialog that had started taking the available height instead of its content's would be seen here.
 *
 * Reached from the row's own overflow menu with a real pointer at each visible control, and through
 * the cost warning the flow raises for an image nothing is kept for.
 */
async function openFilesystemBrowserDialog(page: Page): Promise<Locator> {
  await ensureImage(TINY_IMAGE);
  await chooseImageRowAnalysis(page, TINY_IMAGE, 'Browse filesystem…');

  const warning = page.getByRole('heading', { name: `Confirm: ${TINY_IMAGE}` });
  await expect(warning).toBeVisible();
  await warning.locator('xpath=..').getByRole('button', { name: 'Extract' }).click();
  await expect(page.getByRole('heading', { name: 'Extracting the filesystem' })).toHaveCount(0, { timeout: 60_000 });

  const dialog = page.locator('.ui-modal--size-large');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.ui-tree-view__row').first()).toBeVisible({ timeout: 20_000 });
  return dialog;
}

/** Opens Containers → Run container…, the sheet-style surface that positions itself independently (REQ-13). */
async function openCreateContainerSheet(page: Page): Promise<Locator> {
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  await page.getByRole('button', { name: 'Run container…' }).click();
  const sheet = page.locator('.ui-form-sheet');
  await expect(sheet).toBeVisible();
  return sheet;
}

async function cancelDialog(dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
}

/**
 * Dismisses a dialog that offers no action row of its own — the layer explorer
 * has none — the way an operator does: a click on the dimmed scrim, in its top
 * corner, well outside the card at either viewport.
 */
async function dismissThroughTheScrim(page: Page, dialog: Locator): Promise<void> {
  await page.locator('.ui-modal-overlay').click({ position: { x: 4, y: 4 } });
  await expect(dialog).toBeHidden();
}

// REQ-1, REQ-2, REQ-7, REQ-10, REQ-16 — an ordinary form dialog with a paragraph of copy: the card
// is the size of the dialog it holds, in both directions and on both axes, at the designed width
// this change leaves untouched.
test('the glass card of an ordinary form dialog is exactly the size of the dialog it holds', async ({ page }) => {
  const dialog = await openCreateContextDialog(page);

  const boxes = await measureOpenDialog(page, '.ui-modal');
  expectCardIsTheSizeOfItsContent('Contexts → Create context', boxes);
  expectDesignedWidth('Contexts → Create context', boxes, ORDINARY_DIALOG_WIDTH);

  await cancelDialog(dialog);
});

// REQ-1, REQ-2, REQ-5, REQ-7, REQ-10 — a confirm dialog is a different content composition, and it
// is the same width as the form dialog: the ordinary dialogs read as one family, not as one width
// per screen. Opened and cancelled: nothing is pruned.
test('the glass card of an ordinary confirm dialog hugs its content, at the same width as a form dialog', async ({ page }) => {
  const confirmDialog = await openPruneNetworksDialog(page);
  const confirmBoxes = await measureOpenDialog(page, '.ui-modal');
  expectCardIsTheSizeOfItsContent('Volumes & networks → prune unused networks', confirmBoxes);
  expectDesignedWidth('Volumes & networks → prune unused networks', confirmBoxes, ORDINARY_DIALOG_WIDTH);
  await cancelDialog(confirmDialog);

  const formDialog = await openCreateContextDialog(page);
  const formBoxes = await measureOpenDialog(page, '.ui-modal');
  expectLength('the two ordinary dialogs', 'present at one single common width', confirmBoxes.card.width, formBoxes.card.width);
  await cancelDialog(formDialog);
});

// REQ-2, REQ-3, REQ-4, REQ-17 — the too-narrow direction, which no dialog of the product reaches on
// its own: the open dialog's own description is replaced with a short string and the dialog
// re-measured. The same dialog with short copy and with long copy is the identical width — a width
// driven by the length of a text, or by a long runtime value, cannot come back.
test('a dialog with short content still fits its card exactly, and is the same width as with long content', async ({ page }) => {
  const dialog = await openCreateContextDialog(page);
  const description = dialog.locator('.ui-form-dialog__description');
  await expect(description).toBeVisible();
  const longCopy = (await description.textContent()) ?? '';

  const withLongCopy = await measureOpenDialog(page, '.ui-modal');
  try {
    await description.evaluate((element) => {
      element.textContent = 'Short.';
    });
    const withShortCopy = await measureOpenDialog(page, '.ui-modal');

    expectCardIsTheSizeOfItsContent('Contexts → Create context, with short copy', withShortCopy);
    expectDesignedWidth('Contexts → Create context, with short copy', withShortCopy, ORDINARY_DIALOG_WIDTH);
    expectLength('Contexts → Create context', 'the same width with short copy as with long copy', withShortCopy.card.width, withLongCopy.card.width);
  } finally {
    await description.evaluate((element, text) => {
      element.textContent = text;
    }, longCopy);
  }

  await cancelDialog(dialog);
});

// REQ-1, REQ-2, REQ-8, REQ-10, REQ-18 — the large format is drawn on the same surface: its card is
// the size of its content too, and it keeps the wide format it is entitled to rather than being
// narrowed towards the ordinary width.
test('the glass card of a large dialog is exactly the size of the dialog it holds, and stays the wide format', async ({ page }) => {
  const dialog = await openLayerExplorerDialog(page);

  const boxes = await measureOpenDialog(page, '.ui-modal');
  expectCardIsTheSizeOfItsContent('Images & layers → Explore layers', boxes);
  expectDesignedWidth('Images & layers → Explore layers', boxes, largeDialogWidth(boxes.viewportWidth));
  // tabs_composition_refactor/REQ-5 — and it is still sized by its content in **height**: this
  // dialog asks for no stable height, and a single-layer stack is well short of the bound.
  expectSizedByItsContentInHeight('Images & layers → Explore layers', boxes, page.viewportSize()!.height);
  expect
    .soft(boxes.card.width, `the large dialog must not be narrowed towards the ordinary width: measured ${boxes.card.width.toFixed(1)}px`)
    .toBeGreaterThan(ORDINARY_DIALOG_WIDTH);

  await dismissThroughTheScrim(page, dialog);
});

// REQ-1, REQ-2, REQ-8, REQ-10 — the second large-format dialog, and the one whose interior is
// re-laid out by plan-docker_management_app-filesystem_browser_layout: the card is the size of the
// dialog it holds and keeps the designed wide format, exactly as the layer explorer does.
test('the glass card of the filesystem browser is exactly the size of the dialog it holds, at the large format', async ({ page }) => {
  // 120s = 60 + 20 + 20 + 10 + 10 (REQ-64, REQ-65):
  //   60s — the extraction: the ceiling `openFilesystemBrowserDialog` declares for it, and the
  //         largest single step this case runs;
  //   20s — the images screen opens and the image's row appears: `chooseImageRowAnalysis`'s wait;
  //   20s — the tree's first row, once the extraction is done: the same helper's wait;
  //   10s — the single-layer image is on the daemon: `ensureImage`, which builds it when it is not;
  //   10s — the menu gesture, the cost warning, the measurement pass and the dismissal.
  test.setTimeout(120_000);
  const dialog = await openFilesystemBrowserDialog(page);

  const boxes = await measureOpenDialog(page, '.ui-modal');
  expectCardIsTheSizeOfItsContent('Images & layers → Browse filesystem', boxes);
  expectDesignedWidth('Images & layers → Browse filesystem', boxes, largeDialogWidth(boxes.viewportWidth));

  await dismissThroughTheScrim(page, dialog);
});

/**
 * Opens Containers → a card's own detail control: the fifth instance of the `large` format, and the
 * one this plan puts on it (`plan-docker_management_app-containers_card_view-detail_modal/REQ-18`).
 *
 * The fixture is created and **never started** — the detail reads inspect data, and nothing here
 * needs a process — and it is removed by the caller's `finally`.
 */
async function openContainerDetailDialog(page: Page, name: string): Promise<Locator> {
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  await page.getByPlaceholder('Search name, image or state…').fill(name);
  await expect(containerCard(page, name), 'the fixture container never appeared in the list').toBeVisible({ timeout: 20_000 });
  await openContainerDetail(page, name);
  const dialog = page.locator('.ui-modal--size-large');
  await expect(dialog.getByRole('tab', { name: 'Config' })).toBeVisible({ timeout: 20_000 });
  return dialog;
}

async function createDetailFixture(name: string): Promise<void> {
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', ['create', '--name', name, ...ownershipArgs(name), TINY_IMAGE]);
}

async function removeDetailFixture(name: string): Promise<void> {
  // `-v`, never a bare `-f`: an anonymous volume the daemon attached outlives the container.
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

// detail_modal/REQ-18, and dialog_sizing/REQ-1, REQ-2, REQ-10 — the container detail is sized by the
// delivered dialog rules: the card the size of its content with no band of empty glass beside it,
// nothing rendered outside it, the height bounded by the viewport and the content scrolling inside
// the card. Its **width** is the one thing it does not share with the other large dialogs: it goes
// on following the viewport (REQ-18 as amended on 2026-08-26), which the capped ones do not — and
// that they still do is asserted, unedited, by the two tests above.
test('the glass card of the container detail is exactly the size of the dialog it holds, at the large format', async ({ page }) => {
  const name = `vexel-e2e-dialog-detail-${Date.now()}`;
  await createDetailFixture(name);
  try {
    const dialog = await openContainerDetailDialog(page, name);

    const boxes = await measureOpenDialog(page, '.ui-modal');
    const designed = fluidLargeDialogWidth(boxes.viewportWidth);
    console.log(
      `[REQ-18] container detail at ${boxes.viewportWidth}px: card ${boxes.card.width}px, glass ${boxes.glass.width}px, glass inner ${boxes.glassInner.width}px, content ${boxes.content.width}px, against a designed ${designed}px`,
    );
    expectCardIsTheSizeOfItsContent('Containers → container detail', boxes);
    // The **card** carries the designed width, and the content column is that width less the glass's
    // own hairline on each side — asserted against the card by `expectCardIsTheSizeOfItsContent`
    // above rather than against the designed value a second time. `expectDesignedWidth` compares
    // both to the constant, which is exact only while the constant is an integer: the capped format
    // is 1100px and lands on it, while `92vw` is fractional and the layout's rounding lands in the
    // content column. That residue is the browser's, not a band of empty glass.
    expectLength('Containers → container detail', 'the card is the designed width', boxes.card.width, designed);
    // …and it is wider than the capped format at this viewport, so the reading above is the fluid
    // width rather than the constant happening to agree with it.
    expect(
      boxes.card.width,
      `Containers → container detail — the card measures ${boxes.card.width.toFixed(1)}px, which is the capped ${largeDialogWidth(
        boxes.viewportWidth,
      ).toFixed(1)}px the other large dialogs keep`,
    ).toBeGreaterThan(largeDialogWidth(boxes.viewportWidth) + TOLERANCE_PX);

    const viewport = page.viewportSize()!;
    expect(
      boxes.card.height,
      `Containers → container detail — the card measures ${boxes.card.height.toFixed(1)}px against a ${viewport.height}px viewport`,
    ).toBeLessThanOrEqual(viewport.height + TOLERANCE_PX);

    // The content scrolls inside the card, never on the positioner around it.
    const scrolling = await page.evaluate(() => {
      const positioner = document.querySelector('.ui-modal__positioner');
      const body = document.querySelector('.ui-modal--size-large .ui-modal__body');
      const overflow = (element: Element | null) =>
        element === null ? null : { scrollHeight: element.scrollHeight, clientHeight: element.clientHeight };
      return { positioner: overflow(positioner), body: overflow(body) };
    });
    expect(scrolling.positioner, 'the dialog has no positioner').not.toBeNull();
    expect(
      scrolling.positioner!.scrollHeight,
      `Containers → container detail — the positioner scrolls: ${scrolling.positioner!.scrollHeight} against ${scrolling.positioner!.clientHeight}`,
    ).toBeLessThanOrEqual(scrolling.positioner!.clientHeight + TOLERANCE_PX);

    await dismissContainerDetailByScrim(page);
    await expect(dialog).toHaveCount(0);
  } finally {
    await removeDetailFixture(name);
  }
});

// plan-docker_management_app-filesystem_browser_layout/REQ-7, REQ-24 — **a maximum, not a height.**
// The interior of this dialog now hands its remaining height to the tree; giving the arrangement a
// height instead of a bound would make the dialog 85vh tall for ever and trade this report's defect
// for the one `dialog_sizing` fixed. Browsing an image whose filesystem holds a handful of root
// entries, the card is strictly shorter than the cap and still agrees exactly with its content: no
// band of empty glass below the tree.
test('a filesystem with a handful of entries opens a dialog shorter than the cap, still the size of its content', async ({ page }) => {
  // 120s = 60 + 20 + 20 + 10 + 10 (REQ-64, REQ-65):
  //   60s — the extraction: the ceiling `openFilesystemBrowserDialog` declares for it, and the
  //         largest single step this case runs;
  //   20s — the images screen opens and the image's row appears: `chooseImageRowAnalysis`'s wait;
  //   20s — the tree's first row, once the extraction is done: the same helper's wait;
  //   10s — the single-layer image is on the daemon: `ensureImage`, which builds it when it is not;
  //   10s — the menu gesture, the cost warning, the measurement pass and the dismissal.
  test.setTimeout(120_000);
  const dialog = await openFilesystemBrowserDialog(page);
  const viewport = page.viewportSize();
  expect(viewport, 'this run has no viewport size to measure the bound against').not.toBeNull();

  const boxes = await measureOpenDialog(page, '.ui-modal');
  expectSizedByItsContentInHeight(
    'Images & layers → Browse filesystem, a short filesystem',
    boxes,
    (viewport as { height: number }).height,
  );
  expectCardIsTheSizeOfItsContent('Images & layers → Browse filesystem, a short filesystem', boxes);

  await dismissThroughTheScrim(page, dialog);
});

test.describe('at a phone-width viewport', () => {
  // Where the screen, rather than the designed width, is what limits the dialog (REQ-9).
  test.use({ viewport: { width: 390, height: 844 } });

  // REQ-1, REQ-2, REQ-9, REQ-18 — bounded by the screen, the card and the content still agree, the
  // dialog keeps its clearance from the edges and nothing runs off the side.
  test('an ordinary dialog still fits its card exactly and stays inside the screen', async ({ page }) => {
    const dialog = await openCreateContextDialog(page);

    const boxes = await measureOpenDialog(page, '.ui-modal');
    expectCardIsTheSizeOfItsContent('Contexts → Create context, phone width', boxes);
    expectInsideTheViewport('Contexts → Create context, phone width', boxes);
    expect
      .soft(boxes.card.width, `a screen-bounded dialog is narrower than its designed width: measured ${boxes.card.width.toFixed(1)}px`)
      .toBeLessThan(ORDINARY_DIALOG_WIDTH);

    await cancelDialog(dialog);
  });

  // REQ-1, REQ-2, REQ-9, REQ-18 — the same for the large format, which on a phone-width screen is
  // bounded by the viewport rather than by its 1100px.
  test('a large dialog still fits its card exactly and stays inside the screen', async ({ page }) => {
    const dialog = await openLayerExplorerDialog(page);

    const boxes = await measureOpenDialog(page, '.ui-modal');
    expectCardIsTheSizeOfItsContent('Images & layers → Explore layers, phone width', boxes);
    expectInsideTheViewport('Images & layers → Explore layers, phone width', boxes);

    await dismissThroughTheScrim(page, dialog);
  });

  // detail_modal/REQ-18, REQ-19 — the container detail at the width where the screen bounds it: the
  // card still agrees with its content and stays inside the screen.
  test('the container detail still fits its card exactly and stays inside the screen', async ({ page }) => {
    const name = `vexel-e2e-dialog-detail-phone-${Date.now()}`;
    await createDetailFixture(name);
    try {
      await openContainerDetailDialog(page, name);

      const boxes = await measureOpenDialog(page, '.ui-modal');
      expectCardIsTheSizeOfItsContent('Containers → container detail, phone width', boxes);
      expectInsideTheViewport('Containers → container detail, phone width', boxes);

      await dismissContainerDetailByScrim(page);
    } finally {
      await removeDetailFixture(name);
    }
  });

  // REQ-1, REQ-2, REQ-9 — the re-laid-out large dialog at the width where the screen, and not its
  // designed width, is what bounds it: the panes stack there, and the card still agrees with its
  // content and stays inside the screen.
  test('the filesystem browser still fits its card exactly and stays inside the screen', async ({ page }) => {
    // 120s = 60 + 20 + 20 + 10 + 10 (REQ-64, REQ-65):
    //   60s — the extraction: the ceiling `openFilesystemBrowserDialog` declares for it, and the
    //         largest single step this case runs;
    //   20s — the images screen opens and the image's row appears: `chooseImageRowAnalysis`'s wait;
    //   20s — the tree's first row, once the extraction is done: the same helper's wait;
    //   10s — the single-layer image is on the daemon: `ensureImage`, which builds it when it is not;
    //   10s — the menu gesture, the cost warning, the measurement pass and the dismissal.
    test.setTimeout(120_000);
    const dialog = await openFilesystemBrowserDialog(page);

    const boxes = await measureOpenDialog(page, '.ui-modal');
    expectCardIsTheSizeOfItsContent('Images & layers → Browse filesystem, phone width', boxes);
    expectInsideTheViewport('Images & layers → Browse filesystem, phone width', boxes);

    await dismissThroughTheScrim(page, dialog);
  });
});

// REQ-13 — the sheet-style form surface positions itself independently of the shared dialog
// positioner: it is measured against both failure modes, and is expected to agree before and after
// the correction of the shared surface.
test('the glass card of the form sheet is exactly the size of the sheet it holds', async ({ page }) => {
  const sheet = await openCreateContainerSheet(page);

  const boxes = await measureOpenDialog(page, '.ui-form-sheet');
  expectCardIsTheSizeOfItsContent('Containers → Run container', boxes);

  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toBeHidden();
});

/**
 * Opens Images & layers → Compare with… on the suite's own single-layer image: the third instance of
 * the `large` format, measured **before** a comparison is asked for. That state is the discriminating
 * one — two pick-lists and a line of copy is content nowhere near the format's viewport bound, so a
 * card measuring that bound could only be taking the height available rather than its content's.
 */
async function openImageDiffDialog(page: Page): Promise<Locator> {
  await ensureImage(TINY_IMAGE);
  await chooseImageRowAnalysis(page, TINY_IMAGE, 'Compare with…');
  const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: 'Compare filesystems' }) });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByLabel('Second image')).toBeVisible();
  return dialog;
}

/**
 * Opens Images & layers → Efficiency & signals… on the same image, likewise **before** the analysis
 * it invites: the fourth instance of the format, and short content for the same reason.
 */
async function openLayerEfficiencyDialog(page: Page): Promise<Locator> {
  await ensureImage(TINY_IMAGE);
  await chooseImageRowAnalysis(page, TINY_IMAGE, 'Efficiency & signals…');
  const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: /^Efficiency & signals/ }) });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole('button', { name: 'Analyze layer efficiency…' })).toBeVisible();
  return dialog;
}

// tabs_composition_refactor/REQ-5, and dialog_sizing/REQ-1, REQ-2, REQ-8, REQ-10 — the image diff is
// one of the four large dialogs that ask for **no** stable height: it is still the size its content
// makes it, in height as in width, now that the opt-in exists beside it.
test('the image diff dialog is still sized by its own content, in height as in width', async ({ page }) => {
  const dialog = await openImageDiffDialog(page);

  const boxes = await measureOpenDialog(page, '.ui-modal');
  expectCardIsTheSizeOfItsContent('Images & layers → Compare filesystems', boxes);
  expectDesignedWidth('Images & layers → Compare filesystems', boxes, largeDialogWidth(boxes.viewportWidth));
  expectSizedByItsContentInHeight('Images & layers → Compare filesystems', boxes, page.viewportSize()!.height);

  await dismissThroughTheScrim(page, dialog);
});

// tabs_composition_refactor/REQ-5, and dialog_sizing/REQ-1, REQ-2, REQ-8, REQ-10 — the same for the
// layer efficiency view, the fourth of them.
test('the layer efficiency dialog is still sized by its own content, in height as in width', async ({ page }) => {
  const dialog = await openLayerEfficiencyDialog(page);

  const boxes = await measureOpenDialog(page, '.ui-modal');
  expectCardIsTheSizeOfItsContent('Images & layers → Efficiency & signals', boxes);
  expectDesignedWidth('Images & layers → Efficiency & signals', boxes, largeDialogWidth(boxes.viewportWidth));
  expectSizedByItsContentInHeight('Images & layers → Efficiency & signals', boxes, page.viewportSize()!.height);

  await dismissThroughTheScrim(page, dialog);
});
