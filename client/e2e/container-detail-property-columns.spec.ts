import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import {
  COLUMN_GAP_PX,
  SHORT_SCALAR_TRANSITIONS_PX,
  TRANSITION_CLEARANCE_PX,
  expectNothingClippedOrOverlapped,
  measureSection,
  measureValueBands,
  report,
} from './support/property-bands.js';
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
 * The delivered build's own numbers, measured on it before the correction existed
 * (2026-08-14, this environment): the `Inspect` tab's ten properties measured
 * **390px, one column, ten lines at 1280 × 720, 1920 × 1080 and 2560 × 1440
 * alike**; the `Config` tab's runtime list 220px and one column at all three,
 * its column measuring 443 / 763 / 1083px; and its environment · mounts list
 * **one entry per line at every one of the three**.
 *
 * The ceilings are stated against the plan's ~366px — ten bands at the delivered
 * 37px step — because it is the stricter of the two figures. **That baseline is
 * bands and no chrome**, so the ceilings are read here against the ten bands of
 * the two groups `…-tabs_composition_refactor/REQ-34` now draws them in — all
 * ten of them and not whichever group happens to be first (REQ-43) — and the
 * room the two headings add is weighed separately, against the flat list they
 * replaced.
 */
const DELIVERED_INSPECT_HEIGHT_PX = 366;
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
const FIXTURE_ENV: Record<string, string> = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  NODE_ENV: 'production',
};

/**
 * The first definition list of the open panel: the runtime list on Config, and on Inspect the
 * `Identity` group — the ten properties being two headed groups since
 * `…-tabs_composition_refactor/REQ-34`, of which this is the first. Whatever is measured through
 * *this* locator on Inspect is therefore six of the ten, and the tests below that are about all ten
 * say so by reading both groups.
 */
function firstSection(page: Page): Locator {
  return containerDetail(page).locator('.ui-definition-list').first();
}

/**
 * One of the Inspect tab's two property groups, located through the heading an operator reads and
 * the list it heads (`…-tabs_composition_refactor/REQ-34`).
 */
function inspectGroup(page: Page, title: string): Locator {
  return containerDetail(page).locator(`.ui-section-header:has(.ui-section-header__title:text-is("${title}")) + .ui-definition-list`);
}

/** The gap between bands (`--space-6`) and the short-scalar minimum, the two figures the count follows from. */
const SHORT_SCALAR_MIN_PX = 360;

/** The count the short-scalar rule states for a section of a given width, bounded by what the group holds. */
function derivedColumns(sectionWidth: number, bands: number): number {
  return Math.min(bands, Math.max(1, Math.floor((sectionWidth + COLUMN_GAP_PX) / (SHORT_SCALAR_MIN_PX + COLUMN_GAP_PX))));
}

/**
 * **The vertical room the ten properties occupy**, from the top edge of the first thing drawn for
 * them — the `Identity` heading — to the bottom edge of the last, `Lifecycle`'s final band. This is
 * the subject `plan-docker_management_app-detail_property_columns/REQ-22` names ("the `Inspect` tab,
 * ten properties"); splitting them into two headed groups changed where they are drawn, not what is
 * measured, so the ceilings go on being read against all ten and their headings rather than against
 * whichever group happens to be first (REQ-43).
 */
async function inspectPropertyAreaHeight(page: Page): Promise<number> {
  const height = await containerDetail(page).evaluate((panel) => {
    const headers = Array.from(panel.querySelectorAll('.ui-section-header'));
    const headed = (title: string) => headers.find((header) => header.querySelector('.ui-section-header__title')?.textContent === title);
    const identity = headed('Identity');
    const lifecycle = headed('Lifecycle');
    const last = lifecycle?.parentElement?.querySelector(':scope > .ui-definition-list');
    if (!identity || !last) return null;
    return last.getBoundingClientRect().bottom - identity.getBoundingClientRect().top;
  });
  expect(height, 'the Inspect tab draws no Identity / Lifecycle pair, so its property area cannot be measured').not.toBeNull();
  return height!;
}

async function createFixtureContainer(name: string): Promise<void> {
  // Ensured at the point of use, not once for the run: the exclusive project prunes the host, so an
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
 * The `Environment` section's own list — located through the heading an operator
 * reads and the sibling it titles, since the entries are bands of a definition
 * list now and no longer the meta cells this file used to count
 * (`…-tabs_composition_refactor/REQ-18`, REQ-19).
 */
function environmentSection(page: Page): Locator {
  return containerDetail(page).locator('.ui-section-header:has(.ui-section-header__title:text-matches("^Environment")) + .ui-definition-list');
}

/** A tab of the open panel, selected with a real pointer at its own coordinates (REQ-41). */
async function selectTab(page: Page, label: string): Promise<void> {
  await containerDetail(page).getByRole('tab', { name: label, exact: true }).click();
  await expect(firstSection(page)).toBeVisible({ timeout: 20_000 });
}

// REQ-22, REQ-23, REQ-20 — the ten properties on the same rule as the image panel's nine: the count
// follows the section's own measured width, and the height clears the three ceilings against the
// delivered build's own 390px, which it measured identically at all three viewports.
//
// **The ten are two headed groups now** (`…-tabs_composition_refactor/REQ-34`), so the same three
// questions are put to the new composition rather than to the first group alone (REQ-43): the
// ceilings against the room all ten and their headings occupy, the width response against that same
// room, and the derived count against **each** group's own width — `Lifecycle` included, which
// nothing measured before this batch.
test('Inspect: the ten properties spread with the width and clear the three height ceilings', async ({ page }) => {
  const name = `vexel-e2e-bug4-inspect-${Date.now()}`;
  await createFixtureContainer(name);
  try {
    const measured: string[] = [];
    let narrowArea: number | undefined;
    let wideArea: number | undefined;
    let narrow: Awaited<ReturnType<typeof measureSection>> | undefined;
    let wide: Awaited<ReturnType<typeof measureSection>> | undefined;

    for (const ceiling of HEIGHT_CEILINGS) {
      await openContainerPanel(page, name, ceiling.viewport);
      await selectTab(page, 'Inspect');
      const identity = await measureSection(inspectGroup(page, 'Identity'), 'the Inspect tab Identity group');
      const lifecycle = await measureSection(inspectGroup(page, 'Lifecycle'), 'the Inspect tab Lifecycle group');
      const area = await inspectPropertyAreaHeight(page);
      const bands = identity.box.height + lifecycle.box.height;
      const evidence = `Inspect at ${ceiling.viewport.width}×${ceiling.viewport.height}: the ten property bands measure ${bands.toFixed(
        1,
      )}px and the whole property area ${area.toFixed(1)}px — ${report('Identity', identity)} / ${report('Lifecycle', lifecycle)}`;
      measured.push(evidence);

      const bound = DELIVERED_INSPECT_HEIGHT_PX * ceiling.fraction;
      expect(
        bands,
        `${evidence} — the ten bands measure ${bands.toFixed(1)}px, over the ${bound.toFixed(1)}px ceiling (${
          ceiling.fraction * 100
        }% of the delivered ${DELIVERED_INSPECT_HEIGHT_PX}px, which the delivered build measured identically at all three viewports)`,
      ).toBeLessThanOrEqual(bound);

      // Beside it, and about the room the eye actually pays: the two headings
      // `…-tabs_composition_refactor/REQ-34` introduced are chrome the delivered flat list did not
      // carry, so they are not weighed against a baseline of ten bare bands — but the composition
      // that replaced that list must not cost more room than the list did.
      expect(
        area,
        `${evidence} — the two groups and their headings occupy ${area.toFixed(1)}px, more than the ${DELIVERED_INSPECT_HEIGHT_PX}px flat list they replaced`,
      ).toBeLessThan(DELIVERED_INSPECT_HEIGHT_PX);

      // No transition guard on the heights, and deliberately: what those assert is a **height**
      // against the delivered build's, at the three viewports the requirement names. The guard
      // belongs to the count assertions below, where landing on a transition would make them
      // assertions about a rounding rule.
      expectNothingClippedOrOverlapped(identity, report('Identity', identity));
      expectNothingClippedOrOverlapped(lifecycle, report('Lifecycle', lifecycle));

      // REQ-34 — each group states its own content class, so each one's count follows **its own**
      // width. Asserted on both, since the panel now holds two.
      for (const group of [
        { name: 'Identity', geometry: identity },
        { name: 'Lifecycle', geometry: lifecycle },
      ]) {
        if (SHORT_SCALAR_TRANSITIONS_PX.some((transition) => Math.abs(group.geometry.box.width - transition) < TRANSITION_CLEARANCE_PX)) continue;
        const expected = derivedColumns(group.geometry.box.width, group.geometry.bands.length);
        expect(
          group.geometry.columns,
          `${report(group.name, group.geometry)} — a ${group.geometry.box.width.toFixed(1)}px section of ${
            group.geometry.bands.length
          } short-scalar bands carries ${expected}`,
        ).toBe(expected);
      }

      if (ceiling.viewport.width === 1280) {
        narrow = identity;
        narrowArea = bands;
      }
      if (ceiling.viewport.width === 2560) {
        wide = identity;
        wideArea = bands;
      }
    }
    console.log(`[REQ-22] ${measured.join('\n[REQ-22] ')}`);

    // REQ-23 — on the delivered build these two are identical, which is the red.
    expect(wideArea!, 'the ten property bands are not shorter at 2560 × 1440 than at 1280 × 720').toBeLessThan(narrowArea!);
    expect(wide!.columns, 'the Identity group does not carry more columns at 2560 × 1440 than at 1280 × 720').toBeGreaterThan(narrow!.columns);
  } finally {
    await removeFixtureContainer(name);
  }
});

// REQ-4 — the check that fails a viewport-keyed implementation: two sections, one viewport, one
// panel, one tab click apart — one at half the panel and one at the whole of it — showing different
// counts, both deduced from measured band positions.
test('Config and Inspect show different counts at one viewport, because the width that decides is each section’s own', async ({ page }) => {
  const name = `vexel-e2e-bug4-halves-${Date.now()}`;
  await createFixtureContainer(name);
  try {
    // 1920 × 1080 throughout: the viewport never changes between the two measurements, so a rule
    // keyed to it could not produce two different counts.
    await openContainerPanel(page, name, { width: 1920, height: 1080 });
    const half = await measureSection(firstSection(page), 'the Config tab runtime-configuration section');
    const halfEvidence = report('Config runtime configuration at 1920 × 1080', half);

    await selectTab(page, 'Inspect');
    // The tab's first group, `Identity` (`…-tabs_composition_refactor/REQ-34`): what this test needs
    // of it is that it sits at the whole of the panel while the Config list sits at half, which the
    // split into two groups did not change.
    const full = await measureSection(inspectGroup(page, 'Identity'), 'the Inspect tab Identity group');
    const fullEvidence = report('Inspect Identity at 1920 × 1080', full);
    console.log(`[REQ-4] ${halfEvidence}\n[REQ-4] ${fullEvidence}`);

    expect(half.box.width, `${halfEvidence} / ${fullEvidence} — the two sections are the same width, so this comparison would prove nothing`).toBeLessThan(full.box.width - 200);
    expect(
      half.columns,
      `${halfEvidence} / ${fullEvidence} — both sections show ${half.columns} column(s) at one viewport, which is what a rule keyed to the window produces`,
    ).not.toBe(full.columns);
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

// REQ-19 — the `Environment` section, measured where the count actually changes: the count follows
// the section's **own** width, and it rises with it.
//
// **The wide viewport is 2880 and not 2560**, and that is not a preference. This section declares
// the long-single-line class, whose 560px minimum puts its transition at 1144px of section width
// (`floor((W + 24) / 584)`); the detail dialog is 92vw and the section is half of it, so 2560 lands
// the section within a few pixels of that boundary and a count asserted there would be an assertion
// about a rounding rule rather than about the arrangement. 2880 clears it by ~140px. The entries
// used to be the meta cells of one `environment · mounts` list, which is the reading
// `…-tabs_composition_refactor/REQ-18` … REQ-21 replaced.
test('Config: the Environment entries flow by their own column’s width', async ({ page }) => {
  const name = `vexel-e2e-bug4-env-${Date.now()}`;
  await createFixtureContainer(name);
  try {
    await openContainerPanel(page, name, { width: 1920, height: 1080 });
    const atWide = await measureSection(environmentSection(page), 'the Environment section');
    console.log(`[REQ-19] ${report('Environment at 1920×1080', atWide)}`);
    expect(atWide.bands.length, 'the Environment section draws none of the fixture’s own variables').toBe(Object.keys(FIXTURE_ENV).length);

    await openContainerPanel(page, name, { width: 2880, height: 1440 });
    const atWider = await measureSection(environmentSection(page), 'the Environment section');
    console.log(`[REQ-19] ${report('Environment at 2880×1440', atWider)}`);

    expect(
      atWider.columns,
      `the Environment section spans ${atWider.box.width.toFixed(1)}px at 2880 × 1440 and still shows ${atWider.columns} column(s), against ${atWide.columns} at ${atWide.box.width.toFixed(1)}px`,
    ).toBeGreaterThan(atWide.columns);

    // Beside the geometry (REQ-40, REQ-31): every variable keeps its key and its whole value, now
    // read as key-in-its-track and value-in-its-track rather than as one `KEY=value` string
    // (`…-tabs_composition_refactor/REQ-18`).
    const bands = await environmentSection(page)
      .locator('.ui-definition-list__row')
      .evaluateAll((rows) =>
        Object.fromEntries(
          rows.map((row) => [row.querySelector('.ui-definition-list__label')?.textContent ?? '', row.querySelector('.ui-definition-list__value')?.textContent ?? '']),
        ),
      );
    expect(bands).toEqual(FIXTURE_ENV);

    // REQ-34 — the editing form was never opened, and this states it: the read view's own action is
    // still there, unpressed. Its place is the head of the tab now
    // (`…-tabs_composition_refactor/REQ-22`), which
    // `container-detail-config-reading.spec.ts` measures.
    await expect(containerDetail(page).getByRole('button', { name: 'Edit configuration' })).toBeVisible();
  } finally {
    await removeFixtureContainer(name);
  }
});

// REQ-17, REQ-24, REQ-12 — the Inspect tab's collapsible sections and the whole panel free of
// clipping and overlap at the four widths, the narrow end included.
//
// **Of the three sections REQ-17 names, this fixture exhibits only `Labels`**, and the title says so:
// the container is created and never started, so it has joined no network and declares no health
// check, and `Networks` and `Health` hold nothing to arrange. `property-columns-rule.spec.ts`
// measures all three on a fixture that has them. The title used to name the three and measure one;
// it was renamed to what it measures, because a title claiming more than its assertion is the same
// defect as a fixture that cannot fail, and the comment withdrawing the claim only hid it.
//
// REQ-7's degrading case — a minimum wider than the container it is given — is likewise **not**
// asserted here and is not reachable from any viewport this file uses: it lives in that same spec,
// on a section constrained to ~400px.
test('Inspect: the tab’s property section and its Labels section follow the rule, and nothing clips at 720 / 1280 / 1920 / 2560', async ({ page }) => {
  const name = `vexel-e2e-bug4-sections-${Date.now()}`;
  await createFixtureContainer(name);
  try {
    const measured: string[] = [];
    for (const viewport of CLIPPING_VIEWPORTS) {
      await openContainerPanel(page, name, viewport);
      await selectTab(page, 'Inspect');
      // Both groups, not the first alone (`…-tabs_composition_refactor/REQ-34`, REQ-43): each is a
      // section of its own and each has to clear the four widths on its own.
      for (const title of ['Identity', 'Lifecycle']) {
        const geometry = await measureSection(inspectGroup(page, title), `the Inspect tab ${title} group`);
        const evidence = report(`${title} at ${viewport.width}×${viewport.height}`, geometry);
        measured.push(evidence);
        expectNothingClippedOrOverlapped(geometry, evidence);
        expect(geometry.rightEdgeGap, `${evidence} — ${geometry.rightEdgeGap.toFixed(1)}px of dead margin on the right`).toBeLessThanOrEqual(COLUMN_GAP_PX + 1);
        if (viewport.width === 720) {
          expect(geometry.columns, `${evidence} — the section is in columns below the 720px breakpoint, where the delivered build is one`).toBe(1);
        }
      }
    }
    console.log(`[REQ-24] ${measured.join('\n[REQ-24] ')}`);

    // The Labels section, on a fixture that carries a label long enough to belong to its class.
    await openContainerPanel(page, name, { width: 1920, height: 1080 });
    await selectTab(page, 'Inspect');
    const properties = await measureSection(inspectGroup(page, 'Identity'), 'the Inspect tab Identity group');
    // Located by its own title: the header button's accessible name carries the chevron glyph too.
    const labelsSection = containerDetail(page)
      .locator('.ui-collapsible-section')
      .filter({ has: page.locator('.ui-collapsible-section__title', { hasText: /^Labels$/ }) })
      .first();
    await labelsSection.locator('.ui-collapsible-section__header').click();
    const labels = labelsSection.locator('.ui-definition-list').first();
    const labelsGeometry = await measureSection(labels, 'the Labels section');
    const labelsEvidence = report('Labels at 1920 × 1080', labelsGeometry);
    console.log(`[REQ-17] ${report('properties', properties)}\n[REQ-17] ${labelsEvidence}`);
    expectNothingClippedOrOverlapped(labelsGeometry, labelsEvidence);
    expect(
      labelsGeometry.columns,
      `${labelsEvidence} — Labels shows as many columns as the short-scalar section at the same width (${properties.columns}), so its content class is not being honoured`,
    ).toBeLessThan(properties.columns);
  } finally {
    await removeFixtureContainer(name);
  }
});
