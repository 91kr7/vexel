/**
 * **The Config tab in reading, measured** — `…-tabs_composition_refactor/REQ-18` … `REQ-22`, under
 * REQ-40 and REQ-44.
 *
 * Four of the five requirements this file covers are claims about **position**, not about text:
 * the environment's keys and values sit on two aligned tracks (REQ-18), the `ro` chip is *told
 * apart* from the `rw` one (REQ-21), and `Edit configuration` sits above both columns and inside
 * neither (REQ-22). "The keys are listed" and "a chip says `ro`" are all true of the arrangement
 * this plan replaces, so every one of them is asserted here as a box the browser reports; the
 * content assertions stand beside them, never instead of them (CLAUDE.md, "What a check drives, and
 * what it measures").
 *
 * What jsdom can answer — which sections are drawn, what each heading claims, how a `KEY=value`
 * string is split — is asserted in `client/test/unit/container-detail-panel.test.tsx`, and is not
 * repeated here.
 *
 * **The fixture is this file's own**: a container created and never started, from the suite's own
 * `vexel-test-tiny:1`, carrying the ownership labels — with environment whose keys are of markedly
 * different lengths (which is what makes an *aligned* arrangement distinguishable from the run it
 * replaces), one value carrying an `=` of its own, one key longer than the label track, and **two
 * bind mounts, one read-only and one writable**, since no fixture in either tree had a mount at all.
 * The mounts are binds onto directories this file creates, so nothing on the daemon outlives it and
 * no anonymous volume is created; the container is removed with `docker rm -fv` and the directories
 * with it, in a `finally` (REQ-45).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { boxOf, boxesOf, clickAtItsCentre } from './support/settled.js';
import { expectNothingClippedOrOverlapped, measureSection, report, type SectionGeometry } from './support/property-bands.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { containerCard, containerDetail, openContainerDetail } from './support/container-cards.js';

const CASE_NAME = 'container-detail-config-reading';

/**
 * Keys of one, eight, four, twelve and fifty-nine characters. The spread is the point: under the
 * arrangement this plan replaces, every value began where its own key ended, so a constant value
 * offset across these five bands is reachable only by the two tracks REQ-18 asks for.
 *
 * `DATABASE_URL`'s value carries an `=` of its own (REQ-18's "first `=` only"), and the long key is
 * the one the library's label track has to wrap rather than shrink or truncate.
 */
const LONG_KEY = 'A_VERY_LONG_ENVIRONMENT_VARIABLE_NAME_THAT_OUTRUNS_ITS_TRACK';
const FIXTURE_ENV: Record<string, string> = {
  A: '1',
  NODE_ENV: 'production',
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  DATABASE_URL: 'postgres://user:secret@db.internal:5432/shop?sslmode=require&retry=1',
  [LONG_KEY]: 'short',
};

const READ_ONLY_DESTINATION = '/mnt/ro-target';
const WRITABLE_DESTINATION = '/mnt/rw-target';

/** The label track's token length and its cap (`ui-library/specs/definition-list.md`, `tokens.css`). */
const LABEL_TRACK_PX = 180;
const LABEL_TRACK_SHARE = 0.38;

interface ConfigFixture {
  name: string;
  readOnlySource: string;
  writableSource: string;
}

/**
 * A container of this file's own, created and never started: the detail reads inspect data, and
 * nothing here needs a process. Two bind mounts rather than volumes — a bind creates nothing on the
 * daemon to be swept, and the directories behind it are removed with the container.
 */
async function createConfigFixture(name: string): Promise<ConfigFixture> {
  await ensureImage(TINY_IMAGE);
  const readOnlySource = await mkdtemp(join(tmpdir(), 'vexel-e2e-config-ro-'));
  const writableSource = await mkdtemp(join(tmpdir(), 'vexel-e2e-config-rw-'));
  await execFileAsync('docker', [
    'create',
    '--name',
    name,
    ...ownershipArgs(CASE_NAME),
    ...Object.entries(FIXTURE_ENV).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
    '-v',
    `${readOnlySource}:${READ_ONLY_DESTINATION}:ro`,
    '-v',
    `${writableSource}:${WRITABLE_DESTINATION}`,
    TINY_IMAGE,
  ]);
  return { name, readOnlySource, writableSource };
}

/** A container mounting nothing, for the rule that a section with no entries is not drawn. */
async function createBareFixture(name: string): Promise<void> {
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', ['create', '--name', name, ...ownershipArgs(CASE_NAME), TINY_IMAGE]);
}

async function removeFixture(fixture: ConfigFixture | { name: string }): Promise<void> {
  // `-v` and never a bare `-f`: an anonymous volume the daemon attached on its own behalf outlives
  // the container carrying no label of ours, invisible to any later sweep.
  await execFileAsync('docker', ['rm', '-fv', fixture.name]).catch(() => undefined);
  if ('readOnlySource' in fixture) {
    await rm(fixture.readOnlySource, { recursive: true, force: true }).catch(() => undefined);
    await rm(fixture.writableSource, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Opens the detail of the container the test created, at a stated viewport, on the tab it opens on. */
async function openConfigTab(page: Page, name: string, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  // Searched for rather than looked for in the list: the operator's own containers are none of this
  // file's business, and the list may hold hundreds of them.
  await page.getByPlaceholder('Search name, image or state…').fill(name);
  await expect(containerCard(page, name), 'the fixture container never appeared in the list').toBeVisible({ timeout: 20_000 });
  await openContainerDetail(page, name);
  await expect(editAction(page), 'the Config tab never finished loading its inspect data').toBeVisible({ timeout: 20_000 });
}

/**
 * The list under a named section heading. Located through the heading an operator reads and the
 * sibling it titles, so the check names what the requirement names rather than an internal class of
 * the section's own.
 */
function sectionList(page: Page, title: string): Locator {
  return containerDetail(page).locator(`.ui-section-header:has(.ui-section-header__title:text-matches("^${title}")) + .ui-definition-list`);
}

/**
 * Every section heading of the tab's own body, in the order it draws them, each with the count it
 * claims — the badge in the header's trailing slot, which is where the counted sections of this
 * panel state a count. The dialog's header is a `SectionHeader` too — it carries the container's
 * name and its state and health pills (`…-tabs_composition_refactor/REQ-6`, REQ-7) — and is left
 * out: it heads the dialog, not the tab, and its pills are not counts.
 */
async function headings(page: Page): Promise<{ title: string; count: string }[]> {
  return await containerDetail(page)
    .locator('.ui-section-header')
    .evaluateAll((headers) =>
      headers
        .filter((header) => header.closest('.ui-modal__title') === null)
        .map((header) => ({
          title: header.querySelector('.ui-section-header__title')?.textContent ?? '',
          count: header.querySelector('.ui-badge')?.textContent ?? '',
        })),
    );
}

/** What each band of a list reads: its label, its value, and the chips the value carries. */
async function bandTexts(list: Locator): Promise<{ label: string; value: string; chips: string[] }[]> {
  return await list.locator('.ui-definition-list__row').evaluateAll((rows) =>
    rows.map((row) => ({
      label: row.querySelector('.ui-definition-list__label')?.textContent ?? '',
      value: row.querySelector('.ui-definition-list__value')?.textContent ?? '',
      chips: Array.from(row.querySelectorAll('.ui-chip')).map((chip) => chip.textContent ?? ''),
    })),
  );
}

/** The number a heading claims, for comparison with the number of bands drawn under it. */
function claimedCount(stated: string, title: string): number {
  const digits = /(\d+)/.exec(stated)?.[1];
  expect(digits, `the ${title} heading states "${stated}" instead of the number of entries it holds`).toBeDefined();
  return Number(digits);
}

/** The action REQ-22 moves, and the split it must sit above. */
function editAction(page: Page): Locator {
  return containerDetail(page).getByRole('button', { name: 'Edit configuration', exact: true });
}

function configSplit(page: Page): Locator {
  return containerDetail(page).locator('.ui-grid--pair').first();
}

/** The offsets of a band's own two tracks, from the band's leading edge. */
function trackOffsets(geometry: SectionGeometry): { labels: number[]; values: number[] } {
  return {
    labels: geometry.bands.map((band) => Math.round(((band.labelBox?.left ?? Number.NaN) - band.box.left) * 10) / 10),
    values: geometry.bands.map((band) => Math.round(((band.valueBox?.left ?? Number.NaN) - band.box.left) * 10) / 10),
  };
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

// REQ-18, REQ-19 — the environment's keys and values on two aligned tracks: every value of the
// section begins at one edge and the keys read down as a column, and the heading states the number
// of variables the section actually draws.
test('Config: the environment reads down its keys, on two aligned tracks under a counted heading', async ({ page }) => {
  const name = `vexel-e2e-config-env-${Date.now()}`;
  const fixture = await createConfigFixture(name);
  try {
    await openConfigTab(page, name, { width: 1280, height: 800 });

    const environment = await measureSection(sectionList(page, 'Environment'), 'the Environment section');
    const evidence = report('Environment at 1280 × 800', environment);
    const offsets = trackOffsets(environment);
    console.log(`[REQ-18] ${evidence}\n[REQ-18] label offsets [${offsets.labels.join(', ')}], value offsets [${offsets.values.join(', ')}]`);

    expect(environment.bands, 'the Environment section does not draw one band per variable of the fixture').toHaveLength(
      Object.keys(FIXTURE_ENV).length,
    );

    // The guard that makes the alignment falsifiable: the keys are of five different widths, so a
    // value that follows its own label — the arrangement this plan replaces — cannot produce one
    // starting edge for all five.
    const inks = environment.bands.map((band) => Math.round(band.labelInk));
    expect(new Set(inks).size, `the fixture's keys all measure the same (${inks.join(', ')}px), so this alignment check could not fail`).toBeGreaterThan(1);

    expect(
      spread(offsets.values),
      `${evidence} — the values of the section start at ${new Set(offsets.values).size} different edges (offsets ${offsets.values.join(', ')}px from their own band), so they are not on a track of their own`,
    ).toBeLessThanOrEqual(1);
    expect(
      spread(offsets.labels),
      `${evidence} — the keys start at ${new Set(offsets.labels).size} different edges (offsets ${offsets.labels.join(', ')}px), so they do not read as one column`,
    ).toBeLessThanOrEqual(1);
    expectNothingClippedOrOverlapped(environment, evidence);

    // REQ-19 — the heading counts what is under it.
    const environmentHeading = (await headings(page)).find((heading) => heading.title === 'Environment');
    expect(environmentHeading, 'the environment has no heading of its own').toBeDefined();
    expect(claimedCount(environmentHeading!.count, 'Environment'), 'the Environment heading claims a number the section does not draw').toBe(
      environment.bands.length,
    );

    // Beside the geometry: each key carries its own value, split on the first `=` only — the one
    // place a whole `KEY=value` string used to be read out of the read view.
    const bands = await bandTexts(sectionList(page, 'Environment'));
    expect(Object.fromEntries(bands.map((band) => [band.label, band.value]))).toEqual(FIXTURE_ENV);
  } finally {
    await removeFixture(fixture);
  }
});

// The library invariant the new alignment rests on (`ui-library/specs/definition-list.md`): a label
// longer than its track wraps **inside** it, and is neither shrunk nor truncated.
test('Config: a key longer than the label track wraps inside it and is never truncated', async ({ page }) => {
  const name = `vexel-e2e-config-longkey-${Date.now()}`;
  const fixture = await createConfigFixture(name);
  try {
    await openConfigTab(page, name, { width: 1280, height: 800 });

    const environment = await measureSection(sectionList(page, 'Environment'), 'the Environment section');
    const band = environment.bands.find((candidate) => candidate.label.startsWith('A_VERY_LONG'));
    expect(band, 'the long key is not drawn at all').toBeDefined();
    const track = Math.min(LABEL_TRACK_PX, band!.box.width * LABEL_TRACK_SHARE);
    console.log(
      `[definition-list] the ${band!.label.length}-character key measures ${band!.labelInk.toFixed(1)}px of ink in a ${band!.labelBox!.width.toFixed(
        1,
      )}px box over ${band!.labelLines} line(s), track ${track.toFixed(1)}px`,
    );

    expect(band!.labelLines, `the key occupies ${band!.labelInk.toFixed(1)}px of ink on one line inside a ${track.toFixed(1)}px track`).toBeGreaterThan(1);
    expect(band!.labelBox!.width, `the key's box (${band!.labelBox!.width.toFixed(1)}px) is wider than its track (${track.toFixed(1)}px)`).toBeLessThanOrEqual(
      track + 1,
    );

    // Not truncated: no ellipsis, and nothing of it hidden behind its own box.
    const overflow = await sectionList(page, 'Environment')
      .locator('.ui-definition-list__row', { hasText: LONG_KEY })
      .locator('.ui-definition-list__label')
      .evaluate((label) => ({
        textOverflow: getComputedStyle(label).textOverflow,
        scrollWidth: label.scrollWidth,
        clientWidth: label.clientWidth,
        text: label.textContent ?? '',
      }));
    expect(overflow.textOverflow, 'the key is ellipsised rather than wrapped').not.toBe('ellipsis');
    expect(overflow.scrollWidth, `${overflow.scrollWidth - overflow.clientWidth}px of the key is hidden outside its own box`).toBeLessThanOrEqual(
      overflow.clientWidth + 1,
    );
    expect(overflow.text, 'the key is not shown in full').toBe(LONG_KEY);
  } finally {
    await removeFixture(fixture);
  }
});

// REQ-20, REQ-21 — mounts are a section of their own, headed with its own count, each entry reading
// source → destination with a `ro` / `rw` chip whose treatment tells the two apart. The `mount:`
// prefix is gone from every entry.
test('Config: the mounts are a counted section, and the read-only chip is told from the writable one', async ({ page }) => {
  const name = `vexel-e2e-config-mounts-${Date.now()}`;
  const fixture = await createConfigFixture(name);
  try {
    await openConfigTab(page, name, { width: 1280, height: 800 });

    const mounts = await measureSection(sectionList(page, 'Mounts'), 'the Mounts section');
    const evidence = report('Mounts at 1280 × 800', mounts);
    console.log(`[REQ-20] ${evidence}`);
    expect(mounts.bands, 'the Mounts section does not draw one band per mount of the fixture').toHaveLength(2);
    expectNothingClippedOrOverlapped(mounts, evidence);

    const mountsHeading = (await headings(page)).find((heading) => heading.title === 'Mounts');
    expect(mountsHeading, 'the mounts have no heading of their own').toBeDefined();
    expect(claimedCount(mountsHeading!.count, 'Mounts'), 'the Mounts heading claims a number the section does not draw').toBe(mounts.bands.length);

    // Each entry: its source as the label, its destination as the value, and one chip.
    const bands = await bandTexts(sectionList(page, 'Mounts'));
    const readOnly = bands.find((band) => band.value.includes(READ_ONLY_DESTINATION));
    const writable = bands.find((band) => band.value.includes(WRITABLE_DESTINATION));
    expect(readOnly, `no entry reads ${READ_ONLY_DESTINATION}; the section shows ${JSON.stringify(bands)}`).toBeDefined();
    expect(writable, `no entry reads ${WRITABLE_DESTINATION}; the section shows ${JSON.stringify(bands)}`).toBeDefined();
    // The daemon may report the host path resolved (…/private/var/… on macOS), so the directory's
    // own name is what is asserted rather than the string handed to `docker create`.
    expect(readOnly!.label, 'the read-only entry does not carry its source').toContain(fixture.readOnlySource.split('/').pop());
    expect(writable!.label, 'the writable entry does not carry its source').toContain(fixture.writableSource.split('/').pop());
    expect(readOnly!.chips, 'the read-only mount carries no `ro` chip').toEqual(['ro']);
    expect(writable!.chips, 'the writable mount carries no `rw` chip').toEqual(['rw']);

    // REQ-21 asks for the two to be **told apart**, which two different words on one treatment are
    // not: the chips are compared as the browser paints them.
    const treatments = await containerDetail(page)
      .locator('.ui-definition-list .ui-chip')
      .evaluateAll((chips) =>
        chips.map((chip) => {
          const style = getComputedStyle(chip);
          return { label: chip.textContent ?? '', color: style.color, background: style.backgroundColor, border: style.borderColor };
        }),
      );
    const roTreatment = treatments.find((chip) => chip.label === 'ro');
    const rwTreatment = treatments.find((chip) => chip.label === 'rw');
    console.log(`[REQ-21] ro ${JSON.stringify(roTreatment)}\n[REQ-21] rw ${JSON.stringify(rwTreatment)}`);
    expect(
      [roTreatment!.color, roTreatment!.background, roTreatment!.border],
      `the ro chip is painted exactly like the rw one (${JSON.stringify(roTreatment)}), so the two differ only by their label`,
    ).not.toEqual([rwTreatment!.color, rwTreatment!.background, rwTreatment!.border]);

    // REQ-20 — the word that was repeated on every row is the heading now, and nothing else.
    expect(await containerDetail(page).innerText(), 'an entry still carries the literal `mount:` prefix').not.toMatch(/mount:/i);
  } finally {
    await removeFixture(fixture);
  }
});

// The certified column-count rule, on the regrouped sections: both declare the long-single-line
// class, so at one measured width the two show the same count as each other
// (`containers/specs/container-detail-panel.md`, `plan-docker_management_app-detail_property_columns/REQ-19`).
test('Config: the environment and the mounts, of one measured width, show the same number of columns', async ({ page }) => {
  const name = `vexel-e2e-config-parity-${Date.now()}`;
  const fixture = await createConfigFixture(name);
  try {
    await openConfigTab(page, name, { width: 1920, height: 1080 });

    const environment = await measureSection(sectionList(page, 'Environment'), 'the Environment section');
    const mounts = await measureSection(sectionList(page, 'Mounts'), 'the Mounts section');
    console.log(`[REQ-19] ${report('Environment at 1920 × 1080', environment)}\n[REQ-19] ${report('Mounts at 1920 × 1080', mounts)}`);

    expect(
      Math.abs(environment.box.width - mounts.box.width),
      `the two sections are ${environment.box.width.toFixed(1)}px and ${mounts.box.width.toFixed(1)}px wide, so a shared count would prove nothing`,
    ).toBeLessThanOrEqual(1);
    expect(
      mounts.columns,
      `the Environment section shows ${environment.columns} column(s) and the Mounts section ${mounts.columns}, at one measured width and one content class`,
    ).toBe(environment.columns);
  } finally {
    await removeFixture(fixture);
  }
});

// REQ-22, REQ-44 — the action belongs to the tab, not to a column: it is above the split, inside
// neither of its two columns, and a real pointer at its own coordinates still opens the edit form.
test('Config: Edit configuration sits at the head of the tab and still opens the edit form', async ({ page }) => {
  const name = `vexel-e2e-config-action-${Date.now()}`;
  const fixture = await createConfigFixture(name);
  try {
    await openConfigTab(page, name, { width: 1280, height: 800 });

    const boxes = await boxesOf(
      page,
      { action: editAction(page), split: configSplit(page), dialog: containerDetail(page) },
      'the Config tab in reading',
    );
    console.log(
      `[REQ-22] action ${boxes.action!.x.toFixed(1)},${boxes.action!.y.toFixed(1)} ${boxes.action!.width.toFixed(1)}×${boxes.action!.height.toFixed(
        1,
      )} / split ${boxes.split!.x.toFixed(1)},${boxes.split!.y.toFixed(1)} ${boxes.split!.width.toFixed(1)}×${boxes.split!.height.toFixed(1)}`,
    );

    expect(
      boxes.action!.y + boxes.action!.height,
      `the action's bottom edge (${(boxes.action!.y + boxes.action!.height).toFixed(1)}) is below the top of the two columns (${boxes.split!.y.toFixed(
        1,
      )}), so it is not at the head of the tab`,
    ).toBeLessThanOrEqual(boxes.split!.y + 1);

    // Above **both** columns and inside neither: not merely drawn higher, but outside the split's
    // own element, which is what "belonging to neither" means.
    const insideSplit = await editAction(page).evaluate((button) => button.closest('.ui-grid') !== null);
    expect(insideSplit, 'the action is drawn inside the two-column split, so it belongs to one of the columns').toBe(false);

    // Its place at the tab's trailing edge (`containers/specs/container-detail-panel.md`).
    expect(
      Math.abs(boxes.action!.x + boxes.action!.width - (boxes.split!.x + boxes.split!.width)),
      `the action ends at ${(boxes.action!.x + boxes.action!.width).toFixed(1)} while the tab ends at ${(boxes.split!.x + boxes.split!.width).toFixed(
        1,
      )}, so it is not at the tab's trailing edge`,
    ).toBeLessThanOrEqual(2);

    // A real pointer at the visible control's own coordinates (REQ-44), and the edit form it has
    // always opened.
    await clickAtItsCentre(page, editAction(page), 'the Edit configuration action');
    await expect(containerDetail(page).getByRole('combobox', { name: 'Restart policy' }), 'the action no longer opens the edit form').toBeVisible();

    // Beside the content: the dialog it happens inside did not move (REQ-2, the height this batch
    // depends on).
    const after = await boxOf(containerDetail(page), 'the container detail dialog');
    expect(
      { x: after.x, y: after.y, width: after.width, height: after.height },
      `opening the edit form moved the dialog from ${JSON.stringify(boxes.dialog)} to ${JSON.stringify(after)}`,
    ).toEqual({ x: boxes.dialog!.x, y: boxes.dialog!.y, width: boxes.dialog!.width, height: boxes.dialog!.height });
  } finally {
    await removeFixture(fixture);
  }
});

// `plan-ui-coherence-optimisation/REQ-60`, as `containers/specs/container-detail-panel.md` states it
// for this tab: a section with no entries is not drawn at all, its heading included.
//
// **Mounts is the half of the rule the daemon lets a fixture exhibit.** A container it creates
// always holds at least one environment variable — the daemon writes a default `PATH` when the
// image declares none — so "no environment" is not a state `docker create` can be asked for, and it
// is asserted in `client/test/unit/container-detail-panel.test.tsx`, where the inspect data is the
// test's to state. Mounting nothing is a state, and this is it.
test('Config: a container with no mounts is shown no Mounts heading', async ({ page }) => {
  const name = `vexel-e2e-config-bare-${Date.now()}`;
  await createBareFixture(name);
  try {
    await openConfigTab(page, name, { width: 1280, height: 800 });

    const titles = (await headings(page)).map((heading) => heading.title);
    console.log(`[REQ-60] the Config tab of a container mounting nothing is headed: ${titles.join(' · ') || '(nothing)'}`);
    expect(titles, 'the Mounts section is drawn anyway, headed with a count of 0').not.toContain('Mounts');
    expect(titles, 'the runtime column is gone with it').toContain('Runtime configuration');
  } finally {
    await removeFixture({ name });
  }
});

// REQ-40 — at 375 × 812 the two tracks are the arrangement that can break: nothing is clipped to
// nothing and nothing requires horizontal scrolling.
test('Config: at 375 × 812 both sections stay readable and nothing scrolls sideways', async ({ page }) => {
  const name = `vexel-e2e-config-narrow-${Date.now()}`;
  const fixture = await createConfigFixture(name);
  try {
    await openConfigTab(page, name, { width: 375, height: 812 });

    // Everything is **measured first and asserted after**, so one run reports the whole state of
    // the narrow arrangement instead of stopping at the first section that fails.
    const sections: Record<string, SectionGeometry> = {};
    for (const title of ['Environment', 'Mounts']) sections[title] = await measureSection(sectionList(page, title), `the ${title} section`);
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      const dialog = document.querySelector('.ui-modal--size-large');
      return {
        page: { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth },
        dialog: { scrollWidth: dialog?.scrollWidth ?? 0, clientWidth: dialog?.clientWidth ?? 0 },
      };
    });
    for (const [title, geometry] of Object.entries(sections)) {
      console.log(`[REQ-40] ${report(`${title} at 375 × 812`, geometry)}`);
      for (const band of geometry.bands) {
        console.log(
          `[REQ-40] ${title}: band ${band.box.width.toFixed(1)}px — label ${band.labelInk.toFixed(1)}px of ink over ${band.labelLines} line(s) in ${band.labelBox!.width.toFixed(
            1,
          )}px — value ${band.valueBox!.left.toFixed(1)}…${band.valueBox!.right.toFixed(1)} against a band of ${band.box.left.toFixed(1)}…${band.box.right.toFixed(1)}`,
        );
      }
    }
    // The `ro` / `rw` chips' own boxes, each against the band it belongs to: REQ-21's whole point is
    // that an operator finds the mount without reading either path, which is a claim about
    // something being **on screen** here — and this is exactly what a 0px value box hid, the chip
    // having been painted off the side of a viewport that could not be scrolled to it.
    const chips = await containerDetail(page)
      .locator('.ui-definition-list .ui-chip')
      .evaluateAll((elements) =>
        elements.map((chip) => {
          const box = chip.getBoundingClientRect();
          const band = chip.closest('.ui-definition-list__row')!.getBoundingClientRect();
          return {
            label: chip.textContent ?? '',
            left: box.left,
            right: box.right,
            width: box.width,
            insideBand: box.left >= band.left - 0.5 && box.right <= band.right + 0.5,
            band: { left: band.left, right: band.right },
          };
        }),
      );
    console.log(`[REQ-40] chips ${JSON.stringify(chips)}`);

    // No label is ellipsised or hidden behind its own box at this width either: the bound that
    // keeps the value drawn is a bound on the label, and a label that paid for it by losing
    // characters would be the same data loss one box to the left.
    const labels = await containerDetail(page)
      .locator('.ui-definition-list__label')
      .evaluateAll((elements) =>
        elements.map((label) => ({
          text: label.textContent ?? '',
          textOverflow: getComputedStyle(label).textOverflow,
          hidden: label.scrollWidth - label.clientWidth,
        })),
      );
    console.log(`[REQ-40] labels ${JSON.stringify(labels)}`);
    console.log(`[REQ-40] page ${JSON.stringify(overflow.page)} / dialog ${JSON.stringify(overflow.dialog)}`);

    expect(overflow.page.scrollWidth, 'the page scrolls sideways at 375 × 812').toBeLessThanOrEqual(overflow.page.clientWidth + 1);
    expect(overflow.dialog.scrollWidth, 'the detail dialog scrolls sideways at 375 × 812').toBeLessThanOrEqual(overflow.dialog.clientWidth + 1);
    for (const [title, geometry] of Object.entries(sections)) {
      const evidence = report(`${title} at 375 × 812`, geometry);
      expectNothingClippedOrOverlapped(geometry, evidence);
      for (const band of geometry.bands) {
        expect(band.labelBox!.width, `${evidence} — the key "${band.label}" is clipped to ${band.labelBox!.width.toFixed(1)}px`).toBeGreaterThan(0);
        expect(band.valueBox!.width, `${evidence} — the value of "${band.label}" is clipped to ${band.valueBox!.width.toFixed(1)}px`).toBeGreaterThan(0);
        // A box of some width is not yet a value on screen: the ink is what the browser actually
        // laid out inside it.
        expect(band.valueInk, `${evidence} — the value of "${band.label}" occupies a ${band.valueBox!.width.toFixed(1)}px box and draws no text in it`).toBeGreaterThan(
          0,
        );
      }
    }

    for (const chip of chips) {
      expect(chip.insideBand, `the ${chip.label} chip is drawn at ${chip.left.toFixed(1)}…${chip.right.toFixed(1)}, outside its own band (${chip.band.left.toFixed(1)}…${chip.band.right.toFixed(1)})`).toBe(
        true,
      );
      expect(chip.right, `the ${chip.label} chip ends at ${chip.right.toFixed(1)}, off the right edge of a 375px viewport`).toBeLessThanOrEqual(375);
      expect(chip.width, `the ${chip.label} chip is drawn ${chip.width.toFixed(1)}px wide`).toBeGreaterThan(0);
    }
    for (const label of labels) {
      expect(label.textOverflow, `the key "${label.text}" is ellipsised at 375 × 812`).not.toBe('ellipsis');
      expect(label.hidden, `${label.hidden}px of the key "${label.text}" is hidden outside its own box`).toBeLessThanOrEqual(1);
    }
  } finally {
    await removeFixture(fixture);
  }
});
