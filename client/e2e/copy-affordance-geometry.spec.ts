import { expect, test, type Locator, type Page } from './support/test.js';
import { CASE_LABEL, OWNER_LABEL, RUN_ID, openApp, ownershipArgs } from './support/fixtures.js';
import { measureSection, report } from './support/property-bands.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { chooseFromRowOverflowMenu } from './support/row-overflow-menu.js';
import { ALPINE_IMAGE, TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * **What a removal breaks that a screenshot of the removal does not show.** REQ
 * ids belong to `plan-docker_management_app-remove_copy_controls`.
 *
 * A control leaving a container is a change of **geometry**, and the two ways it
 * goes wrong are both invisible to any assertion about presence or text: a
 * container left drawing padding, a border or its parent's gap with nothing in
 * it; and a neighbour that shifts or re-centres because a sibling left. So every
 * assertion here is a viewport box the browser reports — never a class, never a
 * prop, never a count of characters (CLAUDE.md, "a check that measures content
 * cannot detect a defect that moves position").
 *
 * **Every interaction is a real pointer at the visible control's own coordinates**
 * (REQ-27).
 *
 * **The delivered build's own figures**, measured by this spec before the removal
 * existed (2026-08-14, this environment): the image panel's `Id` band **43px**
 * against its neighbours' **33px**, purely because it held the control; a
 * `.ui-code-viewer__actions` row above every raw payload block; and an action row
 * drawn on the Compose log stream with nothing whatever in it.
 *
 * **bug-4 is asserted undisturbed, not re-tuned** (REQ-15). The minimum band
 * width derives from `Created`, the longest value, not from the `Id` band — so
 * the section becomes *shorter* and **no column count moves**. A count that
 * changed here would mean the fix went into the wrong component.
 *
 * Fixture discipline as everywhere else (REQ-35): own fixtures, ownership labels,
 * `docker rm -fv` in a `finally`, no assumption of an empty daemon, passing on
 * its own.
 */

/** The height the delivered build's `Id` band measured, and the height its neighbours measured. */
const DELIVERED_ID_BAND_PX = 43;
const DELIVERED_NEIGHBOUR_BAND_PX = 33;
/** Sub-pixel layout and font metrics differ by a fraction between runs; a band height is not a design token. */
const HEIGHT_TOLERANCE_PX = 1.5;
/**
 * The band's own label→value gap on the delivered build — `--space-4`, the same
 * on every band before this removal and after it.
 *
 * **Pinned to the number, and not only asserted uniform across the bands.** The
 * uniformity assertion below answers "was one band retuned", which is the shape
 * a fix patching the `Id` band alone would take; it cannot answer "was the gap
 * retuned everywhere", and a uniform 16px → 12px would satisfy it. That half was
 * settled for this batch by reading the diff — which works once, for whoever
 * happens to have the diff beside them, and this check outlives that reader. A
 * later change to `--space-4` is legitimate and will fail here; the failure names
 * the delivered figure so that its reader learns *what moved* rather than only
 * that something did.
 */
const DELIVERED_LABEL_TO_VALUE_GAP_PX = 16;

function imageRow(page: Page, text: string): Locator {
  return page.locator('.ui-data-table__row', { hasText: text }).first();
}

function propertySection(page: Page): Locator {
  return page.locator('.ui-detail-panel .ui-definition-list').first();
}

async function openImagePanel(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await ensureImage(ALPINE_IMAGE);
  await page.setViewportSize(viewport);
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 20_000 });
  await page.getByPlaceholder('Search reference or digest…').fill(ALPINE_IMAGE);
  const row = imageRow(page, ALPINE_IMAGE);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.locator('.ui-data-table__cell').first().click();
  await expect(propertySection(page)).toBeVisible({ timeout: 20_000 });
}

/**
 * The vertical space a code block's first child consumes above the scroll area
 * that holds the payload, **including the gap its parent puts after it**.
 *
 * This is the quantity REQ-11 is about, and it is not the same as "the row has
 * no height": an empty flex child still consumes its parent's `gap`, so a row of
 * zero height above six raw payload blocks would still push each of them down by
 * a gap. Measured as the distance from the block's own top edge to the top of its
 * scroll area, which is zero exactly when nothing is drawn there at all.
 */
async function deadSpaceAboveThePayload(block: Locator): Promise<number> {
  return block.evaluate((element) => {
    const scroller = element.querySelector('.ui-scroll-area');
    if (!scroller) throw new Error('the code block draws no scroll area, so its payload is not on screen');
    return scroller.getBoundingClientRect().top - element.getBoundingClientRect().top;
  });
}

// ─── REQ-14 · the band reaches its neighbours' height ────────────────────────

// REQ-14 — **the cheapest positive evidence that the control left the band rather than being
// relabelled inside it.** A band that merely lost its label would keep the 43px.
test('the image panel Id band measures the same height as its neighbours', async ({ page }) => {
  await openImagePanel(page, { width: 1920, height: 1080 });
  const geometry = await measureSection(propertySection(page), 'the image panel property section');
  const evidence = report('1920 × 1080', geometry);

  const idBand = geometry.bands.find((band) => band.label === 'Id');
  expect(idBand, `${evidence} — there is no \`Id\` band to measure`).toBeDefined();
  const neighbours = geometry.bands.filter((band) => band.label !== 'Id' && band.valueLines === 1 && band.labelLines === 1);
  expect(neighbours.length, `${evidence} — no single-line neighbour to compare the \`Id\` band against`).toBeGreaterThan(0);

  const neighbourHeights = neighbours.map((band) => band.box.height);
  const tallestNeighbour = Math.max(...neighbourHeights);
  console.log(
    `[REQ-14] Id band ${idBand!.box.height}px against neighbours [${neighbourHeights.join(', ')}]px — delivered build: ${DELIVERED_ID_BAND_PX}px against ${DELIVERED_NEIGHBOUR_BAND_PX}px`,
  );

  expect(
    Math.abs(idBand!.box.height - tallestNeighbour),
    `${evidence} — the \`Id\` band is ${idBand!.box.height}px against its neighbours' ${tallestNeighbour}px, so it still holds something they do not`,
  ).toBeLessThanOrEqual(HEIGHT_TOLERANCE_PX);

  // Stated against the delivered figure too, so a build that changed for some other reason cannot
  // pass this by making every band 43px.
  expect(
    idBand!.box.height,
    `${evidence} — the \`Id\` band still measures the delivered ${DELIVERED_ID_BAND_PX}px of a band holding a control`,
  ).toBeLessThan(DELIVERED_ID_BAND_PX - HEIGHT_TOLERANCE_PX);
});

// ─── REQ-11 · no empty action row above a raw payload ────────────────────────

// REQ-11 — the code viewer's action row held the control as its **only** child. A strip of dead
// space above every raw payload block on six sites is a visible defect introduced by a cosmetic fix.
test('no code block draws anything above its payload, and none consumes a gap for it', async ({ page }) => {
  await openImagePanel(page, { width: 1920, height: 1080 });
  const panel = page.locator('.ui-detail-panel');
  const blocks = panel.locator('.ui-code-viewer');
  await expect(blocks.first()).toBeVisible({ timeout: 20_000 });

  const count = await blocks.count();
  const measured: number[] = [];
  for (let index = 0; index < count; index += 1) {
    measured.push(await deadSpaceAboveThePayload(blocks.nth(index)));
  }
  console.log(`[REQ-11] dead space above each payload block: [${measured.join(', ')}]px`);

  expect(measured.filter((gap) => gap > 0.5), 'a code block still draws a strip above its payload, or consumes its parent\'s gap for one that is empty').toEqual([]);
  // And the row is not merely collapsed: it is not there.
  await expect(panel.locator('.ui-code-viewer__actions'), 'an action row survives inside a code block').toHaveCount(0);
});

// ─── REQ-12 · no action row at all on a stream that would have none ──────────

/**
 * REQ-12's case on this screen was a log stream offered **without** a download
 * filename — Compose with no project selected — whose action row would have had
 * no children and was therefore not drawn at all.
 *
 * **That site left the product with batch 11**
 * (`plan-ui-coherence-optimisation/REQ-50`): the stream now exists only inside a
 * project's own detail panel, so it always has a project to name its download
 * after, and with no project selected there is no stream at all. The component's
 * behaviour is unchanged and still contracted in `ui-library/specs/log-stream.md`
 * — "when it is not given the row has nothing to hold and is not rendered at
 * all" — and still checked, at the level it now lives at:
 * `test/unit/copy-affordance-contract.test.tsx`, "draws no action row at all when
 * no download file name is given".
 *
 * So what is asserted here is the half that still has a site: with no project
 * selected the screen draws **no stream whatever** (not an empty one, not a
 * stripped one), and once a project is selected the row is there, holds
 * `Download` alone, and `Download` sits at the row's own right edge.
 */
test('the compose log stream exists only inside a project’s panel, and its row holds only Download', async ({ page }) => {
  const caseName = 'geometry';
  const dir = await mkdtemp(join(tmpdir(), 'vexel-e2e-nocopy-geom-'));
  const projectName = `vexel-e2e-nocopy-geom-${RUN_ID}`;
  try {
    await ensureImage(ALPINE_IMAGE);
    const yaml = [
      'services:',
      '  web:',
      `    image: ${ALPINE_IMAGE}`,
      '    pull_policy: never',
      '    command: ["sh", "-c", "echo compose-line; sleep 300"]',
      '    labels:',
      `      - "${OWNER_LABEL}=${RUN_ID}"`,
      `      - "${CASE_LABEL}=${caseName}"`,
      '',
    ].join('\n');
    const filePath = join(dir, 'docker-compose.yml');
    await writeFile(filePath, yaml, 'utf8');
    await execFileAsync('docker', ['compose', '-f', filePath, '-p', projectName, 'up', '-d']);

    await openApp(page, 'compose');
    await expect(page.getByRole('heading', { level: 1, name: 'Compose' })).toBeVisible({ timeout: 20_000 });

    // No project selected: no stream at all, so no action row to draw wrong.
    const stream = page.locator('.ui-log-stream');
    await expect(page.locator('.ui-frame__content .ui-data-table__row').first()).toBeVisible({ timeout: 30_000 });
    console.log(`[REQ-12] compose, no project selected — ${await stream.count()} log stream(s) on screen`);
    expect(await stream.count(), 'a log stream is drawn on Compose with no project selected').toBe(0);

    // REQ-12, REQ-13 — inside the project's panel the filename *is* given, so the row is there,
    // holds `Download`, and `Download` sits where it does today: at the row's own right edge.
    // A project row is a **direct child** of the outer list's body: the carrier
    // surface each row used to be wrapped in went with the presentation it
    // belonged to
    // (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-3`).
    const row = page
      .locator('.ui-frame__content .ui-data-table__body')
      .first()
      .locator(':scope > .ui-data-table__row')
      .filter({ hasText: projectName });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.locator('.ui-data-table__cell').first().click();
    await page.locator('.ui-detail-panel').getByRole('tab', { name: 'Aggregated logs', exact: true }).click();

    // Measured, not counted: the row's first child starts at the row's own top edge, so nothing is
    // drawn above it and no gap is consumed for one that is empty.
    await expect(stream).toBeVisible({ timeout: 20_000 });
    const deadSpace = await stream.evaluate((element) => {
      const first = element.firstElementChild;
      if (!first) throw new Error('the log stream draws nothing at all');
      return { offset: first.getBoundingClientRect().top - element.getBoundingClientRect().top, className: first.className };
    });
    console.log(`[REQ-12] compose stream, a project selected — first child \`${deadSpace.className}\` at +${deadSpace.offset}px`);
    expect(deadSpace.offset, 'the compose log stream draws a strip above its first real child').toBeLessThanOrEqual(0.5);

    const actions = stream.locator('.ui-log-stream__actions');
    await expect(actions).toBeVisible({ timeout: 20_000 });
    const alignment = await actions.evaluate((element) => {
      const row = element.getBoundingClientRect();
      const buttons = Array.from(element.querySelectorAll('button')).map((button) => button.getBoundingClientRect());
      return { rowRight: row.right, count: buttons.length, lastRight: buttons.at(-1)?.right ?? Number.NaN };
    });
    expect(alignment.count, 'the compose stream action row holds a number of controls other than `Download` alone').toBe(1);
    expect(Math.abs(alignment.rowRight - alignment.lastRight), '`Download` no longer sits at the action row\'s right edge').toBeLessThanOrEqual(1);
  } finally {
    const containers = await execFileAsync('docker', ['ps', '-aq', '--filter', `label=com.docker.compose.project=${projectName}`]).catch(() => ({ stdout: '' }));
    const containerIds = containers.stdout.split('\n').filter((id) => id.length > 0);
    if (containerIds.length > 0) await execFileAsync('docker', ['rm', '-fv', ...containerIds]).catch(() => undefined);
    const networks = await execFileAsync('docker', ['network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${projectName}`]).catch(() => ({ stdout: '' }));
    const networkIds = networks.stdout.split('\n').filter((id) => id.length > 0);
    if (networkIds.length > 0) await execFileAsync('docker', ['network', 'rm', ...networkIds]).catch(() => undefined);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

// ─── REQ-13 · the containers that keep other children are unchanged ──────────

// REQ-13 — the property band's value box: the value now sits as a **single child**, and nothing
// about the band's own padding or its label→value gap moved because a sibling left.
//
// Measured as two quantities and not one, because they answer opposite questions. The label→value
// gap is an **unchanged** claim — it is the band's own `gap`, the same on every band before and
// after, and a fix that retuned it would show here. The value box's **height** is the changed one:
// on the delivered build the `Id` band's value box was the height of a control, 10px taller than
// every other value box in the section, and that is the difference the band's height was made of.
test('the property band value keeps its gap from the label, and is now the height of a value', async ({ page }) => {
  await openImagePanel(page, { width: 1920, height: 1080 });
  const geometry = await measureSection(propertySection(page), 'the image panel property section');
  const evidence = report('1920 × 1080', geometry);

  const measured = geometry.bands
    .filter((band) => band.valueBox && band.labelBox)
    .map((band) => ({ label: band.label, gap: band.valueBox!.left - band.labelBox!.right, height: band.valueBox!.height }));
  console.log(`[REQ-13] label→value gap / value height per band: ${measured.map((entry) => `${entry.label} ${Math.round(entry.gap)}px / ${Math.round(entry.height)}px`).join(', ')}`);

  // The band's own gap, identical on every band: the label→value run is unchanged.
  const gaps = measured.map((entry) => entry.gap);
  expect(
    Math.max(...gaps) - Math.min(...gaps),
    `${evidence} — the label→value gap is no longer the same on every band, so one band's own spacing was retuned`,
  ).toBeLessThanOrEqual(1);

  // And it is still the gap the delivered build drew, not merely a gap drawn consistently: the
  // uniformity above is satisfied by a retune applied to every band at once, which is the shape a
  // tidy-up takes.
  const offGap = measured.filter((entry) => Math.abs(entry.gap - DELIVERED_LABEL_TO_VALUE_GAP_PX) > 1);
  expect(
    offGap.map((entry) => `${entry.label} ${Math.round(entry.gap)}px`),
    `${evidence} — the label→value gap is no longer the delivered ${DELIVERED_LABEL_TO_VALUE_GAP_PX}px (\`--space-4\`) that every band drew before this removal and after it: these bands measure something else, so the band's own spacing was retuned across the section`,
  ).toEqual([]);

  // And the `Id` band's value is now a value like the others, not a value beside a control.
  const idHeight = measured.find((entry) => entry.label === 'Id')!.height;
  const others = measured.filter((entry) => entry.label !== 'Id').map((entry) => entry.height);
  expect(
    Math.abs(idHeight - Math.max(...others)),
    `${evidence} — the \`Id\` band's value box is ${idHeight}px against its neighbours' ${Math.max(...others)}px, so it still holds something they do not`,
  ).toBeLessThanOrEqual(HEIGHT_TOLERANCE_PX);

  // And the value is still inside its own band, with the label clear of it (bug-4's own invariants).
  expect(geometry.bands.filter((band) => !band.valueInsideBand).map((band) => band.label), `${evidence} — a value escaped its band`).toEqual([]);
  expect(geometry.bands.filter((band) => band.labelIntersectsValue).map((band) => band.label), `${evidence} — a label overlaps its value`).toEqual([]);
});

// REQ-13 — the console entry's action group keeps `Re-run` and its badges with their delivered
// spacing: nothing shifts sideways or re-centres because a sibling left.
test('the console entry action group keeps its badges and Re-run, right-aligned as delivered', async ({ page }) => {
  const marker = `vexel-e2e-nocopy-geom-console-${RUN_ID}`;
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openApp(page, 'raw-console');
  await expect(page.locator('.ui-frame__content').getByRole('heading', { name: 'Raw command & API console' })).toBeVisible({ timeout: 20_000 });

  const prompt = page.getByLabel('Console prompt');
  await prompt.fill(`docker ps --filter label=${marker}`);
  await prompt.press('Enter');
  const entry = page.locator('.ui-console-surface__entry').first();
  await expect(entry).toContainText('exit 0', { timeout: 30_000 });

  const measured = await entry.evaluate((element) => {
    const group = element.querySelector('.ui-console-surface__entry-actions');
    if (!group) throw new Error('the entry draws no action group');
    const groupBox = group.getBoundingClientRect();
    const children = Array.from(group.children).map((child) => ({ className: child.className, right: child.getBoundingClientRect().right, width: child.getBoundingClientRect().width }));
    const row = element.querySelector('.ui-console-surface__command-row')!.getBoundingClientRect();
    return { groupRight: groupBox.right, rowRight: row.right, children };
  });
  console.log(`[REQ-13] console entry action group: ${measured.children.map((child) => `${child.className} ${Math.round(child.width)}px`).join(', ')}`);

  // The group still has members — an action group announced with no members is what REQ-33 refuses.
  expect(measured.children.length, 'the console entry action group is empty').toBeGreaterThan(0);
  // And it still ends where the command row does: the group did not shrink away from its edge.
  expect(Math.abs(measured.groupRight - measured.rowRight), 'the console entry action group no longer reaches the right edge of its row').toBeLessThanOrEqual(1);
  expect(Math.abs(measured.children.at(-1)!.right - measured.groupRight), '`Re-run` no longer sits at the end of the action group').toBeLessThanOrEqual(1);
});

// ─── REQ-15 · bug-4's arrangement is undisturbed ─────────────────────────────

// REQ-15 — **the same column count at the same measured section width**, deduced from measured band
// positions and never from a class or a prop, and a section that is **shorter and not rearranged**.
// The minimum band width derives from `Created`, not from the `Id` band, so no count moves.
test('the property section keeps its column count at its measured width, and is shorter, not rearranged', async ({ page }) => {
  for (const viewport of [
    { width: 930, height: 800, columns: 1 },
    { width: 1270, height: 800, columns: 2 },
    { width: 1670, height: 900, columns: 3 },
    { width: 2070, height: 900, columns: 4 },
  ]) {
    await openImagePanel(page, viewport);
    const geometry = await measureSection(propertySection(page), 'the image panel property section');
    const evidence = report(`${viewport.width} × ${viewport.height}`, geometry);
    console.log(`[REQ-15] ${evidence}`);

    expect(geometry.columns, `${evidence} — the column count moved, so this fix went into the wrong component`).toBe(viewport.columns);
    // Reading order is still left to right then down, and the markup still declares that order.
    expect(geometry.positionalOrder, `${evidence} — the order the positions read is not the order the markup declares`).toEqual(geometry.documentOrder);
    expect(geometry.positionalOrder[0], `${evidence} — \`Id\` is no longer the first band`).toBe('Id');
    expect(geometry.positionalOrder.at(-1), `${evidence} — \`Exposed ports\` is no longer the last band`).toBe('Exposed ports');
    // One height per line: a band taller than its line-mates is what the delivered `Id` band was.
    const raggedLines = geometry.bandHeightsByLine.filter((heights) => Math.max(...heights) - Math.min(...heights) > HEIGHT_TOLERANCE_PX);
    expect(raggedLines, `${evidence} — a line still holds bands of different heights`).toEqual([]);
  }
});

// ─── REQ-34 · bug-3's metadata pane is visually unchanged ────────────────────

// REQ-34 — bug-3's entry-metadata pane holds one of the removed controls and comes out **otherwise**
// visually unchanged: the pane still lies inside its own half of the split, its bands still read one
// per line, and nothing escapes it.
test('the filesystem browser metadata pane is unchanged apart from the control it lost', async ({ page }) => {
  const containerName = `vexel-e2e-nocopy-geom-fs-src-${Date.now()}`;
  const tag = `vexel-e2e-nocopy-geom-fs-${Date.now()}:v1`;
  try {
    await ensureImage(TINY_IMAGE);
    await execFileAsync('docker', ['create', '--name', containerName, ...ownershipArgs(containerName), TINY_IMAGE]);
    await execFileAsync('docker', ['commit', containerName, tag]);

    await page.setViewportSize({ width: 1920, height: 1080 });
    await openApp(page, 'images-layers');
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 20_000 });
    await page.getByPlaceholder('Search reference or digest…').fill(tag);
    const row = imageRow(page, tag);
    await expect(row).toBeVisible({ timeout: 20_000 });

    // Opening and choosing as one retried gesture, over a settled list: every dismissal the menu is
    // contracted to perform (`ui-library/specs/menu.md`) otherwise lands between the two halves.
    await chooseFromRowOverflowMenu(page, row, 'Browse filesystem…');

    const modal = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: `Filesystem — ${tag}` }) });
    await expect(modal).toBeVisible();
    const warning = page.getByRole('heading', { name: `Confirm: ${tag}` });
    await expect(warning).toBeVisible({ timeout: 20_000 });
    await warning.locator('xpath=..').getByRole('button', { name: 'Extract' }).click();

    const entries = modal.locator('.ui-tree-view__row');
    await expect(entries.first()).toBeVisible({ timeout: 60_000 });
    await entries.first().click();

    const section = modal.locator('.ui-definition-list').first();
    await expect(section).toBeVisible({ timeout: 20_000 });
    const geometry = await measureSection(section, 'the filesystem browser metadata pane');
    const evidence = report('filesystem browser metadata pane at 1920 × 1080', geometry);
    console.log(`[REQ-34] ${evidence}`);

    expect(geometry.bands.filter((band) => !band.valueInsideBand).map((band) => band.label), `${evidence} — a value escaped its band`).toEqual([]);
    expect(geometry.bands.filter((band) => band.labelIntersectsValue).map((band) => band.label), `${evidence} — a label overlaps its value`).toEqual([]);
    const raggedLines = geometry.bandHeightsByLine.filter((heights) => Math.max(...heights) - Math.min(...heights) > HEIGHT_TOLERANCE_PX);
    expect(raggedLines, `${evidence} — the \`Path\` band is still a different height from its line-mates`).toEqual([]);
    // The pane stays inside the half of the split it was given (bug-3's own invariant).
    expect(geometry.box.right, `${evidence} — the metadata pane overflows the region it is placed in`).toBeLessThanOrEqual(geometry.containerBox.right + 1);
  } finally {
    await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
  }
});
