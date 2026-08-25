import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { containerCards, containerDetail, openContainerDetail, panelOwner } from './support/container-cards.js';

/**
 * The order every list service now decides survives to the screen
 * (plan-docker_management_app-list_ordering, F6).
 *
 * **Every assertion here is relative, and deliberately so.** The daemon this
 * runs against is the operator's own: their containers, images, volumes and
 * networks are interleaved with the fixtures below, are ordered like any other
 * row, and are neither filtered nor grouped away. So what is asserted is only
 * ever "mine appear in this order relative to each other" — never a position, a
 * count, a total, or a list being empty (REQ-32). Nobody should later
 * "strengthen" these into assertions about the whole list: that would make the
 * spec pass or fail on what the operator happens to own.
 *
 * What each check compares the screen against is the order the API served, which
 * is the requirement itself: the panel displays the rows in the order it
 * received them, and derives no order of its own (REQ-28).
 *
 * The fixture names are `…-2`, `…-10`, `…-A`, `…-a`, and one set proves three
 * things at once:
 *
 * - `-2` before `-10` — digit runs read as numbers (REQ-3);
 * - `-A` and `-a` adjacent rather than in two alphabets — the comparison ignores
 *   case (REQ-2);
 * - and, where a list's identity is its own name, `-A` before `-a` on every read
 *   — the tiebreak exists (REQ-5). Where the identity is an id instead
 *   (containers, networks, images), which of the two comes first is the id's to
 *   decide and is not predictable here: what is asserted there is that the pair
 *   comes out the same way twice running.
 *
 * Buildx is the one exception: it stores an instance under its name on a
 * case-insensitive filesystem, so it refuses two builders differing only in
 * case. That panel uses the leading-zero pair (`-02`, `-2`), which ties under
 * the same comparison and is separated by the same exact one.
 *
 * Nothing here activates a context or a builder: switching either changes the
 * daemon the whole run talks to, which is why the suite keeps those in
 * `e2e/exclusive/`. This spec is not exclusive and must not need to be.
 */

const RUN_ID = `${process.pid}-${Date.now()}`;

/** The four suffixes of a fixture set, in no particular order — the ordering under test is what puts them in one. */
const SUFFIXES = ['10', 'a', '2', 'A'] as const;
/** Buildx refuses two instance names differing only in case, so its tie is the leading-zero one. */
const BUILDER_SUFFIXES = ['10', '02', '2', 'B'] as const;

function fixtureNames(stem: string, suffixes: readonly string[] = SUFFIXES): string[] {
  return suffixes.map((suffix) => `${stem}-${suffix}`);
}

function stemFor(panel: string): string {
  return `vexel-e2e-order-${panel}-${RUN_ID}`;
}

// A tiny, already-cached image whose entrypoint is overridden to `sleep` so the
// container starts instantly and needs no network pull.
async function createSleepingContainer(name: string): Promise<void> {
  await execFileAsync('docker', [
    'run', '-d', '--name', name, ...ownershipArgs('list-order'), '--entrypoint', 'sleep', ALPINE_IMAGE, '300',
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/**
 * A one-layer image of the spec's own, `FROM scratch` and holding one file of
 * content unique to it, so the four fixtures are four distinct image ids rather
 * than four tags on one row. Nothing is fetched: no registry is reached and no
 * image of the operator's is tagged, which would move their row and leave a
 * trace behind if this run were killed.
 */
async function buildOwnedImage(reference: string, content: string): Promise<void> {
  const contextDir = await mkdtemp(join(tmpdir(), 'vexel-e2e-order-image-'));
  try {
    await writeFile(join(contextDir, 'marker.txt'), content, 'utf8');
    await writeFile(join(contextDir, 'Dockerfile'), ['FROM scratch', 'COPY marker.txt /marker.txt', 'CMD ["/marker.txt"]', ''].join('\n'), 'utf8');
    await execFileAsync('docker', ['build', ...ownershipArgs('list-order'), '-t', reference, contextDir]);
  } finally {
    await rm(contextDir, { recursive: true, force: true });
  }
}

async function removeImageQuietly(reference: string): Promise<void> {
  await execFileAsync('docker', ['rmi', '-f', reference]).catch(() => undefined);
}

function screenContent(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

/**
 * One panel of a screen that carries several, by the heading it is titled with.
 *
 * Named by **what it holds** rather than by the surface it used to be: a
 * converted list has its section header above its card rather than inside it
 * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`),
 * so a panel is the innermost region carrying both the heading and the list —
 * which is the same region on a screen still drawn the old way, its card.
 */
function panelTitled(page: Page, title: string): Locator {
  return screenContent(page)
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: title }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

/**
 * The fixtures in the order the API served them — the order the panel is
 * required to display and not to improve on.
 *
 * Each served entry is matched by its own serialisation, so this says nothing
 * about which field carries the name and works for a container, an image and a
 * builder alike.
 */
async function servedOrder(page: Page, path: string, fixtures: string[]): Promise<string[]> {
  const response = await page.request.get(path);
  expect(response.ok(), `${path} answered ${response.status()}`).toBeTruthy();
  const served = (await response.json()) as unknown[];
  const serialised = served.map((entry) => JSON.stringify(entry));
  return placeFixtures(serialised, fixtures);
}

/** The fixtures found in `texts`, ordered by where they were found; those not found are left out. */
function placeFixtures(texts: string[], fixtures: string[]): string[] {
  return fixtures
    .map((fixture) => ({ fixture, at: texts.findIndex((text) => text.includes(fixture)) }))
    .filter((placed) => placed.at >= 0)
    .sort((left, right) => left.at - right.at)
    .map((placed) => placed.fixture);
}

/**
 * The fixtures in the order the panel currently shows them.
 *
 * The containers and images tables mount only the rows in and around the visible
 * window, so the fixture set — contiguous in name order, since the four names
 * share a stem — is scrolled into that window before the reading. Rows belonging
 * to the operator are read past and never asserted on.
 */
async function shownOrder(rows: Locator, fixtures: string[]): Promise<string[]> {
  const anchor = rows.filter({ hasText: fixtures[0]! }).first();
  if ((await anchor.count()) > 0) await anchor.scrollIntoViewIfNeeded().catch(() => undefined);
  return placeFixtures(await rows.allTextContents(), fixtures);
}

/** Waits for every fixture to be on screen, then answers the order they are in. */
async function settledOrder(rows: Locator, fixtures: string[]): Promise<string[]> {
  await expect
    .poll(async () => (await shownOrder(rows, fixtures)).length, { timeout: 25_000 })
    .toBe(fixtures.length);
  return shownOrder(rows, fixtures);
}

/**
 * The properties one fixture set proves, read off the order the panel shows:
 * the digit run reading as a number (REQ-3), and the two tying names sitting
 * together rather than in two alphabets (REQ-2). Which of the tying two comes
 * first is checked by the caller, since only a list whose identity is its own
 * name can predict it.
 */
function expectOrderedByTheRule(shown: string[], numeric: [string, string], tied: [string, string]): void {
  expect(shown.indexOf(numeric[0]), 'a digit run reads as a number: -2 comes before -10').toBeLessThan(shown.indexOf(numeric[1]));
  expect(
    Math.abs(shown.indexOf(tied[0]) - shown.indexOf(tied[1])),
    'names that differ only in case (or in a leading zero) sit together, not in two alphabets',
  ).toBe(1);
}

// ---------------------------------------------------------------- containers

test.describe('Containers', () => {
  // Drawn from the fixtures the project already prepares for itself: no external registry is
  // reached, here or anywhere else in this spec (REQ-33).
  test.beforeAll(async () => {
    await ensureImage(ALPINE_IMAGE);
  });

  test.beforeEach(async ({ page }) => {
    await openApp(page, 'containers');
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
  });

  // REQ-28, REQ-31, REQ-32, REQ-12 — the panel shows the order it was served, and a re-read moves nothing
  test('the containers panel shows the served order, and a re-read reproduces it exactly', async ({ page }) => {
    const stem = stemFor('containers');
    const names = fixtureNames(stem);
    try {
      for (const name of names) await createSleepingContainer(name);
      const cards = containerCards(page);

      const shown = await settledOrder(cards, names);

      expect(shown).toEqual(await servedOrder(page, '/api/containers', names));
      expectOrderedByTheRule(shown, [`${stem}-2`, `${stem}-10`], [`${stem}-A`, `${stem}-a`]);

      await page.reload();
      expect(await settledOrder(cards, names), 'a re-read of the same containers must move no card').toEqual(shown);
    } finally {
      for (const name of names) await removeContainerQuietly(name);
    }
  });

  // REQ-29 — filtering keeps a subset of an ordered list ordered: a predicate, never a relevance ranking
  test('filtering the containers panel keeps the survivors in their relative order', async ({ page }) => {
    const stem = stemFor('containers-filter');
    const names = fixtureNames(stem);
    try {
      for (const name of names) await createSleepingContainer(name);
      const cards = containerCards(page);
      const unfiltered = await settledOrder(cards, names);

      await page.getByPlaceholder('Search name, image or state…').fill(stem);

      expect(await settledOrder(cards, names), 'a filter is a predicate: it removes cards, it does not re-rank them').toEqual(
        unfiltered,
      );
    } finally {
      for (const name of names) await removeContainerQuietly(name);
    }
  });

  // REQ-30 — a re-read that produces the same objects produces no visible movement: the selection and
  // the open detail panel stay on the object they were on, identified by its identity and not by its position
  test('a daemon event re-reads the list without moving the selected card or re-pointing its detail panel', async ({ page }) => {
    const stem = stemFor('containers-detail');
    const names = fixtureNames(stem);
    // Named rather than positional, and both free of case ambiguity: a locator matching text does so
    // case-insensitively, so `-A` and `-a` are addressed only through the readings taken above.
    const selected = `${stem}-2`;
    const disturbed = `${stem}-10`;
    try {
      for (const name of names) await createSleepingContainer(name);
      const cards = containerCards(page);
      const before = await settledOrder(cards, names);

      await openContainerDetail(page, selected);
      const detail = containerDetail(page);
      await expect(detail).toBeVisible();
      expect(await panelOwner(page)).toContain(selected);

      // A re-read the spec causes itself, exactly as the daemon's own events reach the application.
      await execFileAsync('docker', ['stop', '-t', '0', disturbed]);
      await expect(cards.filter({ hasText: disturbed }).first()).toContainText('EXITED', { timeout: 20_000 });

      expect(await shownOrder(cards, names), 'a re-read of the same containers must move no card').toEqual(before);
      await expect(detail).toBeVisible();
      expect(await panelOwner(page), 'the open detail panel stays on the container it was opened for').toContain(selected);
      await expect(cards.filter({ hasText: selected }).first()).toHaveClass(/ui-surface--selected/);
    } finally {
      for (const name of names) await removeContainerQuietly(name);
    }
  });
});

// -------------------------------------------------------------------- images

test.describe('Images', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, 'images-layers');
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
  });

  // REQ-28, REQ-29, REQ-31, REQ-32, REQ-22 — the panel shows the order it was served, a re-read reproduces
  // it, and filtering keeps the survivors in it
  test('the images panel shows the served order, reproduces it on a re-read, and keeps it under a filter', async ({ page }) => {
    // Four one-layer images are built here, from nothing: a build apiece, and no network at all.
    test.setTimeout(120_000);
    // A repository must be lower-case, so the four distinct images differ by tag; the tags are what
    // the ordering compares once the repository has been compared (REQ-17).
    const repository = `vexel-e2e-order-images-${RUN_ID}`.toLowerCase();
    const references = ['10', 'a', '2', 'A'].map((tag) => `${repository}:${tag}`);
    try {
      for (const reference of references) await buildOwnedImage(reference, `${reference}\n`);
      const rows = page.locator('.ui-data-table__row');

      const shown = await settledOrder(rows, references);

      expect(shown).toEqual(await servedOrder(page, '/api/images', references));
      expectOrderedByTheRule(shown, [`${repository}:2`, `${repository}:10`], [`${repository}:A`, `${repository}:a`]);

      await page.reload();
      expect(await settledOrder(rows, references), 'a re-read of the same images must move no row').toEqual(shown);

      await page.getByPlaceholder('Search reference or digest…').fill(repository);
      expect(await settledOrder(rows, references), 'a filter is a predicate: it removes rows, it does not re-rank them').toEqual(shown);
    } finally {
      for (const reference of references) await removeImageQuietly(reference);
    }
  });
});

// ------------------------------------------------------- volumes and networks

test.describe('Volumes and networks', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, 'volumes-networks');
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();
  });

  // REQ-28, REQ-31, REQ-32, REQ-16 — plus REQ-5 read off the screen: a volume's identity is its own
  // name compared exactly, so `-A` comes before `-a` and does so on every read
  test('the volumes panel shows the served order, tie included, and a re-read reproduces it', async ({ page }) => {
    const stem = stemFor('volumes');
    const names = fixtureNames(stem);
    try {
      for (const name of names) await execFileAsync('docker', ['volume', 'create', ...ownershipArgs('list-order'), name]);
      // The volumes list is the object list — the same table containers and images ship — so a row
      // is one of its rows; the order it is served in is unchanged by that.
      const rows = panelTitled(page, 'Volumes').locator('.ui-data-table__row');

      const shown = await settledOrder(rows, names);

      expect(shown).toEqual(await servedOrder(page, '/api/volumes', names));
      expectOrderedByTheRule(shown, [`${stem}-2`, `${stem}-10`], [`${stem}-A`, `${stem}-a`]);
      expect(shown, 'a volume carries no identity but its name compared exactly').toEqual([
        `${stem}-2`, `${stem}-10`, `${stem}-A`, `${stem}-a`,
      ]);

      await page.reload();
      expect(await settledOrder(rows, names), 'a re-read of the same volumes must move no row').toEqual(shown);
    } finally {
      for (const name of names) await execFileAsync('docker', ['volume', 'rm', '-f', name]).catch(() => undefined);
    }
  });

  // REQ-28, REQ-31, REQ-32, REQ-12 — a network's identity is its id, so which of the tying pair comes
  // first is the id's to decide; what is required of the screen is that it comes out the same way twice
  test('the networks panel shows the served order, and a re-read reproduces it', async ({ page }) => {
    const stem = stemFor('networks');
    const names = fixtureNames(stem);
    try {
      for (const name of names) await execFileAsync('docker', ['network', 'create', ...ownershipArgs('list-order'), name]);
      const rows = panelTitled(page, 'Networks').locator('.ui-data-table__row');

      const shown = await settledOrder(rows, names);

      expect(shown).toEqual(await servedOrder(page, '/api/networks', names));
      expectOrderedByTheRule(shown, [`${stem}-2`, `${stem}-10`], [`${stem}-A`, `${stem}-a`]);

      await page.reload();
      expect(await settledOrder(rows, names), 'a re-read of the same networks must move no row').toEqual(shown);
    } finally {
      for (const name of names) await execFileAsync('docker', ['network', 'rm', '-f', name]).catch(() => undefined);
    }
  });
});

// ------------------------------------------------------------------ contexts

test.describe('Contexts', () => {
  // A Docker context carries no label, so a name prefix is the only handle there is — and a spec
  // killed by its own timeout never reaches its `finally`, which is exactly when a leftover appears.
  test.afterAll(async () => {
    const { stdout } = await execFileAsync('docker', ['context', 'ls', '--format', '{{.Name}}']).catch(() => ({ stdout: '' }));
    for (const name of stdout.split('\n').filter((entry) => entry.startsWith('vexel-e2e-order-contexts-'))) {
      await execFileAsync('docker', ['context', 'rm', '-f', name]).catch(() => undefined);
    }
  });

  test.beforeEach(async ({ page }) => {
    await openApp(page, 'contexts');
    await expect(screenContent(page).getByRole('heading', { level: 2, name: 'Docker contexts' })).toBeVisible();
  });

  // REQ-28, REQ-31, REQ-32 — plus REQ-10 read off the screen: a context carries no identity but its own
  // name compared exactly, and nothing is ever activated here
  test('the contexts panel shows the served order, tie included, and a re-read reproduces it', async ({ page }) => {
    const stem = stemFor('contexts');
    const names = fixtureNames(stem);
    try {
      for (const name of names) {
        await execFileAsync('docker', ['context', 'create', name, '--docker', 'host=ssh://operator@build-host']);
      }
      await page.reload();
      // The list is the object list — the same table containers and images ship
      // (plan-ui-coherence-optimisation/REQ-42, and the classic-table plan's REQ-17); the order it
      // is served in is unchanged by that.
      const rows = panelTitled(page, 'Docker contexts').locator('.ui-data-table__row');

      const shown = await settledOrder(rows, names);

      expect(shown).toEqual(await servedOrder(page, '/api/contexts', names));
      expectOrderedByTheRule(shown, [`${stem}-2`, `${stem}-10`], [`${stem}-A`, `${stem}-a`]);
      expect(shown, 'a context carries no identity but its name compared exactly').toEqual([
        `${stem}-2`, `${stem}-10`, `${stem}-A`, `${stem}-a`,
      ]);

      await page.reload();
      expect(await settledOrder(rows, names), 'a re-read of the same contexts must move no row').toEqual(shown);
    } finally {
      for (const name of names) await execFileAsync('docker', ['context', 'rm', '-f', name]).catch(() => undefined);
    }
  });
});

// ------------------------------------------------------------------ builders

test.describe('Builders', () => {
  // A buildx instance carries no label either, and the same reasoning applies.
  test.afterAll(async () => {
    const { stdout } = await execFileAsync('docker', ['buildx', 'ls', '--format', '{{.Name}}']).catch(() => ({ stdout: '' }));
    for (const name of stdout.split('\n').map((entry) => entry.trim()).filter((entry) => entry.startsWith('vexel-e2e-order-builders-'))) {
      await execFileAsync('docker', ['buildx', 'rm', name]).catch(() => undefined);
    }
  });

  test.beforeEach(async ({ page }) => {
    await openApp(page, 'builders-cache');
    await expect(page.getByRole('heading', { level: 1, name: 'Builders & cache' })).toBeVisible();
  });

  // REQ-28, REQ-31, REQ-32 — plus REQ-11 read off the screen: a builder carries no identity but its own
  // name compared exactly, and nothing is ever made active here
  test('the builders panel shows the served order, tie included, and a re-read reproduces it', async ({ page }) => {
    const stem = stemFor('builders');
    const names = fixtureNames(stem, BUILDER_SUFFIXES);
    try {
      // Never bootstrapped: creating an instance writes buildx configuration and starts nothing, so
      // no builder image is needed and no registry is reached.
      for (const name of names) await execFileAsync('docker', ['buildx', 'create', '--name', name, '--driver', 'docker-container']);
      await page.reload();
      // The builders panel is the object list since `plan-ui-coherence-optimisation/REQ-39`, and
      // the card list it replaced was deleted at REQ-82: a row is a row of the object list.
      const rows = panelTitled(page, 'buildx builders').locator('.ui-data-table__row');

      const shown = await settledOrder(rows, names);

      expect(shown).toEqual(await servedOrder(page, '/api/builders', names));
      expectOrderedByTheRule(shown, [`${stem}-2`, `${stem}-10`], [`${stem}-02`, `${stem}-2`]);
      expect(shown, 'a builder carries no identity but its name compared exactly').toEqual([
        `${stem}-02`, `${stem}-2`, `${stem}-10`, `${stem}-B`,
      ]);

      await page.reload();
      expect(await settledOrder(rows, names), 'a re-read of the same builders must move no row').toEqual(shown);
    } finally {
      for (const name of names) await execFileAsync('docker', ['buildx', 'rm', name]).catch(() => undefined);
    }
  });
});
