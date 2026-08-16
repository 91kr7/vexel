import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from './support/test.js';
import { CASE_LABEL, OWNER_LABEL, RUN_ID, navEntry, openApp } from './support/fixtures.js';
import { COLUMN_GAP_PX, expectNothingClippedOrOverlapped, measureSection, report, type BandGeometry, type SectionGeometry } from './support/property-bands.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';

/**
 * **The five surfaces that stated their own count, measured where the count was
 * wrong.** REQ ids belong to `plan-docker_management_app-detail_property_columns`
 * (REQ-25, REQ-26, REQ-27).
 *
 * This file **replaces** batch 1's `property-columns-untouched-guard.spec.ts`,
 * which asserted the opposite of what is asserted here — two columns at every
 * width, the ~400px card included — because until the caller-stated count was
 * retired, that was the delivered behaviour and leaving it attributable was worth
 * a check of its own. That guard is deleted, not relaxed: two files disagreeing
 * about the same surface is how a plan's record stops being true.
 *
 * **What is measured, and why it is the narrow width and not the wide one.** At
 * ordinary widths these five looked acceptable; the defect is the card nobody
 * opens — half a screen, or a phone-width window — where a fixed two-track grid
 * hands each pair a cell of ~165px and a 19-character id is drawn over three
 * lines. So each surface is measured **with its own section near 400px**: exactly
 * one column, deduced from measured band positions, and **no band whose content
 * fits the band it is given drawn over more than one line**. Then at a wide
 * width, **at least the two columns the caller used to state** — the operator
 * loses no density by the count ceasing to be guessed (REQ-2).
 *
 * **Two premises are asserted before any of that means anything**, because this
 * plan has already shipped checks whose fixtures could not make them false:
 *
 * - the section's own **measured** width is inside the ~400px window this check
 *   is about. A card that measures 600px gives the same green and proves
 *   nothing;
 * - the section holds at least one band whose text **fits on one line in the
 *   one-column band and could not have fitted a two-column cell of the same
 *   section**. That band is the digest of the report: it is the one the
 *   arrangement, and only the arrangement, decides the line count of. With none
 *   of them the surface cannot exhibit the defect and the check says so and
 *   fails, instead of passing quietly.
 *
 * Bands whose content genuinely exceeds any band at this width — a joined label
 * set, a sentence — wrap, as REQ-8 says they must, and are reported rather than
 * asserted on.
 *
 * Every fixture carries the ownership labels and is removed in a `finally`;
 * nothing assumes an empty daemon, nothing initialises a swarm, nothing reaches
 * Docker Hub, and each test passes on its own.
 */

/** What the five surfaces used to state for themselves, and the floor the derived count must not fall below at a wide width. */
const CALLER_STATED_COLUMNS = 2;

/**
 * The ~400px window: the section's **measured** width must land inside it, or the
 * measurement is not the one this check is about and the run fails saying so.
 */
const NARROW_SECTION_PX = { min: 355, max: 445 };

/** The band's own horizontal padding (2 × `--space-3`) and the label→value gap (`--space-4`). */
const BAND_PADDING_PX = 24;
const LABEL_VALUE_GAP_PX = 16;

/**
 * The narrow window. Below the 720px breakpoint the rail is a drawer, so the
 * whole width belongs to the content and a card lands near 400px — the width the
 * delivered fixed grid misbehaves at.
 */
const NARROW_VIEWPORT = { width: 505, height: 900 };

/**
 * The wide window for a section that has the content width to itself (the About
 * screen's baseline list).
 */
const WIDE_VIEWPORT = { width: 1920, height: 1080 };

/**
 * The wide window for a **swarm** section.
 *
 * It used to be chosen for a card that was *half* the content width — the four
 * panels sat two per row above the 1024px breakpoint, ~1030px at 2560 and ~700px
 * at 1920 — so 2560 was the smallest width at which "at least the count it used
 * to state" said something about the arrangement rather than about the panel
 * being half a screen. `plan-ui-coherence-optimisation/REQ-55` stacked the
 * inventories at the content column's full width and the reveal is a
 * `DetailPanel`, so the section is 2132px here; 2560 is kept because the figures
 * this file's sibling records were re-taken at it
 * (`property-columns-ordinary-widths.spec.ts`) and a check that moved its own
 * window would compare two different measurements.
 */
const WIDE_SWARM_VIEWPORT = { width: 2560, height: 1440 };

function screenContent(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

/** The one-line width a band's own text needs: the ink of the label, the gap, and the ink of the value. */
function oneLineRun(band: BandGeometry): number {
  return band.labelInk + LABEL_VALUE_GAP_PX + band.valueInk;
}

/**
 * The bands whose line count the **arrangement** decides: their text fits on one
 * line in the band they are given, and could not have fitted a cell of the
 * two-track grid this section used to be. A surface with none of them cannot be
 * made to fail by this fixture, whatever it renders.
 */
function bandsTheArrangementDecides(geometry: SectionGeometry): BandGeometry[] {
  const oneColumnContent = geometry.box.width - BAND_PADDING_PX;
  const twoColumnContent = (geometry.box.width - COLUMN_GAP_PX) / 2 - BAND_PADDING_PX;
  return geometry.bands.filter((band) => oneLineRun(band) > twoColumnContent && oneLineRun(band) <= oneColumnContent);
}

/** Every number this check rests on, in one line, for the before and the after (REQ-42). */
function describe(label: string, geometry: SectionGeometry): string {
  const bands = geometry.bands.map((band) => `${band.label.trim()} ${band.labelLines}L/${band.valueLines}L run ${oneLineRun(band).toFixed(0)}px in ${band.box.width.toFixed(0)}px`);
  return `${report(label, geometry)} — bands [${bands.join(' | ')}]`;
}

/**
 * The measurement REQ-26 states, at a section measured near 400px: one column,
 * and nothing wrapped that the arrangement is what wrapped.
 */
function expectOneColumnNothingWrapped(geometry: SectionGeometry, evidence: string): void {
  expect(
    geometry.box.width,
    `${evidence} — the section measures ${geometry.box.width.toFixed(1)}px, outside the ${NARROW_SECTION_PX.min}–${NARROW_SECTION_PX.max}px window this check is about: a card of another width gives the same green and states nothing about the one that misbehaves`,
  ).toBeGreaterThanOrEqual(NARROW_SECTION_PX.min);
  expect(geometry.box.width, `${evidence} — the section measures ${geometry.box.width.toFixed(1)}px, above the ~400px window this check is about`).toBeLessThanOrEqual(NARROW_SECTION_PX.max);

  const decided = bandsTheArrangementDecides(geometry);
  expect(
    decided.map((band) => band.label.trim()),
    `${evidence} — no band on this surface needs more than a ${((geometry.box.width - COLUMN_GAP_PX) / 2 - BAND_PADDING_PX).toFixed(0)}px cell, so the delivered two-track grid could not have wrapped one and a green here would certify nothing`,
  ).not.toEqual([]);

  expect(geometry.columns, `${evidence} — the section shows ${geometry.columns} columns at ${geometry.box.width.toFixed(1)}px, where one band of the stated minimum is all that fits`).toBe(1);

  const wrapped = decided.filter((band) => band.labelLines > 1 || band.valueLines > 1);
  expect(
    wrapped.map((band) => `${band.label.trim()} (${band.labelLines} label line(s), ${band.valueLines} value line(s), needing ${oneLineRun(band).toFixed(0)}px of the ${(band.box.width - BAND_PADDING_PX).toFixed(0)}px its band gives it)`),
    `${evidence} — band(s) drawn over more than one line by the arrangement, not by their own content`,
  ).toEqual([]);

  // Beside the geometry, and never instead of it (REQ-40, REQ-31): every property is still there,
  // with its label and its value — a section that arranged itself into emptiness would pass every
  // assertion above.
  for (const band of geometry.bands) {
    expect(band.labelBox, `${evidence} — the \`${band.label}\` band draws no label`).not.toBeNull();
    expect(band.valueBox, `${evidence} — the \`${band.label}\` band draws no value`).not.toBeNull();
  }
  expectNothingClippedOrOverlapped(geometry, evidence);
}

/** REQ-2, verified on these five: at a wide width the derived count is at least the one the caller used to state. */
function expectNoFewerColumnsThanStated(geometry: SectionGeometry, evidence: string): void {
  expect(
    geometry.columns,
    `${evidence} — the section shows ${geometry.columns} column(s) at ${geometry.box.width.toFixed(1)}px, fewer than the ${CALLER_STATED_COLUMNS} it stated for itself before the count was derived`,
  ).toBeGreaterThanOrEqual(CALLER_STATED_COLUMNS);
  expectNothingClippedOrOverlapped(geometry, evidence);
}

/**
 * Whether this daemon is a swarm manager. The four swarm panels expand a property
 * card only inside a cluster, and initialising one is a global act on the
 * operator's own daemon — which is why the suite's cluster work lives apart, in
 * `e2e/exclusive/swarm-cluster.spec.ts`, and puts the daemon back as it found it.
 * Outside a swarm the swarm half of this measurement **skips with its reason
 * stated**, exactly as `swarm.spec.ts` and batch 1's guard do; it is not faked
 * and it is not dropped.
 */
const { stdout: swarmInfo } = await execFileAsync('docker', ['info', '--format', '{{.Swarm.LocalNodeState}} {{.Swarm.ControlAvailable}}']);
const [LOCAL_NODE_STATE = 'inactive', CONTROL_AVAILABLE = 'false'] = swarmInfo.trim().split(' ');
const MANAGES_A_SWARM = LOCAL_NODE_STATE === 'active' && CONTROL_AVAILABLE === 'true';

// REQ-26, REQ-2 — the fifth surface, and the one available on any daemon: the About screen's
// coverage baseline. Opened with a real pointer on the rail's own entry (REQ-41), then the window is
// narrowed the way the operator narrows it.
test('the About screen’s baseline list: one column and nothing wrapped at ~400px, no fewer columns than it stated when wide', async ({ page }) => {
  await page.setViewportSize(WIDE_VIEWPORT);
  await openApp(page, null);
  await navEntry(page, 'About').click();
  await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible({ timeout: 20_000 });

  const section = screenContent(page).locator('.ui-definition-list').first();
  const wide = await measureSection(section, 'the About screen’s coverage baseline list');
  const wideEvidence = describe(`coverage baseline @${WIDE_VIEWPORT.width}×${WIDE_VIEWPORT.height}`, wide);
  console.log(`[REQ-2] ${wideEvidence}`);
  expectNoFewerColumnsThanStated(wide, wideEvidence);

  await page.setViewportSize(NARROW_VIEWPORT);
  const narrow = await measureSection(section, 'the About screen’s coverage baseline list, narrowed');
  const narrowEvidence = describe(`coverage baseline @${NARROW_VIEWPORT.width}×${NARROW_VIEWPORT.height}`, narrow);
  console.log(`[REQ-26] ${narrowEvidence}`);
  expectOneColumnNothingWrapped(narrow, narrowEvidence);
});

// REQ-26, REQ-2 — the four swarm panels: services, secrets, configs and nodes. Each is opened with a
// real pointer on the row itself (REQ-41) and measured at the same two widths.
//
// **The markup is the object list's since batch 12** (`plan-ui-coherence-optimisation/REQ-55`): the
// inventories left the hand-built card list for `DataTable`, a row's reveal is a `DetailPanel`, and
// the single `Configs & stacks` card became two, `Configs` and `Stacks`. Every assertion is the one
// it always was; only the locators and the card's name move with the migration. `Stacks` is not
// among them — a stack's services are carried by its own row rather than by a selection, so it
// reveals no property section at all.
test('the four swarm panels: one column and nothing wrapped at ~400px, no fewer columns than they stated when wide', async ({ page }) => {
  test.skip(
    !MANAGES_A_SWARM,
    `this daemon is ${LOCAL_NODE_STATE} and not a swarm manager, so no swarm panel expands a property card to measure. Nothing here initialises, joins or leaves a swarm: that is a global act on the operator's own daemon, and the suite's cluster work lives in e2e/exclusive/swarm-cluster.spec.ts`,
  );

  const suffix = `${RUN_ID}`;
  const serviceName = `vexel-e2e-bug4-svc-${suffix}`;
  const secretName = `vexel-e2e-bug4-secret-${suffix}`;
  const configName = `vexel-e2e-bug4-config-${suffix}`;
  const labelArgs = ['--label', `${OWNER_LABEL}=${RUN_ID}`, '--label', `${CASE_LABEL}=derived-count-everywhere`];

  // Everything that can throw is inside the `try` whose `finally` removes the fixtures: a creation
  // that fails between here and it would leave a service, a secret or a config on the operator's
  // cluster with nobody left to remove them.
  let materialDir: string | undefined;

  try {
    await ensureImage(ALPINE_IMAGE);
    // A secret and a config are created from a file of their own: the CLI reads their content from
    // one, and this suite's `docker` helper drives no stdin.
    materialDir = await mkdtemp(join(tmpdir(), 'vexel-e2e-bug4-'));
    const secretFile = join(materialDir, 'secret');
    const configFile = join(materialDir, 'config');
    await writeFile(secretFile, 'e2e-secret-value-never-displayed-back\n');
    await writeFile(configFile, 'e2e-config-content\n');
    await execFileAsync('docker', ['secret', 'create', ...labelArgs, secretName, secretFile]);
    await execFileAsync('docker', ['config', 'create', ...labelArgs, configName, configFile]);
    // `--no-resolve-image`: the image is the run's own mirrored copy and is already on this daemon,
    // so the digest is not looked up in a registry.
    await execFileAsync('docker', ['service', 'create', '--detach', '--no-resolve-image', '--replicas', '1', '--name', serviceName, ...labelArgs, ALPINE_IMAGE, 'sleep', '3600']);

    for (const [panelTitle, rowText] of [
      ['Services & tasks', serviceName],
      ['Secrets', secretName],
      ['Configs', configName],
      ['Nodes', ''],
    ] as const) {
      for (const [viewport, expectation] of [
        [WIDE_SWARM_VIEWPORT, 'wide'],
        [NARROW_VIEWPORT, 'narrow'],
      ] as const) {
        await page.setViewportSize(viewport);
        await openApp(page, 'swarm');
        await expect(page.getByRole('heading', { level: 1, name: 'Swarm' })).toBeVisible({ timeout: 20_000 });

        // The panel is named by **what it holds** rather than by the surface it used to be: a
        // converted inventory's section header sits above the one unpadded card holding its list
        // (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`), so a
        // card can no longer be found by the heading it used to hold. The innermost region carrying
        // both the heading and the list resolves to the same region on an inventory still drawn the
        // old way, its card.
        const panel = screenContent(page)
          .locator('.ui-stack, .ui-surface')
          .filter({ has: page.getByRole('heading', { level: 2, name: panelTitle, exact: true }) })
          .filter({ has: page.locator('.ui-data-table') })
          .last();
        const row = rowText === '' ? panel.locator('.ui-data-table__row').first() : panel.locator('.ui-data-table__row', { hasText: rowText }).first();
        await expect(row, `the ${panelTitle} panel lists nothing to open, so its property section cannot be measured`).toBeVisible({ timeout: 20_000 });
        // On its first cell, with a real pointer: below the desktop breakpoint the row is wider than
        // the box it is read in, so its own centre can sit over another column — or over a control.
        const cell = row.locator('.ui-data-table__cell').first();
        await cell.scrollIntoViewIfNeeded();
        const cellBox = (await cell.boundingBox())!;
        await page.mouse.click(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2);

        const section = panel.locator('.ui-detail-panel .ui-definition-list').first();
        const geometry = await measureSection(section, `the ${panelTitle} property card`);
        const evidence = describe(`${panelTitle} @${viewport.width}×${viewport.height}`, geometry);
        console.log(`[${expectation === 'narrow' ? 'REQ-26' : 'REQ-2'}] ${evidence}`);
        if (expectation === 'narrow') expectOneColumnNothingWrapped(geometry, evidence);
        else expectNoFewerColumnsThanStated(geometry, evidence);
      }
    }
  } finally {
    await execFileAsync('docker', ['service', 'rm', serviceName]).catch(() => undefined);
    await execFileAsync('docker', ['secret', 'rm', secretName]).catch(() => undefined);
    await execFileAsync('docker', ['config', 'rm', configName]).catch(() => undefined);
    if (materialDir) await rm(materialDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
