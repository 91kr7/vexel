import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { COLUMN_GAP_PX, TRANSITION_CLEARANCE_PX, measureSection, measureValueBands, report } from './support/property-bands.js';
import { measureFieldList, reportFieldList } from './support/field-entries.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { containerCard, containerDetail, openContainerDetail } from './support/container-cards.js';

/**
 * **The container detail panel, measured** — the other half of what the human
 * reported. REQ ids belong to `plan-docker_management_app-detail_property_columns`.
 *
 * Two things are checked here that the image panel cannot check:
 *
 * - **The `Config` tab fails a viewport-keyed implementation** (REQ-4). Its
 *   runtime-configuration list sits at half the panel while the `Inspect` tab's
 *   sits at the whole of it, at the **same viewport** — so a count keyed to the
 *   window is necessarily wrong for one of the two, and wrong on the narrow one,
 *   which is where a too-high count clips. This is the second-likeliest wrong fix
 *   and it reads correct in review, because the human said "based on the device
 *   size".
 * - **The `Config` tab's own two-column split** (REQ-18): the mocked shape at
 *   desktop widths, stacking below the narrow breakpoint instead of handing each
 *   side ~180px, and its `Environment` section arranging itself by the width its
 *   own column has (REQ-19).
 *
 * **The right-hand column is two counted sections now**, `Environment` and
 * `Mounts`, instead of one list of `KEY=value` runs
 * (`…-tabs_composition_refactor/REQ-18` … REQ-21). What that plan changed is
 * rewritten here rather than dropped: the count rule below is re-asserted on the
 * `Environment` section, and the entries are read as key-in-its-track /
 * value-in-its-track. The rest of this file is untouched — the two-column split,
 * the two tabs' differing counts and the height ceilings are the same
 * measurements on the same surfaces.
 *
 * The editing form is **not opened and not touched** (REQ-34): this report is
 * about the read view.
 *
 * The fixture is a container created (never started) from the suite's own
 * `vexel-test-tiny:1`, carrying the ownership labels, with environment of its own
 * so the `Environment` section has something to arrange, and removed with
 * `docker rm -fv` in a `finally` (REQ-44). Every interaction is a real pointer at
 * the visible control's coordinates: the row's first cell, and the tab's own
 * control (REQ-41).
 */

/**
 * The three viewports the height ceilings were stated at. The ceilings themselves belonged to the
 * ten curated properties `…-inspect_full_payload/REQ-5` abolished; the viewports stay, because the
 * questions this file still puts to the Inspect tab are put at each of them.
 */
const HEIGHT_CEILINGS = [
  { viewport: { width: 1280, height: 720 }, fraction: 0.65 },
  { viewport: { width: 1920, height: 1080 }, fraction: 0.45 },
  { viewport: { width: 2560, height: 1440 }, fraction: 0.35 },
];

const CLIPPING_VIEWPORTS = [
  { width: 720, height: 800 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

/**
 * Two environment lines of the shape the long-single-line class exists for — a
 * PATH-style value past 60 characters, and a short one. `vexel-test-tiny:1` is
 * built `FROM scratch` and declares none of its own, so what the panel shows is
 * exactly what the fixture states.
 *
 * `PATH`'s value carries `=`-free colons and the two keys are of different
 * lengths, which is what the section's own alignment is read against.
 */
/**
 * **Six, and the number is no longer what carries the width rule.** `Environment variables` reads
 * one entry per row at the group's full width since `…-tabs_composition_refactor/REQ-54`, so its
 * count per line is one at every width and it can no longer be the section the count rule is read
 * against. `Port mappings` is: it declares the short scalar and goes on flowing as many entries per
 * line as its own card carries (`containers/specs/container-detail-panel.md`). The six variables
 * stay because the environment's own new rule — one per row, whatever the width — is asserted on
 * them, and one entry could not tell "one per row" from "one entry".
 */
const FIXTURE_ENV: Record<string, string> = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  NODE_ENV: 'production',
  LOG_LEVEL: 'debug',
  APP_REGION: 'eu-west-1',
  FEATURE_FLAGS: 'search,exports',
  RETRY_BUDGET: '3',
};

/**
 * **Six published ports, and the number is load-bearing.** A group can never flow more entries on a
 * line than it holds, so a fixture with two would report "the count did not rise" for a group that
 * had nothing left to put on the line — passing or failing on the fixture rather than on the
 * arrangement. Six clears the tracks the group opens at the wider viewport below. The host numbers
 * are high and **nothing is ever bound**: the container is created and never started, so it
 * reserves no port on the operator's machine.
 */
const FIXTURE_PORTS = [41181, 41182, 41183, 41184, 41185, 41186];

/** The first definition list of the open panel: the Config tab's runtime list. */
function firstSection(page: Page): Locator {
  return containerDetail(page).locator('.ui-definition-list').first();
}

/** The gap between bands (`--space-6`) and the short-scalar minimum, the two figures the count follows from. */
const SHORT_SCALAR_MIN_PX = 360;

/** The count the short-scalar rule states for a section of a given width, bounded by what the group holds. */
function derivedColumns(sectionWidth: number, bands: number): number {
  return Math.min(bands, Math.max(1, Math.floor((sectionWidth + COLUMN_GAP_PX) / (SHORT_SCALAR_MIN_PX + COLUMN_GAP_PX))));
}

/**
 * The same rule for the **value** form of the class — the one a `FieldList` takes
 * (`ui-library/specs/content-columns.md`: 240px against the pair form's 360px, the difference being
 * the ~100px label run a band with no label does not carry). `Port mappings` is entries and not
 * label→value pairs, so it is this minimum its count follows and not the one above.
 */
const SHORT_SCALAR_VALUE_MIN_PX = 240;

function derivedEntriesPerLine(groupWidth: number, entries: number): number {
  return Math.min(entries, Math.max(1, Math.floor((groupWidth + COLUMN_GAP_PX) / (SHORT_SCALAR_VALUE_MIN_PX + COLUMN_GAP_PX))));
}

/**
 * A count asserted within `TRANSITION_CLEARANCE_PX` of one of the value form's own transitions is an
 * assertion about a rounding rule rather than about the arrangement, so the run fails instead of
 * passing for the wrong reason.
 */
function expectClearOfValueTransition(width: number, evidence: string): void {
  const step = SHORT_SCALAR_VALUE_MIN_PX + COLUMN_GAP_PX;
  const transitions = [2, 3, 4, 5, 6, 7].map((count) => step * count - COLUMN_GAP_PX);
  const near = transitions.find((transition) => Math.abs(width - transition) < TRANSITION_CLEARANCE_PX);
  expect(near, `${evidence} — the width sits within ${TRANSITION_CLEARANCE_PX}px of the ${String(near)}px transition`).toBeUndefined();
}

/**
 * **The band geometry of the rebuilt Inspect tab**, band by band and from measured boxes alone —
 * what `…-inspect_full_payload/REQ-30` asks be re-established on the new composition after REQ-5
 * abolished the two curated property groups this file used to measure.
 */
interface PayloadBandGeometry {
  count: number;
  faults: string[];
  widest: number;
  containerRight: number;
}

async function measureInspectBands(page: Page): Promise<PayloadBandGeometry> {
  return await containerDetail(page).evaluate((panel) => {
    const sections = panel.querySelector('.ui-payload-sections');
    const bands = Array.from(panel.querySelectorAll('.ui-payload-band'));
    const faults: string[] = [];
    let widest = 0;
    for (const band of bands) {
      const bandBox = band.getBoundingClientRect();
      const label = band.querySelector('.ui-payload-band__label')!;
      const value = band.querySelector('.ui-payload-band__value')!;
      const labelBox = label.getBoundingClientRect();
      const valueBox = value.getBoundingClientRect();
      const name = label.textContent ?? '(no label)';
      widest = Math.max(widest, bandBox.right);
      if (labelBox.width <= 0 || labelBox.height <= 0) faults.push(`${name}: the label has no box`);
      if (valueBox.width <= 0 || valueBox.height <= 0) faults.push(`${name}: the value has no box`);
      if (getComputedStyle(value).textOverflow === 'ellipsis') faults.push(`${name}: the value is clamped with an ellipsis`);
      if (labelBox.left < bandBox.left - 0.5 || valueBox.right > bandBox.right + 0.5) faults.push(`${name}: the band's content lies outside the band`);
      if (labelBox.left < valueBox.right - 0.5 && labelBox.right > valueBox.left + 0.5 && labelBox.top < valueBox.bottom - 0.5 && labelBox.bottom > valueBox.top + 0.5) {
        faults.push(`${name}: the label overlaps the value`);
      }
    }
    return { count: bands.length, faults, widest, containerRight: (sections ?? panel).getBoundingClientRect().right };
  });
}

async function createFixtureContainer(name: string): Promise<void> {
  // Ensured at the point of use, not once for the run: a prune spec in this suite prunes the host, so an
  // image present at global setup may be gone by now. Locally built, so putting it back costs a
  // second and no network (REQ-44).
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', [
    'create',
    '--name',
    name,
    ...ownershipArgs(name),
    '--label',
    'org.opencontainers.image.description=a label value long enough to belong to the long-single-line class',
    ...Object.entries(FIXTURE_ENV).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
    ...FIXTURE_PORTS.flatMap((host, index) => ['-p', `${host}:${8181 + index}`]),
    TINY_IMAGE,
  ]);
}

async function removeFixtureContainer(name: string): Promise<void> {
  // `-v` and not just `-f`: without it an image's anonymous volumes outlive the container carrying
  // no label of ours, invisible to any later sweep.
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** Opens the panel on the card the test created, with a real pointer on the container's own name. */
async function openContainerPanel(page: Page, name: string, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  await expect(containerCard(page, name), 'the fixture container never appeared in the list').toBeVisible({ timeout: 20_000 });
  await openContainerDetail(page, name);
  await expect(firstSection(page)).toBeVisible({ timeout: 20_000 });
}

/**
 * The Config tab's two-column split. Located by the grid element itself and not
 * by the named arrangement's own class: the element is the same one before this
 * batch's correction and after it, so the check can be red on the delivered
 * build instead of merely failing to find anything there.
 */
function configSplit(page: Page): Locator {
  return containerDetail(page).locator('.ui-grid').first();
}

/**
 * A group's own reading list, located through the heading an operator reads and the sibling it
 * titles. The entries are the fields of a `FieldList` now rather than the bands of a definition
 * list (`…-tabs_composition_refactor/REQ-54`, REQ-55), so the list this returns is measured with
 * `support/field-entries.ts` and not with the band reader.
 */
function configGroupList(page: Page, title: string): Locator {
  return containerDetail(page).locator(`.ui-section-header:has(.ui-section-header__title:text-is("${title}")) + .ui-field-list`);
}

/** A tab of the open panel, selected with a real pointer at its own coordinates (REQ-41). */
async function selectTab(page: Page, label: string): Promise<void> {
  await containerDetail(page).getByRole('tab', { name: label, exact: true }).click();
  const arrived = label === 'Inspect' ? containerDetail(page).getByLabel('Find in payload') : firstSection(page);
  await expect(arrived, `the ${label} tab drew nothing`).toBeVisible({ timeout: 20_000 });
}

// REQ-22, REQ-23, REQ-20, and `…-inspect_full_payload/REQ-5`, REQ-30 — **the ten curated properties
// this test measured no longer exist**: the tab is the payload's own shape now, so the surface the
// column rule applied to is gone from it. The claim is re-established rather than dropped — no
// property section is drawn on this tab at all, so no count follows from a viewport here either, and
// the bands that replaced it keep a box of their own at each of the three viewports.
test('Inspect: the tab draws no property section, and its payload bands keep their boxes at the three viewports', async ({ page }) => {
  const name = `vexel-e2e-bug4-inspect-${Date.now()}`;
  await createFixtureContainer(name);
  try {
    const measured: string[] = [];
    for (const ceiling of HEIGHT_CEILINGS) {
      await openContainerPanel(page, name, ceiling.viewport);
      await selectTab(page, 'Inspect');
      await expect(containerDetail(page).getByLabel('Find in payload')).toBeVisible({ timeout: 20_000 });

      await expect(
        containerDetail(page).locator('.ui-payload-explorer .ui-definition-list'),
        'the Inspect tab still curates a property list of its own',
      ).toHaveCount(0);
      await expect(
        containerDetail(page).locator('.ui-payload-explorer .ui-field-list'),
        'the Inspect tab still curates a reading list of its own',
      ).toHaveCount(0);

      const geometry = await measureInspectBands(page);
      measured.push(`Inspect at ${ceiling.viewport.width}×${ceiling.viewport.height}: ${geometry.count} bands, widest right edge ${geometry.widest.toFixed(1)}px of ${geometry.containerRight.toFixed(1)}px`);
      expect(geometry.count, 'the Inspect tab draws no band at all, so this measures nothing').toBeGreaterThan(0);
      expect(geometry.faults, `[REQ-30] the Inspect tab's bands at ${ceiling.viewport.width}×${ceiling.viewport.height}`).toEqual([]);
      expect(geometry.widest, `[REQ-30] a band runs past the right edge of the tab at ${ceiling.viewport.width}px`).toBeLessThanOrEqual(geometry.containerRight + 1);
    }
    console.log(`[REQ-22] ${measured.join('\n[REQ-22] ')}`);
  } finally {
    await removeFixtureContainer(name);
  }
});

// REQ-4 — the check that fails a viewport-keyed implementation: two sections, one viewport, one
// panel, one at half the panel and one at the whole of it, showing different counts, both deduced
// from measured positions. **The full-width side is the Config tab's own `Port mappings` group**
// now: the Inspect tab, which used to supply it, draws no property section at all
// (`…-inspect_full_payload/REQ-5`). The claim is unchanged — the width that decides is each
// section's own — and it is put to two sections of the same panel at the same viewport.
test('Config: a half-width section and a full-width one show different counts at one viewport', async ({ page }) => {
  const name = `vexel-e2e-bug4-halves-${Date.now()}`;
  await createFixtureContainer(name);
  try {
    // 1440 × 900 throughout: the viewport never changes between the two measurements, so a rule
    // keyed to it could not produce two different counts. The width is chosen for being clear of
    // both classes' own rounding transitions, which the guards below re-state as assertions.
    await openContainerPanel(page, name, { width: 1440, height: 900 });
    const half = await measureSection(firstSection(page), 'the Config tab runtime-configuration section');
    const halfEvidence = report('Config runtime configuration at 1440 × 900', half);

    const full = await measureFieldList(configGroupList(page, 'Port mappings'), 'the Config tab Port mappings group');
    const fullEvidence = reportFieldList('Config Port mappings at 1440 × 900', full);
    console.log(`[REQ-4] ${halfEvidence}\n[REQ-4] ${fullEvidence}`);

    expect(half.box.width, `${halfEvidence} / ${fullEvidence} — the two sections are the same width, so this comparison would prove nothing`).toBeLessThan(full.box.width - 200);
    expect(
      half.columns,
      `${halfEvidence} — a ${half.box.width.toFixed(1)}px section of ${half.bands.length} short-scalar bands carries ${derivedColumns(half.box.width, half.bands.length)}`,
    ).toBe(derivedColumns(half.box.width, half.bands.length));
    expectClearOfValueTransition(full.box.width, fullEvidence);
    expect(
      full.perLine,
      `${fullEvidence} — a ${full.box.width.toFixed(1)}px group of ${full.entries.length} entries flows ${derivedEntriesPerLine(full.box.width, full.entries.length)} per line`,
    ).toBe(derivedEntriesPerLine(full.box.width, full.entries.length));
    expect(
      half.columns,
      `${halfEvidence} / ${fullEvidence} — both sections show the same count at one viewport, which is what a rule keyed to the window produces`,
    ).not.toBe(full.perLine);
  } finally {
    await removeFixtureContainer(name);
  }
});

// REQ-18 — the Config tab's own split: the mocked two columns at desktop widths, stacked below the
// narrow breakpoint with each column at full width rather than ~180px each.
test('Config: two equal columns at desktop widths, stacked at full width below 720px', async ({ page }) => {
  const name = `vexel-e2e-bug4-split-${Date.now()}`;
  await createFixtureContainer(name);
  try {
    await openContainerPanel(page, name, { width: 1280, height: 720 });
    const desktop = await measureValueBands(configSplit(page), "the Config tab's two-column split");
    console.log(`[REQ-18] desktop 1280×720: split ${desktop.box.width.toFixed(1)}px, columns [${desktop.bands.map((band) => band.width.toFixed(1)).join(', ')}], ${desktop.perLine} per line`);
    expect(desktop.perLine, 'the Config tab is not two columns at a desktop width, where its mockup is').toBe(2);
    const [left, right] = desktop.bands;
    expect(Math.abs(left!.width - right!.width), 'the two columns of the Config tab are not equal').toBeLessThanOrEqual(2);

    await openContainerPanel(page, name, { width: 700, height: 900 });
    const narrow = await measureValueBands(configSplit(page), "the Config tab's two-column split");
    console.log(`[REQ-18] narrow 700×900: split ${narrow.box.width.toFixed(1)}px, columns [${narrow.bands.map((band) => band.width.toFixed(1)).join(', ')}], ${narrow.perLine} per line`);
    expect(narrow.perLine, 'the Config tab keeps two columns below the narrow breakpoint, where each side is squeezed to ~180px').toBe(1);
    for (const column of narrow.bands) {
      expect(column.width, `a stacked column measures ${column.width.toFixed(1)}px instead of the split's full ${narrow.box.width.toFixed(1)}px`).toBeGreaterThanOrEqual(narrow.box.width - 2);
    }
  } finally {
    await removeFixtureContainer(name);
  }
});

// REQ-19, bug-4 — a group's entries flow by the width of the **group's own card**, not by the
// window's, and the count rises with it.
//
// **The group this rule is read on has moved, and the move is the contract's.** It was
// `Environment`, which is one entry per row at every width since
// `…-tabs_composition_refactor/REQ-54` and therefore can no longer show a count that rises at all.
// `Port mappings` is the group that goes on flowing — it declares the short scalar, and
// `containers/specs/container-detail-panel.md` states in as many words that its count follows the
// card's width and not the viewport's. So the rule is re-asserted on it rather than dropped with
// the element that used to carry it (REQ-43).
//
// The two viewports are chosen against the **group's** own transitions and never against the
// window's: the short-scalar count is `floor((W + 24) / 384)` at a group width of `W`, and what is
// asserted at each viewport is that measured width's own derived count — so a dialog of a different
// proportion moves the numbers and not the claim. The fixture publishes six ports so that neither
// count is an assertion about how many the fixture happens to have.
test('Config: the Port mappings entries flow by their own card’s width', async ({ page }) => {
  const name = `vexel-e2e-bug4-ports-${Date.now()}`;
  await createFixtureContainer(name);
  try {
    await openContainerPanel(page, name, { width: 1440, height: 900 });
    const atWide = await measureFieldList(configGroupList(page, 'Port mappings'), 'the Port mappings group');
    console.log(`[REQ-19] ${reportFieldList('Port mappings at 1440×900', atWide)}`);
    expect(atWide.entries.length, 'the Port mappings group draws none of the fixture’s own bindings').toBe(FIXTURE_PORTS.length);
    expect(
      atWide.perLine,
      `the Port mappings group spans ${atWide.box.width.toFixed(1)}px and flows ${atWide.perLine} entries per line, against the ${derivedEntriesPerLine(
        atWide.box.width,
        atWide.entries.length,
      )} its own width derives`,
    ).toBe(derivedEntriesPerLine(atWide.box.width, atWide.entries.length));
    expectClearOfValueTransition(atWide.box.width, `Port mappings at 1440×900 (${atWide.box.width.toFixed(1)}px)`);

    await openContainerPanel(page, name, { width: 2880, height: 1440 });
    const atWider = await measureFieldList(configGroupList(page, 'Port mappings'), 'the Port mappings group');
    console.log(`[REQ-19] ${reportFieldList('Port mappings at 2880×1440', atWider)}`);
    expect(
      atWider.perLine,
      `the Port mappings group spans ${atWider.box.width.toFixed(1)}px and flows ${atWider.perLine} entries per line, against the ${derivedEntriesPerLine(
        atWider.box.width,
        atWider.entries.length,
      )} its own width derives`,
    ).toBe(derivedEntriesPerLine(atWider.box.width, atWider.entries.length));
    expect(
      atWider.perLine,
      `the group spans ${atWider.box.width.toFixed(1)}px at 2880 × 1440 and still flows ${atWider.perLine} per line, against ${atWide.perLine} at ${atWide.box.width.toFixed(
        1,
      )}px`,
    ).toBeGreaterThan(atWide.perLine);

    // REQ-54, on the group the rule left: the environment reads one entry per row at **both** of
    // those widths, which is what makes it the wrong group to read a rising count on.
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 2880, height: 1440 },
    ]) {
      await openContainerPanel(page, name, viewport);
      const environment = await measureFieldList(configGroupList(page, 'Environment variables'), 'the Environment variables group');
      console.log(`[REQ-54] ${reportFieldList(`Environment at ${viewport.width}×${viewport.height}`, environment)}`);
      expect(
        environment.perLine,
        `the Environment group spans ${environment.box.width.toFixed(1)}px at ${viewport.width} × ${viewport.height} and flows ${environment.perLine} entries per line`,
      ).toBe(1);
      expect(environment.entries.length, 'the Environment group draws none of the fixture’s own variables').toBe(Object.keys(FIXTURE_ENV).length);
    }

    // Beside the geometry (REQ-40, REQ-31): every variable keeps its key and its whole value, each
    // in a field of its own (`…-tabs_composition_refactor/REQ-54`).
    const read = await configGroupList(page, 'Environment variables')
      .locator('.ui-field-list__entry')
      .evaluateAll((entries) =>
        Object.fromEntries(
          entries.map((entry) => {
            const fields = Array.from(entry.querySelectorAll('.ui-field-list__value')).map((value) => value.textContent ?? '');
            return [fields[0] ?? '', fields[1] ?? ''];
          }),
        ),
      );
    expect(read).toEqual(FIXTURE_ENV);

    // REQ-34 — the editing form was never opened, and this states it: the read view's own action is
    // still there, unpressed. Its place is the **foot** of the tab now
    // (`…-tabs_composition_refactor/REQ-50`), which
    // `container-detail-config-reading.spec.ts` measures.
    await expect(containerDetail(page).getByRole('button', { name: 'Edit configuration' })).toBeVisible();
  } finally {
    await removeFixtureContainer(name);
  }
});

// REQ-17, REQ-24, REQ-12, and `…-inspect_full_payload/REQ-29`, REQ-30 — the Inspect tab free of
// clipping and overlap at the four widths, the narrow end included.
//
// **The `Labels` section this test used to measure is gone** (`…-inspect_full_payload/REQ-3`): the
// tab's sections are the payload's own top-level keys now, and the labels the fixture declares are
// bands inside the section the daemon puts them at. So the claim is re-established against the new
// composition — every band, at every depth, keeps its box and its content inside it — instead of
// being dropped with the element it used to name.
test('Inspect: every payload band clears 720 / 1280 / 1920 / 2560 without clipping or overlap', async ({ page }) => {
  const name = `vexel-e2e-bug4-sections-${Date.now()}`;
  await createFixtureContainer(name);
  try {
    const measured: string[] = [];
    for (const viewport of CLIPPING_VIEWPORTS) {
      await openContainerPanel(page, name, viewport);
      await selectTab(page, 'Inspect');
      await expect(containerDetail(page).getByLabel('Find in payload')).toBeVisible({ timeout: 20_000 });

      // Every section opened, so the check reaches the depth the payload goes to rather than the
      // two sections the tab opens with.
      const headers = containerDetail(page).locator('.ui-payload-sections > .ui-collapsible-section > .ui-collapsible-section__header');
      for (let index = 0; index < (await headers.count()); index += 1) {
        const header = headers.nth(index);
        if ((await header.getAttribute('aria-expanded')) === 'false') await header.click();
      }

      const geometry = await measureInspectBands(page);
      const evidence = `Inspect at ${viewport.width}×${viewport.height}: ${geometry.count} bands, widest right edge ${geometry.widest.toFixed(1)}px of ${geometry.containerRight.toFixed(1)}px`;
      measured.push(evidence);
      expect(geometry.count, `${evidence} — the tab draws no band at all`).toBeGreaterThan(0);
      expect(geometry.faults, `[REQ-24] ${evidence}`).toEqual([]);
      expect(geometry.widest, `[REQ-24] ${evidence} — a band runs past the right edge of the tab`).toBeLessThanOrEqual(geometry.containerRight + 1);

      const sideways = await containerDetail(page).evaluate((panel) => {
        const region = panel.querySelector('.ui-payload-explorer') ?? panel;
        return { scrollWidth: region.scrollWidth, clientWidth: region.clientWidth };
      });
      expect(
        sideways.scrollWidth,
        `[REQ-29] the Inspect tab scrolls sideways at ${viewport.width}px: ${sideways.scrollWidth} against ${sideways.clientWidth}`,
      ).toBeLessThanOrEqual(sideways.clientWidth + 1);
    }
    console.log(`[REQ-24] ${measured.join('\n[REQ-24] ')}`);
  } finally {
    await removeFixtureContainer(name);
  }
});
