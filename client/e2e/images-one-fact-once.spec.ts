import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { waitUntilTheScreenStatesWhatTheDaemonStates } from './support/caught-up.js';

/**
 * **Images: one fact, one place; two sizes, two names.** The operator's own path
 * through the four statements F13 makes — `plan-ui-coherence-optimisation/REQ-57`
 * … `REQ-60` — read off the browser rather than off a component:
 *
 * - a row prints its reference **once**, and a multi-tagged image still shows all
 *   of its tags (REQ-57);
 * - the panel's `Id` and `Digest` **differ**, or the field with nothing of its own
 *   is absent, and the row's `DIGEST` column never repeats the short id beside it
 *   (REQ-58);
 * - the row's size and the panel's size are stated under **different words**
 *   (REQ-59);
 * - a collapsible section with a count of `0` is **not drawn**, while one with
 *   content is unchanged (REQ-60).
 *
 * These four are claims about **what is stated**, so they are checked as content
 * — deliberately, and this is the case CLAUDE.md's geometry rule points at rather
 * than against: a duplicated string and a repeated value survive every
 * measurement of a box. The batch's geometry claim is a different one and has its
 * own file (`badge-list-pills.spec.ts`).
 *
 * Every observed pair is printed, whether the run passes or fails: the
 * requirement is about two values being distinguishable, and the numbers are what
 * makes that readable in the report.
 *
 * No test assumes an empty daemon: each finds its own row through the screen's
 * search field, and every fixture it makes it removes in a `finally`.
 */

function imageRow(page: Page, text: string): Locator {
  return page.locator('.ui-data-table__row', { hasText: text });
}

function searchField(page: Page): Locator {
  return page.getByPlaceholder('Search reference or digest…');
}

/** Selects a row by a real pointer on its first cell: the action area swallows its own clicks. */
async function openPanel(row: Locator): Promise<void> {
  await row.locator('.ui-data-table__cell').first().click();
}

/** The value a row carries in the column the table names `header`. */
async function cellText(row: Locator, header: string): Promise<string> {
  return row.evaluate((element, columnHeader) => {
    const table = element.closest('.ui-data-table')!;
    const headers = Array.from(table.querySelectorAll('.ui-data-table__header-cell')).map((cell) => cell.textContent?.trim() ?? '');
    const index = headers.indexOf(columnHeader);
    if (index < 0) throw new Error(`the list carries no ${columnHeader} column — it names [${headers.join(', ')}]`);
    // The header row leads with the multi-select cell, which a row deliberately does not mark as a
    // column cell (ui-library/specs/data-table.md).
    return element.querySelectorAll('.ui-data-table__cell')[index - 1]?.textContent?.trim() ?? '';
  }, header);
}

/** The panel's property bands, label and value, in the order they are drawn. */
async function panelBands(page: Page): Promise<{ label: string; value: string }[]> {
  const section = page.locator('.ui-detail-panel .ui-definition-list').first();
  await expect(section).toBeVisible({ timeout: 20_000 });
  return section.evaluate((list) =>
    Array.from(list.querySelectorAll('.ui-definition-list__row')).map((band) => ({
      label: band.querySelector('.ui-definition-list__label')?.textContent?.trim() ?? '',
      value: band.querySelector('.ui-definition-list__value')?.textContent?.trim() ?? '',
    })),
  );
}

/**
 * The titles of the panel's collapsible sections, with the count each is headed
 * by, read once the inspect payload has arrived.
 *
 * The wait is load-bearing rather than defensive: "no section is drawn" is also
 * what a panel that has not loaded yet looks like, so a read taken too early
 * passes REQ-60's first half for the wrong reason. The property grid is drawn
 * from the same payload as the sections, so its presence is the payload's.
 */
async function panelSections(page: Page): Promise<{ title: string; summary: string }[]> {
  await expect(page.locator('.ui-detail-panel .ui-definition-list').first()).toBeVisible({ timeout: 20_000 });
  return page.locator('.ui-detail-panel').first().evaluate((panel) =>
    Array.from(panel.querySelectorAll('.ui-collapsible-section')).map((section) => ({
      title: section.querySelector('.ui-collapsible-section__title')?.textContent?.trim() ?? '',
      summary: section.querySelector('.ui-collapsible-section__summary')?.textContent?.trim() ?? '',
    })),
  );
}

/**
 * Every tag the daemon currently gives the image behind `firstTag`, narrowed to this test's own
 * stem: the operator's tags on the same image are none of its business.
 */
async function tagsTheDaemonStates(firstTag: string, stem: string): Promise<string[]> {
  const { stdout } = await execFileAsync('docker', ['image', 'inspect', firstTag, '--format', '{{json .RepoTags}}']);
  return (JSON.parse(stdout.trim()) as string[]).filter((tag) => tag.includes(stem));
}

/**
 * Waits until the row's reference column names every tag the daemon gives the image.
 *
 * `docker tag` lands after the commit that created the image, and the list is served from a snapshot
 * the server holds: the row appears as soon as the commit is read, one tag old (`support/caught-up.ts`).
 * The wait is on the tags being **named**; how many times each is printed is what the check below
 * measures, and a row printing one of them twice satisfies this wait and still fails that assertion.
 */
async function waitForTheRowToNameEveryTag(row: Locator, firstTag: string, stem: string): Promise<void> {
  // The daemon's answer of this attempt, which the screen's side of the same attempt is read against.
  let stated: string[] = [];
  await waitUntilTheScreenStatesWhatTheDaemonStates({
    what: `the tags of ${firstTag}`,
    daemon: async () => {
      stated = await tagsTheDaemonStates(firstTag, stem);
      return stated;
    },
    screen: async () => {
      const reference = await cellText(row, 'REPOSITORY:TAG');
      return stated.filter((tag) => reference.includes(tag));
    },
  });
}

async function removeTagQuietly(tag: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', tag]).catch(() => undefined);
}

/**
 * An image of this spec's own, committed from the suite's single-file image so
 * it carries an id nothing else on the daemon shares. `changes` go into the
 * committed configuration (a label, for the section that has content).
 */
async function commitOwnImage(tag: string, containerName: string, changes: string[] = []): Promise<void> {
  await ensureImage(TINY_IMAGE);
  await execFileAsync('docker', ['create', '--name', containerName, ...ownershipArgs(containerName), TINY_IMAGE]);
  await execFileAsync('docker', ['commit', ...changes.flatMap((change) => ['--change', change]), containerName, tag]);
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115).
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
});

// plan-ui-coherence-optimisation/REQ-57 — the delivered row carried `alpine:3.20` in the reference
// column and a pill reading `alpine:3.20` beside it, on every row. A row states it once now, and an
// image genuinely carrying several tags still shows all of them.
test('a row prints its reference once, and a multi-tagged image still shows every tag', async ({ page }) => {
  const stem = `vexel-e2e-once-${Date.now()}`;
  const containerName = `${stem}-src`;
  const firstTag = `${stem}-alpha:v1`;
  const secondTag = `${stem}-beta:v2`;
  try {
    await commitOwnImage(firstTag, containerName);
    await execFileAsync('docker', ['tag', firstTag, secondTag]);
    await page.reload();

    await searchField(page).fill(stem);
    const row = imageRow(page, firstTag);
    await expect(row).toBeVisible({ timeout: 15_000 });
    // The row is drawn as soon as the commit is read, and the second tag arrives with the next read
    // of the daemon: the whole row is read once, so it is read once the row is as new as the image.
    await waitForTheRowToNameEveryTag(row, firstTag, stem);

    const text = (await row.evaluate((element) => element.textContent ?? '')).trim();
    console.log(`[REQ-57] the row of a two-tag image reads: ${text}`);

    for (const tag of [firstTag, secondTag]) {
      const printed = text.split(tag).length - 1;
      expect(printed, `[REQ-57] the row prints ${tag} ${printed} time(s): it must state each of its tags exactly once`).toBe(1);
    }
    // Both tags are in the reference column itself, which is where the whole tag list now lives.
    const reference = await cellText(row, 'REPOSITORY:TAG');
    expect(reference, `[REQ-57] the reference column reads "${reference}"`).toContain(firstTag);
    expect(reference).toContain(secondTag);
  } finally {
    await removeTagQuietly(secondTag);
    await removeTagQuietly(firstTag);
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
  }
});

// plan-ui-coherence-optimisation/REQ-58 — the delivered panel displayed the identical value under
// `Id` and under `Digest`, and the delivered row fell back to the image id in its `DIGEST` column.
// Either each shows the value it names, or the one with nothing of its own is not rendered — which
// of the two the daemon produces is the daemon's business, so both branches are legal and the one
// taken is reported.
test('the panel’s Id and Digest are two different values, or the one with nothing of its own is absent', async ({ page }) => {
  await ensureImage(ALPINE_IMAGE);
  await page.reload();
  await searchField(page).fill(ALPINE_IMAGE);
  const row = imageRow(page, ALPINE_IMAGE).first();
  await expect(row).toBeVisible({ timeout: 20_000 });

  const rowDigest = await cellText(row, 'DIGEST');
  // The reference column is a title over a short id (ui-library TwoLineCell), and the short id is
  // the value the delivered `DIGEST` column fell back to.
  const shortId = ((await row.locator('.ui-table-two-line-cell__subtitle').first().textContent()) ?? '').trim();
  console.log(`[REQ-58] ${ALPINE_IMAGE} row — short id "${shortId}", DIGEST "${rowDigest}"`);

  expect(rowDigest, '[REQ-58] the DIGEST column repeats the short id the row already states').not.toBe(shortId);

  await openPanel(row);
  const bands = await panelBands(page);
  const id = bands.find((band) => band.label === 'Id')?.value;
  const digest = bands.find((band) => band.label === 'Digest')?.value;
  console.log(`[REQ-58] ${ALPINE_IMAGE} panel — Id "${id}", Digest ${digest === undefined ? '(band absent)' : `"${digest}"`}`);

  expect(id, '[REQ-58] the panel draws no Id band').toBeDefined();
  if (digest !== undefined) {
    expect(digest, '[REQ-58] the panel draws `Id` and `Digest` carrying the identical value').not.toBe(id);
  }
  // Whichever branch this daemon takes, no value is stated twice under two names.
  const values = bands.map((band) => band.value).filter((value) => value.startsWith('sha256:'));
  expect(new Set(values).size, `[REQ-58] two bands carry the same digest: [${values.join(', ')}]`).toBe(values.length);
});

// plan-ui-coherence-optimisation/REQ-59 — the row read `13.0MB` where the panel read `3.9MB`, under
// one word. Each number is labelled with what it measures, and the two labels differ.
test('the row’s size and the panel’s size are stated under different words', async ({ page }) => {
  await ensureImage(ALPINE_IMAGE);
  await page.reload();
  await searchField(page).fill(ALPINE_IMAGE);
  const row = imageRow(page, ALPINE_IMAGE).first();
  await expect(row).toBeVisible({ timeout: 20_000 });

  const headers = await page.locator('.ui-data-table__header-cell').allTextContents();
  const rowSize = await cellText(row, 'DISK USAGE');

  await openPanel(row);
  const bands = await panelBands(page);
  const panelSize = bands.find((band) => band.label === 'Content size')?.value;
  console.log(`[REQ-59] ${ALPINE_IMAGE} — row DISK USAGE "${rowSize}" against panel Content size "${panelSize}"`);

  expect(panelSize, '[REQ-59] the panel draws no `Content size` band').toBeDefined();
  // Neither word is used for both numbers: the list does not name a column `SIZE`, and the panel
  // does not draw a band named `Size`.
  expect(headers.map((header) => header.trim()), '[REQ-59] the list still names a column `SIZE`').not.toContain('SIZE');
  expect(bands.map((band) => band.label), '[REQ-59] the panel still draws a band named `Size`').not.toContain('Size');
});

// plan-ui-coherence-optimisation/REQ-60 — the delivered panel drew a `Labels` section headed `0` on
// every image declaring none. It is absent now; a section with content is unchanged, count included.
test('no Labels section is drawn for an image declaring none, and one that has content keeps its count', async ({ page }) => {
  const stem = `vexel-e2e-labels-${Date.now()}`;
  const containerName = `${stem}-src`;
  const labelledTag = `${stem}:v1`;
  try {
    // The image with nothing to show: `alpine:3.20` declares no labels of its own.
    await ensureImage(ALPINE_IMAGE);
    await page.reload();
    await searchField(page).fill(ALPINE_IMAGE);
    const alpine = imageRow(page, ALPINE_IMAGE).first();
    await expect(alpine).toBeVisible({ timeout: 20_000 });
    await openPanel(alpine);

    const withoutLabels = await panelSections(page);
    console.log(`[REQ-60] ${ALPINE_IMAGE} panel sections: [${withoutLabels.map((section) => `${section.title} ${section.summary}`).join(' | ')}]`);
    expect(
      withoutLabels.map((section) => section.title),
      '[REQ-60] a `Labels` section is drawn for an image that declares none',
    ).not.toContain('Labels');
    expect(
      withoutLabels.filter((section) => section.summary === '0'),
      '[REQ-60] a section headed with a count of `0` is drawn',
    ).toEqual([]);

    // The image that has content: the same section, unchanged, headed by its own count.
    await commitOwnImage(labelledTag, containerName, ['LABEL vexel.e2e.batch=13']);
    await page.reload();
    await searchField(page).fill(labelledTag);
    const labelled = imageRow(page, labelledTag).first();
    await expect(labelled).toBeVisible({ timeout: 15_000 });
    await openPanel(labelled);
    // The panel on screen is this image's, not the one the previous search left: the two reads
    // below would otherwise be of the same panel and would agree for that reason.
    await expect(page.locator('.ui-detail-panel .ui-definition-list__row').filter({ hasText: 'Tags' }).first()).toContainText(labelledTag, { timeout: 20_000 });

    const withLabels = await panelSections(page);
    console.log(`[REQ-60] ${labelledTag} panel sections: [${withLabels.map((section) => `${section.title} ${section.summary}`).join(' | ')}]`);
    const labels = withLabels.find((section) => section.title === 'Labels');
    expect(labels, '[REQ-60] the section is missing from an image that does declare a label').toBeDefined();
    expect(Number(labels!.summary), '[REQ-60] the section that has content is no longer headed by its count').toBeGreaterThan(0);
  } finally {
    await removeTagQuietly(labelledTag);
    await execFileAsync('docker', ['rm', '-fv', containerName]).catch(() => undefined);
  }
});
