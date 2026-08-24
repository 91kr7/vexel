/**
 * F6 — volumes and networks are listed and revealed like every other object
 * (`plan-ui-coherence-optimisation/REQ-31` … `REQ-35`).
 *
 * The delivered screen put both lists in a `1fr 1fr` grid and expanded a row's
 * inspect surface **inside that half-width card**, so the property values wrapped
 * mid-hash and the `RAW PAYLOAD` block was rendered into a column of its
 * leftover. The two panels also opened independently, giving the screen two
 * parallel long scrolls.
 *
 * Everything asserted here is therefore **geometry**, per CLAUDE.md ("What a
 * check drives, and what it measures") and REQ-89: a panel confined to half the
 * screen keeps every character it had, so a content assertion reports nothing.
 * What the defect moves is boxes — the panel's width, the payload's width, the
 * cards' x — and boxes are what is measured. Every interaction is a **real
 * pointer** at the visible cell's own coordinates (REQ-88), never
 * `element.click()` and never a dispatched event.
 *
 * The three viewports are the plan's own: 1440×1000, 1280×800 and 375×812.
 *
 * Each test creates its own volume and network, labelled, and removes them in a
 * `finally`; nothing assumes an empty daemon — every assertion is about the
 * fixture's own row or about the screen's regions, never about a total.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { readOnceSettled } from './support/settled.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';

interface Viewport {
  width: number;
  height: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The three viewports this plan is stated at. */
const VIEWPORTS: Viewport[] = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
];

/**
 * The share of the content column a revealed panel must exceed.
 *
 * Not a round number picked for comfort: the constraint REQ-32 names is the
 * panel confined to one of two columns, which the batch measured at **482px of a
 * 1120px content column** (43%) at 1440×1000 and 402 of 960 (42%) at 1280×800.
 * A half-width panel is the failure, so anything at or below one half is refused
 * and the margin above it is where the requirement is actually met.
 */
const MINIMUM_SHARE_OF_THE_CONTENT_COLUMN = 0.6;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function describeBox(box: Box): string {
  return `x=${round(box.x)}, y=${round(box.y)}, ${round(box.width)}×${round(box.height)}`;
}

async function createVolume(name: string): Promise<void> {
  await execFileAsync('docker', ['volume', 'create', ...ownershipArgs('volumes-networks-reveal'), name]);
}

async function removeVolumeQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['volume', 'rm', '-f', name]).catch(() => undefined);
}

async function createNetwork(name: string, extraArgs: string[] = []): Promise<void> {
  await execFileAsync('docker', ['network', 'create', ...ownershipArgs('volumes-networks-reveal'), ...extraArgs, name]);
}

async function removeNetworkQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['network', 'rm', '-f', name]).catch(() => undefined);
}

/**
 * The panel a list is drawn in, named by the section header above it.
 *
 * The innermost region carrying both the heading and the list: the header sits
 * **above** the list's card rather than inside it
 * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`),
 * so the card can no longer be found by the title it used to hold.
 */
function panel(page: Page, title: 'Volumes' | 'Networks'): Locator {
  return page
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: title }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

function row(page: Page, title: 'Volumes' | 'Networks', name: string): Locator {
  return panel(page, title).locator('.ui-data-table__row', { hasText: name }).first();
}

/**
 * Opens a row's detail with a **real pointer on its first cell**.
 *
 * The cell rather than the row: below the desktop breakpoint the row is wider
 * than the box it is read in, so the row's own centre can sit over the action
 * cluster, and a click that lands on `Remove` is not the gesture under test.
 */
async function revealDetail(rowLocator: Locator): Promise<void> {
  await rowLocator.locator('.ui-data-table__cell').first().click();
}

async function openScreen(page: Page, viewport: Viewport): Promise<void> {
  await page.setViewportSize(viewport);
  await openApp(page, 'volumes-networks');
  await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible({ timeout: 20_000 });
}

/** The boxes this file is written about, read in one pass so no two come from two layouts. */
/**
 * The reveal's geometry, **once the layout has come to rest**: the panel this
 * measures is opened by a click and fills from a daemon read, so the pass below
 * — which is what stops two figures coming from two frames — is not on its own
 * what stops the whole reading coming from a frame nobody sees
 * (`support/settled.ts`).
 */
async function measureReveal(page: Page, title: 'Volumes' | 'Networks'): Promise<{
  content: Box;
  contentColumnWidth: number;
  card: Box;
  table: Box;
  tableClientWidth: number;
  panel: Box;
  payload: Box | null;
  values: { label: string; textAlign: string; box: Box; lines: number; clipped: boolean }[];
}> {
  return await readOnceSettled(
    page,
    () => measureRevealThisFrame(page, title),
    (previous, current) => JSON.stringify(previous) === JSON.stringify(current),
  );
}

/** **One frame, and no test calls it**: the reader above is built out of it. */
async function measureRevealThisFrame(page: Page, title: 'Volumes' | 'Networks'): Promise<{
  content: Box;
  contentColumnWidth: number;
  card: Box;
  table: Box;
  tableClientWidth: number;
  panel: Box;
  payload: Box | null;
  values: { label: string; textAlign: string; box: Box; lines: number; clipped: boolean }[];
}> {
  return await panel(page, title).evaluate((cardElement) => {
    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const content = document.querySelector('.ui-frame__content')!;
    // The content **column**, not the region: the shell's own padding is not
    // width the screen has to lay anything out in, and the figures this batch
    // reports (1120px at 1440×1000) are the column's.
    const contentStyle = getComputedStyle(content);
    const contentColumnWidth =
      (content as HTMLElement).clientWidth - Number.parseFloat(contentStyle.paddingLeft) - Number.parseFloat(contentStyle.paddingRight);
    const table = cardElement.querySelector('.ui-data-table')!;
    const detail = cardElement.querySelector('.ui-detail-panel')!;
    const payload = detail.querySelector('.ui-code-viewer');
    const range = document.createRange();
    const linesOf = (element: Element): number => {
      const tops: number[] = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.nodeValue?.trim()) continue;
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          if (!tops.some((top) => Math.abs(top - rect.top) <= 1)) tops.push(rect.top);
        }
      }
      return Math.max(1, tops.length);
    };
    return {
      content: box(content),
      contentColumnWidth,
      card: box(cardElement),
      table: box(table),
      tableClientWidth: (table as HTMLElement).clientWidth,
      panel: box(detail),
      payload: payload ? box(payload) : null,
      values: Array.from(detail.querySelectorAll('.ui-definition-list__row')).map((band) => {
        const value = band.querySelector('.ui-definition-list__value')!;
        return {
          label: band.querySelector('.ui-definition-list__label')?.textContent?.trim() ?? '(no label)',
          textAlign: getComputedStyle(value).textAlign,
          box: box(value),
          lines: linesOf(value),
          clipped: value.scrollWidth > value.clientWidth + 1,
        };
      }),
    };
  });
}

// REQ-31, REQ-32 — the detail is revealed at the full width of the screen's content column, and the
// raw payload block gets that width with it rather than a card column's leftover.
for (const viewport of VIEWPORTS) {
  const at = `${viewport.width}×${viewport.height}`;

  test(`a volume's detail and its raw payload take the content column's width at ${at}`, async ({ page }) => {
    test.setTimeout(120_000);
    const volume = `vexel-e2e-reveal-vol-${Date.now()}`;

    try {
      await createVolume(volume);
      await openScreen(page, viewport);
      const volumeRow = row(page, 'Volumes', volume);
      await expect(volumeRow, 'the fixture volume never appeared in the list').toBeVisible({ timeout: 20_000 });

      await revealDetail(volumeRow);
      await expect(panel(page, 'Volumes').locator('.ui-detail-panel')).toBeVisible({ timeout: 20_000 });
      await expect(panel(page, 'Volumes').locator('.ui-code-viewer')).toBeVisible({ timeout: 20_000 });

      const measured = await measureReveal(page, 'Volumes');
      console.log(
        `[REQ-32] @${at} volumes: content column ${round(measured.contentColumnWidth)}px, card ${describeBox(measured.card)}, ` +
          `list region ${round(measured.tableClientWidth)}px visible, panel ${describeBox(measured.panel)}, ` +
          `raw payload ${measured.payload ? describeBox(measured.payload) : 'none'}`,
      );

      // The card the list is drawn in fills the content column: neither list is confined to a
      // column of half the screen (volumes-networks-screen.md).
      expect(
        round(measured.card.width),
        `@${at}: the Volumes card is ${round(measured.card.width)}px of a ${round(measured.contentColumnWidth)}px content column, so the list is still confined to a column (REQ-32)`,
      ).toBeGreaterThanOrEqual(round(measured.contentColumnWidth) - 1);

      // …and the panel with it. The share is what the delivered constraint fails: 482 of 1120.
      const share = measured.panel.width / measured.contentColumnWidth;
      expect(
        round(share * 100),
        `@${at}: the revealed panel is ${round(measured.panel.width)}px of a ${round(measured.contentColumnWidth)}px content column (${round(share * 100)}%), which is the half-width column REQ-32 removes`,
      ).toBeGreaterThan(MINIMUM_SHARE_OF_THE_CONTENT_COLUMN * 100);

      // The panel is the width of the box the list is read in, less that box's own inset — never
      // narrower than the region it sits in (detail-panel.md, data-table.md).
      expect(
        round(measured.panel.width),
        `@${at}: the panel is ${round(measured.panel.width)}px inside a list region of ${round(measured.tableClientWidth)}px, so it narrows itself`,
      ).toBeGreaterThanOrEqual(round(measured.tableClientWidth) - 48);

      // REQ-23 — "a raw payload block inside it gets the panel's full width, never ~250px".
      expect(measured.payload, `@${at}: the volume's panel drew no raw payload block`).not.toBeNull();
      expect(
        round(measured.payload!.width),
        `@${at}: the raw payload is ${round(measured.payload!.width)}px inside a ${round(measured.panel.width)}px panel, so it does not get the panel's width (REQ-32)`,
      ).toBeGreaterThanOrEqual(round(measured.panel.width) - 8);

      // The delivered build measured the `Mountpoint` and `Options` values **0px wide** at 375×812.
      // A value with no width keeps every character it has, which is why this is a box assertion.
      for (const value of measured.values) {
        expect(
          round(value.box.width),
          `@${at}: the \`${value.label}\` value is ${round(value.box.width)}px wide — the value is in the DOM at no width (REQ-32)`,
        ).toBeGreaterThan(0);
        expect(
          value.clipped,
          `@${at}: the \`${value.label}\` value is clipped at its own box's width (REQ-20)`,
        ).toBe(false);
      }
    } finally {
      await removeVolumeQuietly(volume);
    }
  });

  test(`a network's detail and its raw payload take the content column's width at ${at}`, async ({ page }) => {
    test.setTimeout(120_000);
    const network = `vexel-e2e-reveal-net-${Date.now()}`;

    try {
      await createNetwork(network, ['--subnet', '10.199.40.0/24', '--gateway', '10.199.40.1']);
      await openScreen(page, viewport);
      const networkRow = row(page, 'Networks', network);
      await expect(networkRow, 'the fixture network never appeared in the list').toBeVisible({ timeout: 20_000 });

      await revealDetail(networkRow);
      await expect(panel(page, 'Networks').locator('.ui-detail-panel')).toBeVisible({ timeout: 20_000 });
      await expect(panel(page, 'Networks').locator('.ui-code-viewer')).toBeVisible({ timeout: 20_000 });

      const measured = await measureReveal(page, 'Networks');
      console.log(
        `[REQ-32] @${at} networks: content column ${round(measured.contentColumnWidth)}px, card ${describeBox(measured.card)}, ` +
          `list region ${round(measured.tableClientWidth)}px visible, panel ${describeBox(measured.panel)}, ` +
          `raw payload ${measured.payload ? describeBox(measured.payload) : 'none'}`,
      );

      expect(
        round(measured.card.width),
        `@${at}: the Networks card is ${round(measured.card.width)}px of a ${round(measured.contentColumnWidth)}px content column, so the list is still confined to a column (REQ-32)`,
      ).toBeGreaterThanOrEqual(round(measured.contentColumnWidth) - 1);

      const share = measured.panel.width / measured.contentColumnWidth;
      expect(
        round(share * 100),
        `@${at}: the revealed panel is ${round(measured.panel.width)}px of a ${round(measured.contentColumnWidth)}px content column (${round(share * 100)}%), which is the half-width column REQ-32 removes`,
      ).toBeGreaterThan(MINIMUM_SHARE_OF_THE_CONTENT_COLUMN * 100);

      expect(measured.payload, `@${at}: the network's panel drew no raw payload block`).not.toBeNull();
      expect(
        round(measured.payload!.width),
        `@${at}: the raw payload is ${round(measured.payload!.width)}px inside a ${round(measured.panel.width)}px panel, so it does not get the panel's width (REQ-32)`,
      ).toBeGreaterThanOrEqual(round(measured.panel.width) - 8);

      // REQ-34 — the value that first showed the defect, and every other value beside it.
      const options = measured.values.find((value) => value.label === 'Options');
      expect(options, `@${at}: the network's panel presents no \`Options\` band`).toBeDefined();
      console.log(
        `[REQ-34] @${at} networks: ${measured.values
          .map((value) => `${value.label} text-align:${value.textAlign} ${round(value.box.width)}px over ${value.lines} line(s)`)
          .join(', ')}`,
      );
      for (const value of measured.values) {
        expect(
          value.textAlign,
          `@${at}: the \`${value.label}\` value computes text-align: ${value.textAlign}, and no value on this screen is right-aligned (REQ-34)`,
        ).not.toBe('right');
        expect(
          ['start', 'left'],
          `@${at}: the \`${value.label}\` value computes text-align: ${value.textAlign} rather than being left-aligned (REQ-34)`,
        ).toContain(value.textAlign);
        expect(
          round(value.box.width),
          `@${at}: the \`${value.label}\` value is ${round(value.box.width)}px wide — the value is in the DOM at no width (REQ-32)`,
        ).toBeGreaterThan(0);
      }
    } finally {
      await removeNetworkQuietly(network);
    }
  });
}

// REQ-33, REQ-24 — at most one detail panel is open anywhere on this screen, in both directions.
// The guarantee is the detail panel's, not the stacking's: the two lists are sibling components with
// independent state that this screen does not hold, so the only route from a click in one card to
// the other card's selection is the primitive calling that panel's own `onClose`.
test('opening a detail in one list closes the one open in the other, in both directions', async ({ page }) => {
  test.setTimeout(180_000);
  const volume = `vexel-e2e-oneopen-vol-${Date.now()}`;
  const network = `vexel-e2e-oneopen-net-${Date.now()}`;

  try {
    await createVolume(volume);
    await createNetwork(network);
    await openScreen(page, VIEWPORTS[0]!);

    const volumeRow = row(page, 'Volumes', volume);
    const networkRow = row(page, 'Networks', network);
    await expect(volumeRow, 'the fixture volume never appeared in the list').toBeVisible({ timeout: 20_000 });
    await expect(networkRow, 'the fixture network never appeared in the list').toBeVisible({ timeout: 20_000 });

    const state = async () => ({
      panelsAnywhere: await page.locator('.ui-detail-panel').count(),
      volumePanels: await panel(page, 'Volumes').locator('.ui-detail-panel').count(),
      networkPanels: await panel(page, 'Networks').locator('.ui-detail-panel').count(),
      volumeSelected: await panel(page, 'Volumes').locator('.ui-data-table__row[aria-selected="true"]').count(),
      networkSelected: await panel(page, 'Networks').locator('.ui-data-table__row[aria-selected="true"]').count(),
    });

    await revealDetail(volumeRow);
    await expect(panel(page, 'Volumes').locator('.ui-detail-panel')).toBeVisible({ timeout: 20_000 });
    const afterVolume = await state();
    console.log(`[REQ-33] after the volume row: ${JSON.stringify(afterVolume)}`);
    expect(afterVolume, 'a volume row opened something other than exactly one panel, on its own list').toEqual({
      panelsAnywhere: 1,
      volumePanels: 1,
      networkPanels: 0,
      volumeSelected: 1,
      networkSelected: 0,
    });

    await revealDetail(networkRow);
    await expect(panel(page, 'Networks').locator('.ui-detail-panel')).toBeVisible({ timeout: 20_000 });
    await expect(
      panel(page, 'Volumes').locator('.ui-detail-panel'),
      "the volume's panel is still open beside the network's — the screen presents two parallel long scrolls (REQ-33)",
    ).toHaveCount(0, { timeout: 10_000 });
    const afterNetwork = await state();
    console.log(`[REQ-33] then the network row: ${JSON.stringify(afterNetwork)}`);
    expect(afterNetwork, 'opening the network detail left the volume list holding a selection it no longer shows').toEqual({
      panelsAnywhere: 1,
      volumePanels: 0,
      networkPanels: 1,
      volumeSelected: 0,
      networkSelected: 1,
    });

    // …and symmetrically back, so the guarantee is not one list deferring to the other.
    await revealDetail(volumeRow);
    await expect(panel(page, 'Volumes').locator('.ui-detail-panel')).toBeVisible({ timeout: 20_000 });
    await expect(
      panel(page, 'Networks').locator('.ui-detail-panel'),
      "the network's panel is still open beside the volume's (REQ-33)",
    ).toHaveCount(0, { timeout: 10_000 });
    const backToVolume = await state();
    console.log(`[REQ-33] and back to the volume row: ${JSON.stringify(backToVolume)}`);
    expect(backToVolume, 'the guarantee does not hold in the other direction').toEqual({
      panelsAnywhere: 1,
      volumePanels: 1,
      networkPanels: 0,
      volumeSelected: 1,
      networkSelected: 0,
    });
  } finally {
    await removeNetworkQuietly(network);
    await removeVolumeQuietly(volume);
  }
});

// REQ-34 — no value on this screen is right-aligned, the volume panel's included: the declaration
// held on every property value in the product and was live only where a value wrapped.
test('no property value on either panel is right-aligned', async ({ page }) => {
  test.setTimeout(180_000);
  const volume = `vexel-e2e-align-vol-${Date.now()}`;
  const network = `vexel-e2e-align-net-${Date.now()}`;

  try {
    await createVolume(volume);
    await createNetwork(network, ['--subnet', '10.199.41.0/24', '--gateway', '10.199.41.1']);

    for (const viewport of VIEWPORTS) {
      await openScreen(page, viewport);
      await revealDetail(row(page, 'Volumes', volume));
      await expect(panel(page, 'Volumes').locator('.ui-detail-panel .ui-definition-list')).toBeVisible({ timeout: 20_000 });

      const aligned = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.ui-definition-list__row')).map((band) => ({
          label: band.querySelector('.ui-definition-list__label')?.textContent?.trim() ?? '(no label)',
          textAlign: getComputedStyle(band.querySelector('.ui-definition-list__value')!).textAlign,
        })),
      );
      const at = `${viewport.width}×${viewport.height}`;
      console.log(`[REQ-34] @${at} volumes: ${aligned.map((value) => `${value.label}:${value.textAlign}`).join(', ')}`);

      expect(aligned.length, `@${at}: the volume's panel presents no property band to check`).toBeGreaterThan(0);
      expect(
        aligned.filter((value) => value.textAlign === 'right').map((value) => value.label),
        `@${at}: a value on this screen still computes text-align: right (REQ-34)`,
      ).toEqual([]);
    }
  } finally {
    await removeNetworkQuietly(network);
    await removeVolumeQuietly(volume);
  }
});

// REQ-35 — row-level actions are in the row. Asserted as boxes rather than as presence: an action
// cluster rendered inside a header, or below the row it belongs to, still holds every label it had.
test("each list's row-level actions are drawn inside the row they belong to", async ({ page }) => {
  test.setTimeout(180_000);
  const volume = `vexel-e2e-rowactions-vol-${Date.now()}`;
  const network = `vexel-e2e-rowactions-net-${Date.now()}`;

  try {
    await createVolume(volume);
    await createNetwork(network);
    await openScreen(page, VIEWPORTS[0]!);

    for (const [title, name, labels] of [
      ['Volumes', volume, ['Remove']],
      ['Networks', network, ['Attach…', 'Remove']],
    ] as const) {
      const listRow = row(page, title, name);
      await expect(listRow, `the fixture ${title.toLowerCase()} row never appeared`).toBeVisible({ timeout: 20_000 });

      for (const label of labels) {
        const control = listRow.getByRole('button', { name: label, exact: true });
        await expect(control, `the ${title} row offers no \`${label}\` control of its own (REQ-35)`).toBeVisible();
        const inside = await control.evaluate((element) => {
          const rowElement = element.closest('.ui-data-table__row')!;
          const rowBox = rowElement.getBoundingClientRect();
          const box = element.getBoundingClientRect();
          return {
            inside:
              box.left >= rowBox.left - 1 &&
              box.right <= rowBox.right + 1 &&
              box.top >= rowBox.top - 1 &&
              box.bottom <= rowBox.bottom + 1,
            control: { x: box.x, y: box.y, width: box.width, height: box.height },
            row: { x: rowBox.x, y: rowBox.y, width: rowBox.width, height: rowBox.height },
          };
        });
        console.log(`[REQ-35] ${title} \`${label}\`: ${describeBox(inside.control)} inside row ${describeBox(inside.row)}`);
        expect(
          inside.inside,
          `${title}: the \`${label}\` control is drawn at ${describeBox(inside.control)}, outside the row's own box ${describeBox(inside.row)} (REQ-35)`,
        ).toBe(true);
      }

      // The page-level actions sit in the toolbar under the section header, and the header itself
      // carries none: the per-card header action buttons are what REQ-35 removes.
      const header = panel(page, title).locator('.ui-section-header').first();
      await expect(header.getByRole('button'), `the ${title} section header still carries an action of its own (REQ-35)`).toHaveCount(0);
      await expect(
        panel(page, title).locator('.ui-screen-toolbar').getByRole('button', { name: 'Prune', exact: true }),
        `the ${title} panel offers no Prune in its toolbar (REQ-35)`,
      ).toBeVisible();
    }

    // …and the destructive one still confirms, driven with a real pointer and then cancelled, so the
    // check performs nothing on the daemon.
    await row(page, 'Volumes', volume).getByRole('button', { name: 'Remove', exact: true }).click();
    const confirmHeading = page.getByRole('heading', { name: `Confirm: ${volume}` });
    await expect(confirmHeading, 'the row-level Remove no longer asks for confirmation (REQ-35)').toBeVisible({ timeout: 10_000 });
    await page.locator('.ui-modal').filter({ has: confirmHeading }).getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmHeading).toBeHidden();
    await expect(row(page, 'Volumes', volume), 'cancelling the confirmation removed the volume anyway').toBeVisible();
  } finally {
    await removeNetworkQuietly(network);
    await removeVolumeQuietly(volume);
  }
});

// REQ-31, and the object list's own contract at the width the delivered build failed at: the lists
// are full width, no column resolves to nothing, and the table pans to reach the columns it cannot
// fit (data-table.md).
test('at 375×812 the lists are full width, no column resolves to nothing, and the table pans to reach every column', async ({ page }) => {
  test.setTimeout(180_000);
  const volume = `vexel-e2e-phone-vol-${Date.now()}`;
  const network = `vexel-e2e-phone-net-${Date.now()}`;

  try {
    await createVolume(volume);
    await createNetwork(network);
    await openScreen(page, { width: 375, height: 812 });

    const cards = await page.evaluate(() => {
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      const content = document.querySelector('.ui-frame__content')!;
      const contentStyle = getComputedStyle(content);
      const contentColumnWidth =
        (content as HTMLElement).clientWidth - Number.parseFloat(contentStyle.paddingLeft) - Number.parseFloat(contentStyle.paddingRight);
      const headings = Array.from(document.querySelectorAll('.ui-section-header__title'));
      // The panel a heading names, which is the box the screen lays out: its
      // section header sits **above** the list's own card rather than inside it
      // (`.../classic-table/REQ-40`), so it is the innermost region holding both
      // the heading and the list.
      const panelOf = (title: string) => {
        const heading = headings.find((candidate) => candidate.textContent?.trim() === title) ?? null;
        for (let node = heading?.parentElement ?? null; node !== null; node = node.parentElement) {
          if (node.querySelector('.ui-data-table') !== null) return node;
        }
        return null;
      };
      const cardOf = (title: string) => panelOf(title);
      const volumes = cardOf('Volumes');
      const networks = cardOf('Networks');
      return {
        content: box(content),
        contentColumnWidth,
        volumes: volumes ? box(volumes) : null,
        networks: networks ? box(networks) : null,
      };
    });

    console.log(
      `[REQ-32] @375×812 stacked: content column ${round(cards.contentColumnWidth)}px, Volumes card ${cards.volumes ? describeBox(cards.volumes) : 'none'}, ` +
        `Networks card ${cards.networks ? describeBox(cards.networks) : 'none'}`,
    );
    expect(cards.volumes, 'the Volumes card was not found').not.toBeNull();
    expect(cards.networks, 'the Networks card was not found').not.toBeNull();
    // Stacked, not paired: same left edge, same width, the second below the first.
    expect(round(cards.networks!.x), 'the two lists are not on the same left edge, so they are still side by side').toBe(round(cards.volumes!.x));
    expect(round(cards.networks!.width), 'the two lists do not share one width').toBe(round(cards.volumes!.width));
    expect(cards.networks!.y, 'the Networks card is not below the Volumes card').toBeGreaterThan(cards.volumes!.y);
    expect(
      round(cards.volumes!.width),
      `@375×812: the Volumes card is ${round(cards.volumes!.width)}px of a ${round(cards.contentColumnWidth)}px content column`,
    ).toBeGreaterThanOrEqual(round(cards.contentColumnWidth) - 1);

    for (const [title, name] of [
      ['Volumes', volume],
      ['Networks', network],
    ] as const) {
      const listRow = row(page, title, name);
      await expect(listRow, `the fixture ${title.toLowerCase()} row never appeared`).toBeVisible({ timeout: 20_000 });

      const geometry = await listRow.evaluate((rowElement) => {
        const table = rowElement.closest('.ui-data-table') as HTMLElement;
        const computed = getComputedStyle(rowElement).gridTemplateColumns;
        return {
          computed,
          tracks: computed.split(' ').map((track) => Number.parseFloat(track)),
          cells: Array.from(rowElement.querySelectorAll('.ui-data-table__cell')).map((cell) => cell.getBoundingClientRect().width),
          scrollWidth: table.scrollWidth,
          clientWidth: table.clientWidth,
        };
      });
      console.log(
        `[REQ-31] @375×812 ${title}: tracks ${geometry.computed} — list region ${geometry.scrollWidth}px of content in ${geometry.clientWidth}px`,
      );

      expect(
        geometry.tracks.filter((track) => track <= 0),
        `@375×812 the ${title} row resolves ${geometry.tracks.filter((track) => track <= 0).length} of its ${geometry.tracks.length} tracks to nothing — computed ${geometry.computed}`,
      ).toEqual([]);
      expect(
        geometry.cells.filter((width) => width <= 0),
        `@375×812 a ${title} cell is drawn at no width, so its content is in the DOM and nowhere on screen`,
      ).toEqual([]);
      expect(
        geometry.scrollWidth,
        `@375×812 the ${title} list holds ${geometry.scrollWidth}px of row in ${geometry.clientWidth}px and offers no pan: the columns it cannot fit are clipped away`,
      ).toBeGreaterThan(geometry.clientWidth);

      // The pan takes and holds a value, and the last column lands inside the visible box.
      const panned = await listRow.evaluate((rowElement) => {
        const table = rowElement.closest('.ui-data-table') as HTMLElement;
        table.scrollLeft = table.scrollWidth;
        const tableBox = table.getBoundingClientRect();
        const cells = Array.from(rowElement.querySelectorAll('.ui-data-table__cell'));
        const last = cells[cells.length - 1]!.getBoundingClientRect();
        return {
          scrollLeft: table.scrollLeft,
          lastInside: last.left >= tableBox.left - 1 && last.right <= tableBox.right + 1,
        };
      });
      console.log(`[REQ-31] @375×812 ${title}: pan reaches scrollLeft ${round(panned.scrollLeft)}, last column inside the region: ${panned.lastInside}`);
      expect(panned.scrollLeft, `@375×812 the ${title} list refuses to pan: scrollLeft stays at ${panned.scrollLeft}`).toBeGreaterThan(0);
      expect(panned.lastInside, `@375×812 the ${title} list's last column is not brought into view by the pan`).toBe(true);
    }
  } finally {
    await removeNetworkQuietly(network);
    await removeVolumeQuietly(volume);
  }
});
