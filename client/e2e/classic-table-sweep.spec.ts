/**
 * **The sweep that makes both claims product-wide** — no list anywhere draws a
 * row on a surface of its own, and every converted list **is** the containers
 * table
 * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-2`
 * … `REQ-5`, `REQ-28`, `REQ-30`, `REQ-32`, `REQ-39`, `REQ-40`; batch 4,
 * `INT-4`).
 *
 * **Why a sweep exists at all, next to four criteria files that measure the same
 * lists.** Batches 1 to 3 assert their own lists, batch 4 asserts the dialog's
 * three; four green files say "each batch did its part", which is not the claim.
 * The claim is about the **product**: that there is no list left anywhere drawn
 * the other way. Inferring that from four batches having passed is exactly the
 * inference this plan exists to refuse — the reference programme "migrated the
 * nine list screens" and left three call sites behind, in a dialog nobody
 * enumerated.
 *
 * **So it is written as a walk, not as a list of cases.** Every screen is opened
 * and **every table it draws is measured**, found by its position rather than by
 * a name: a check that knew its lists by name could not find the one nobody
 * enumerated, which is the very list it is here for. A screen added later is
 * covered by it on the day it is added.
 *
 * **The reference side is read from containers and images in the same run**,
 * never from a figure written here: REQ-39 and REQ-40 are comparisons against
 * those two lists *as they stand in the tree*, and a number copied into a check
 * rots the day the reference legitimately changes. Containers and images are
 * swept too — asserting that they are unchanged is part of it.
 *
 * **What is out of scope is named, with its reason, rather than filtered.** Five
 * call sites are legitimately not the converted list, and each is excluded **by
 * name** in `EXCLUDED_BY_NAME` below. A filter broad enough to hide them would
 * also hide a converted list, and a sweep that fails on something it was never
 * meant to cover is a sweep that gets narrowed under pressure — and then it
 * stops sweeping. The walk asserts that every exclusion it should have met, it
 * did meet: an exclusion that no longer matches anything is reported rather than
 * left as a silent allowance.
 *
 * **Test discipline** (REQ-32): the daemon-backed rows are this file's own — two
 * containers, two volumes, one image tag, one built image and two compose
 * projects, each labelled and each removed in an `afterAll`, containers with
 * `docker rm -fv`. The inventories a daemon will not produce on demand (builders,
 * contexts, plugins) are answered **in the browser** from
 * `support/screen-inventories.ts`, the same fixture batch 2 measures through, and
 * the registries screen is read from the suite's own fixture server so that no
 * credential store of the operator's is ever consulted. Nothing here asserts a
 * total, a count of the machine's own objects, or a list being empty.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from './support/test.js';
import { CASE_LABEL, OWNER_LABEL, RUN_ID, openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { stubRepositories, stubTheInventories } from './support/screen-inventories.js';
import { startRegistryFixtureServer, type RegistryFixtureServer } from './support/registry-fixture-server.js';
import {
  buildEfficiencyFixtureImage,
  clickAt,
  openTheAnalysedDialog,
  removeEfficiencyFixtureImage,
} from './support/layer-efficiency-dialog.js';
import { containerCard, containerCards, containerDetail, openContainerDetail } from './support/container-cards.js';
import {
  LARGE_DIALOG_REGION,
  VIEWPORTS,
  expectClassicTable,
  expectFlushRuledRows,
  expectListInsideADialog,
  expectSameRowAsReference,
  expectSameTableAsReference,
  measureEveryList,
  round,
  settledList,
  tableWithColumn,
  type ListGeometry,
  type Viewport,
} from './support/classic-table.js';

const DESKTOP: Viewport = VIEWPORTS[0];
const PHONE: Viewport = VIEWPORTS[2];

const CASE_NAME = 'classic-table-sweep';
const SUFFIX = RUN_ID.slice(-10);
const containerNames = [`vexel-e2e-sweep-a-${SUFFIX}`, `vexel-e2e-sweep-b-${SUFFIX}`];
const volumeNames = [`vexel-e2e-sweep-vol-a-${SUFFIX}`, `vexel-e2e-sweep-vol-b-${SUFFIX}`];
const imageTag = `vexel-e2e-sweep-ref-${SUFFIX}:1`;
const efficiencyImage = `vexel-e2e-sweep-eff-${SUFFIX}:v1`;
const MULTI_PROJECT = `vexel-e2e-sweep-multi-${SUFFIX}`;
const SOLO_PROJECT = `vexel-e2e-sweep-solo-${SUFFIX}`;

/** The two reference lists, named by a column only each of them carries. */
const REFERENCE = { images: 'DISK USAGE' } as const;

// ---------------------------------------------------------------------------
// What the sweep is not about, named one by one.
// ---------------------------------------------------------------------------

/**
 * **The five call sites that are legitimately not the converted list.**
 *
 * Each is named by its file and line, with the reason it is out of scope and a
 * predicate that matches **it alone** — never a class of lists. None of them is
 * one of the plan's 21 sites and none is the reference.
 *
 * `metOn` is the screen the walk below should find it on, or `null` for one that
 * a screen-level walk cannot reach at all (it is drawn inside a dialog or a
 * detail panel the walk does not open). Where it is a screen, the walk asserts
 * the exclusion **was** met: an entry that has stopped matching anything is an
 * allowance nobody is checking, and this plan has met that shape often enough to
 * refuse it.
 */
const EXCLUDED_BY_NAME: {
  callSite: string;
  reason: string;
  metOn: string | null;
  matches: (list: ListGeometry, screen: string) => boolean;
}[] = [
  {
    callSite: 'CoverageMatrixScreen.tsx:166',
    reason:
      'states content-sized rows deliberately, for the wrapping-text case the library documents; the one entry b5/INT-10 pins',
    metOn: 'coverage-matrix',
    matches: (list) => list.headers.includes('Capability area') && list.headers.includes('Command and reason'),
  },
  {
    callSite: 'DashboardScreen.tsx:228',
    reason: 'a header-less activity list inside a padded card, not an object list of a screen',
    metOn: 'dashboard',
    matches: (list, screen) => screen === 'dashboard' && list.headers.length === 0,
  },
  {
    callSite: 'LayerExplorer.tsx:221',
    reason: 'the layer stack list, drawn inside the layer-stack dialog and not on a screen',
    metOn: null,
    matches: (list) => list.headers.includes('INSTRUCTION') && list.headers.includes('SHARED'),
  },
  {
    callSite: 'LayerExplorer.tsx:250',
    reason: "a layer's changeset list, drawn inside that dialog's own expansion",
    metOn: null,
    matches: (list) => list.headers.length === 3 && list.headers[0] === '' && list.headers[1] === 'PATH',
  },
  {
    callSite: 'ContainerProcessesView.tsx:84',
    reason:
      "the process list inside a container's detail dialog, with a row height of its own and bounded by the region its tab offers rather than by a cap (tabs_composition_refactor/REQ-32)",
    metOn: null,
    matches: (list) => list.headers.includes('PID') && list.headers.includes('Command'),
  },
];

/** The exclusion this list matches, if any — by name, one predicate at a time. */
function excludedBy(list: ListGeometry, screen: string): (typeof EXCLUDED_BY_NAME)[number] | undefined {
  return EXCLUDED_BY_NAME.find((entry) => entry.matches(list, screen));
}

// ---------------------------------------------------------------------------
// The fixtures.
// ---------------------------------------------------------------------------

/** One service block, labelled for ownership, `pull_policy: never` so nothing is ever fetched. */
function serviceBlock(name: string, command: string): string {
  return [
    `  ${name}:`,
    `    image: ${ALPINE_IMAGE}`,
    '    pull_policy: never',
    `    command: ${command}`,
    '    labels:',
    `      - "${OWNER_LABEL}=${RUN_ID}"`,
    `      - "${CASE_LABEL}=${CASE_NAME}"`,
  ].join('\n');
}

let composeDir: string | undefined;
let registryFixture: RegistryFixtureServer;

test.beforeAll(async () => {
  // Ensured at the point of use rather than once for the run: a prune spec in this suite prunes the host.
  await ensureImage(ALPINE_IMAGE);
  await buildEfficiencyFixtureImage(efficiencyImage, CASE_NAME);

  for (const name of containerNames) {
    await execFileAsync('docker', [
      'run',
      '-d',
      '--name',
      name,
      ...ownershipArgs(CASE_NAME),
      '--entrypoint',
      'sleep',
      ALPINE_IMAGE,
      '1200',
    ]);
  }
  for (const name of volumeNames) {
    await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(name), name]);
  }
  await execFileAsync('docker', ['tag', ALPINE_IMAGE, imageTag]);

  composeDir = await mkdtemp(join(tmpdir(), 'vexel-e2e-sweep-'));
  const multiFile = join(composeDir, 'multi.yml');
  await writeFile(multiFile, `services:\n${serviceBlock('api', '["sleep", "1200"]')}\n${serviceBlock('web', '["sleep", "1200"]')}\n`, 'utf8');
  await execFileAsync('docker', ['compose', '-f', multiFile, '-p', MULTI_PROJECT, 'up', '-d']);
  const soloFile = join(composeDir, 'solo.yml');
  await writeFile(soloFile, `services:\n${serviceBlock('solo', '["sleep", "1200"]')}\n`, 'utf8');
  await execFileAsync('docker', ['compose', '-f', soloFile, '-p', SOLO_PROJECT, 'up', '-d']);

  registryFixture = await startRegistryFixtureServer();
});

test.afterAll(async () => {
  for (const project of [MULTI_PROJECT, SOLO_PROJECT]) {
    // Removed by their own compose project label, so teardown never depends on
    // the fixture's file still being on disk.
    const containers = await execFileAsync('docker', ['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`]).catch(() => ({
      stdout: '',
    }));
    const ids = containers.stdout.split('\n').filter((id) => id.length > 0);
    // `-fv` and not `-f`: without it an image's anonymous volumes outlive the container.
    if (ids.length > 0) await execFileAsync('docker', ['rm', '-fv', ...ids]).catch(() => undefined);
    const networks = await execFileAsync('docker', ['network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`]).catch(
      () => ({ stdout: '' }),
    );
    const networkIds = networks.stdout.split('\n').filter((id) => id.length > 0);
    if (networkIds.length > 0) await execFileAsync('docker', ['network', 'rm', ...networkIds]).catch(() => undefined);
  }
  for (const name of containerNames) {
    await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
  }
  for (const name of volumeNames) {
    await execFileAsync('docker', ['volume', 'rm', '-f', name]).catch(() => undefined);
  }
  await execFileAsync('docker', ['rmi', '-f', imageTag]).catch(() => undefined);
  await removeEfficiencyFixtureImage(efficiencyImage);
  if (composeDir) await rm(composeDir, { recursive: true, force: true }).catch(() => undefined);
  await registryFixture?.stop();
});

// ---------------------------------------------------------------------------
// The walk.
// ---------------------------------------------------------------------------

/**
 * The screens the walk opens, and the **minimum** number of object lists each
 * must be found drawing.
 *
 * The minimum is the guard against the whole sweep going vacuous: a screen whose
 * lists have quietly stopped being drawn — an empty state, a failed read, a
 * fixture that did not take — offers nothing to measure, and a walk that
 * measured nothing would pass. It is a *minimum* rather than an exact count so
 * that a screen gaining a list is covered rather than failed by this file.
 *
 * It is also **what the walker waits for**, and not only what is asserted once
 * the walk is over: `measureEveryList` is handed this figure, so a screen stated
 * to draw two is no longer read while only the first has arrived, and a screen
 * stated to draw none settles on a stable zero instead of polling for twenty
 * seconds against a condition it cannot meet (see `listCountOnceItStops`).
 *
 * `content` is how a screen that draws **no table at all** still proves it has
 * loaded: its own content is waited for first, so the zero the walker then reads
 * is a zero the screen means rather than a read that has not landed. Only the
 * containers screen needs it — every other stop draws something the counter can
 * see, whether the sweep keeps it or excludes it by name.
 */
const WALK: { screen: string; heading: string; lists: number; content?: (page: Page) => Locator }[] = [
  { screen: 'dashboard', heading: 'Dashboard', lists: 0 },
  // Zero on purpose since 2026-08-25: the containers screen draws one card per container and no
  // table at all (`plan-docker_management_app-containers_card_view/REQ-1`). It stays on the walk so
  // that a list reappearing there is swept like any other rather than going unvisited — and its
  // cards are what the walk waits for, since it draws nothing the table counter could wait on.
  { screen: 'containers', heading: 'Containers', lists: 0, content: containerCards },
  { screen: 'images-layers', heading: 'Images & layers', lists: 1 },
  { screen: 'volumes-networks', heading: 'Volumes & networks', lists: 2 },
  { screen: 'builders-cache', heading: 'Builders & cache', lists: 2 },
  { screen: 'contexts', heading: 'Contexts', lists: 1 },
  { screen: 'plugins', heading: 'Plugins', lists: 2 },
  { screen: 'compose', heading: 'Compose', lists: 2 },
  { screen: 'coverage-matrix', heading: 'About', lists: 0 },
];

interface Swept {
  screen: string;
  name: string;
  list: ListGeometry;
  nested: boolean;
}

/** One line per list, its figures beside the reference's own — the table that answers REQ-39 and REQ-40. */
function reportSwept(at: string, swept: Swept, reference: ListGeometry): void {
  const row = swept.list.rows[0];
  const referenceRow = reference.rows[0];
  const inset = swept.list.card
    ? `${round(swept.list.table.x - swept.list.card.x)} / ${round(swept.list.card.right - swept.list.table.right)}`
    : 'no card';
  const referenceInset = reference.card
    ? `${round(reference.table.x - reference.card.x)} / ${round(reference.card.right - reference.table.right)}`
    : 'no card';
  console.log(
    `[b4/REQ-39] ${at} ${swept.screen} · ${swept.name}: ${swept.list.rows.length} row(s), ` +
      `height ${round(row?.height ?? Number.NaN)} vs ${round(referenceRow?.height ?? Number.NaN)}, ` +
      `align-items ${row?.alignItems ?? '–'} vs ${referenceRow?.alignItems ?? '–'}, ` +
      `modifiers ${JSON.stringify(row?.modifiers ?? [])} vs ${JSON.stringify(referenceRow?.modifiers ?? [])}, ` +
      `table edges inset ${inset} vs ${referenceInset}, ` +
      `${swept.list.rows.filter((candidate) => candidate.isSurface).length} row(s) on a surface of their own, ` +
      `${swept.list.enclosingSurfaces} enclosing surface(s)`,
  );
}

/** Everything the sweep claims of one list, by the kind of list it is. */
function assertSwept(at: string, swept: Swept, references: { name: string; list: ListGeometry }[]): void {
  const where = `${at} ${swept.screen} · ${swept.name}`;
  if (swept.nested) {
    // A list drawn inside a *row* of another one draws no header and takes no
    // card: it is inside its parent's, and a card inside a card is two surfaces
    // where REQ-4 admits one. The header and edge halves do not apply to it —
    // they are not weakened for it, and this says so on the spot (REQ-7, and
    // `classic-table-criteria-nested-lists.spec.ts` measures its indentation).
    expectFlushRuledRows(at, swept.name, swept.list);
    expectSameRowAsReference(at, swept.name, swept.list, references);
    expect(swept.list.enclosingSurfaces, `${where}: a nested list sitting inside ${swept.list.enclosingSurfaces} surfaces`).toBe(1);
    expect(swept.list.surfacesInside, `${where}: a nested list holding ${swept.list.surfacesInside} surface(s) of its own`).toBe(0);
    return;
  }
  expectClassicTable(at, `${swept.screen} · ${swept.name}`, swept.list);
  expectSameTableAsReference(at, `${swept.screen} · ${swept.name}`, swept.list, references);
}

/**
 * The reference list, read from the tree in this same run and in this same browser.
 *
 * **It was two, and the containers list left it on 2026-08-25**
 * (`plan-docker_management_app-containers_card_view/REQ-1`, `REQ-63`): that screen draws one card
 * per container now and is the single named exception to the classic table, so it cannot be the
 * table every other list is swept against. The images list — still the classic table, and already
 * the second reference here — is what remains.
 */
async function readTheReference(page: Page, at: string): Promise<{ name: string; list: ListGeometry }[]> {
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 20_000 });
  // The row this file created is what the reference is read on: never a total, never an emptiness.
  await expect(
    page.locator('.ui-data-table__row', { hasText: imageTag }).first(),
    `${at}: the image this spec created is not listed, so the reference row may be anybody's`,
  ).toBeVisible({ timeout: 30_000 });
  const images = await settledList(page, REFERENCE.images);
  return [{ name: 'images', list: images }];
}

/**
 * **The walk goes red when there is nothing to walk over** — the counter-practice
 * this plan carries, executed rather than claimed.
 *
 * A sweep is the one check whose failure mode is silence: it names no list, so a
 * region that draws none produces an empty walk, no assertion fires, and the
 * screen is reported swept. So the walker is pointed at a region that exists
 * nowhere on the page and both halves are asserted — it finds nothing, and the
 * premise written on that nothing **throws**. This is not hypothetical: the
 * per-screen minimum below caught exactly this shape while it was being written,
 * on a compose screen counted before its projects had arrived.
 */
test('the sweep goes red when the region it walks draws no list — 1440×1000', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize(DESKTOP);
  // Read on the images screen since 2026-08-25: the containers screen this stood on draws no table
  // at all now (`plan-docker_management_app-containers_card_view/REQ-1`), and a screen drawing none
  // is exactly the state this test must **not** stand on — it would pass by accident.
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 30_000 });
  // The screen behind genuinely draws a converted list, so what is asserted is
  // the walker refusing to wander outside its region, not an empty page.
  const onTheScreen = await measureEveryList(page);
  expect(onTheScreen.length, 'the images screen draws no list, so this proves nothing about scoping').toBeGreaterThan(0);

  // No dialog is open, so the dialog region matches nothing at all. `atLeast: 0` is what says that
  // emptiness is the expected answer here: without it the counter waits its whole budget for a list
  // that this test exists to prove will never come, which cost this file 20.2s of its 117s.
  const nowhere = await measureEveryList(page, { region: LARGE_DIALOG_REGION, atLeast: 0 });
  console.log(`[b4/INT-4] with no dialog open, the walker finds ${nowhere.length} list(s) inside it`);
  expect(nowhere, 'the walker found lists inside a dialog that is not open').toEqual([]);
  expect(
    () => expect(nowhere.length, 'a screen with no list found').toBeGreaterThanOrEqual(1),
    'the per-screen premise passes on a region drawing no list at all',
  ).toThrow();
});

for (const viewport of [DESKTOP, PHONE]) {
  const at = `${viewport.width}×${viewport.height}`;

  test(`every list in the product is the reference table, and none draws a row on a surface of its own — ${at}`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(1_800_000);
    await page.setViewportSize(viewport);
    await stubTheInventories(page);
    await stubRepositories(page);

    const references = await readTheReference(page, at);
    const swept: Swept[] = [];
    const excluded: { callSite: string; screen: string; name: string }[] = [];

    // --- the screens ---------------------------------------------------------
    for (const stop of WALK) {
      await openApp(page, stop.screen);
      await expect(page.getByRole('heading', { level: 1, name: stop.heading })).toBeVisible({ timeout: 30_000 });
      if (stop.content) {
        await expect(
          stop.content(page).first(),
          `${at} ${stop.screen}: the screen drew none of its own content, so a count of zero lists would prove nothing`,
        ).toBeVisible({ timeout: 30_000 });
      }
      const found = await measureEveryList(page, { atLeast: stop.lists });
      const kept: Swept[] = [];
      for (const { name, list } of found) {
        const exclusion = excludedBy(list, stop.screen);
        if (exclusion) {
          excluded.push({ callSite: exclusion.callSite, screen: stop.screen, name });
          console.log(`[b4/INT-4] ${at} ${stop.screen} · ${name}: excluded by name — ${exclusion.callSite}, ${exclusion.reason}`);
          continue;
        }
        kept.push({ screen: stop.screen, name, list, nested: list.tableClasses.includes('ui-data-table--nested') });
      }
      console.log(
        `[b4/INT-4] ${at} ${stop.screen}: ${found.length} table(s) drawn, ${kept.length} of them converted object lists — ${JSON.stringify(
          kept.map((candidate) => candidate.name),
        )}`,
      );
      // The premise, per screen: the lists this walk is about are actually drawn.
      expect(
        kept.length,
        `${at} ${stop.screen}: ${kept.length} object list(s) found where the screen draws at least ${stop.lists}`,
      ).toBeGreaterThanOrEqual(stop.lists);
      swept.push(...kept);
    }

    // --- the registries screen, on the run's own inventory --------------------
    const registriesContext = await browser.newContext({ baseURL: registryFixture.origin, viewport });
    const registriesPage = await registriesContext.newPage();
    try {
      await stubRepositories(registriesPage);
      await openApp(registriesPage, 'registries');
      await expect(registriesPage.getByRole('heading', { level: 1, name: 'Registries' })).toBeVisible({ timeout: 30_000 });
      await registriesPage.getByLabel('Search repositories').fill('vexel-e2e');
      const found = await measureEveryList(registriesPage, { atLeast: 2 });
      console.log(
        `[b4/INT-4] ${at} registries: ${found.length} table(s) drawn — ${JSON.stringify(found.map((candidate) => candidate.name))}`,
      );
      expect(found.length, `${at} registries: fewer than the two lists this screen draws`).toBeGreaterThanOrEqual(2);
      for (const { name, list } of found) {
        const swept4 = { screen: 'registries', name, list, nested: list.tableClasses.includes('ui-data-table--nested') };
        assertSwept(at, swept4, references);
        reportSwept(at, swept4, references[0].list);
        swept.push(swept4);
      }
    } finally {
      await registriesContext.close();
    }

    // --- the dialog, the one converted list that is not on a screen -----------
    await openTheAnalysedDialog(page, efficiencyImage);
    const inTheDialog = await measureEveryList(page, { region: LARGE_DIALOG_REGION, atLeast: 3 });
    console.log(
      `[b4/INT-4] ${at} efficiency & signals: ${inTheDialog.length} table(s) drawn — ${JSON.stringify(
        inTheDialog.map((candidate) => candidate.name),
      )}`,
    );
    expect(inTheDialog.length, `${at} the efficiency dialog: fewer than the three lists it draws`).toBeGreaterThanOrEqual(3);
    for (const { name, list } of inTheDialog) {
      const swept4: Swept = { screen: 'efficiency & signals', name, list, nested: false };
      expectClassicTable(at, `efficiency & signals · ${name}`, list);
      expectSameTableAsReference(at, `efficiency & signals · ${name}`, list, references);
      expectListInsideADialog(at, `efficiency & signals · ${name}`, list);
      reportSwept(at, swept4, references[0].list);
      swept.push(swept4);
    }

    // --- what the walk found, and the two claims over all of it ---------------
    for (const candidate of swept.filter((entry) => entry.screen !== 'registries' && entry.screen !== 'efficiency & signals')) {
      assertSwept(at, candidate, references);
      reportSwept(at, candidate, references[0].list);
    }

    const rowsOnASurfaceOfTheirOwn = swept.flatMap((entry) =>
      entry.list.rows.filter((row) => row.isSurface).map((row) => `${entry.screen} · ${entry.name} · ${row.label}`),
    );
    const listsWithAGap = swept.flatMap((entry) =>
      entry.list.rowJunctions.filter((junction) => Math.abs(junction.gap) > 0.5).map((junction) => `${entry.screen} · ${entry.name}: ${junction.label}`),
    );
    console.log(
      `[b4/REQ-39] ${at}: ${swept.length} list(s) swept over ${WALK.length + 2} screens, ${swept.reduce(
        (total, entry) => total + entry.list.rows.length,
        0,
      )} row(s); ${rowsOnASurfaceOfTheirOwn.length} row(s) on a surface of their own; ${listsWithAGap.length} junction(s) with a gap`,
    );
    expect(rowsOnASurfaceOfTheirOwn, `${at}: a list still draws its rows on surfaces of their own`).toEqual([]);
    expect(listsWithAGap, `${at}: two adjacent rows are still separated by a gap`).toEqual([]);

    // The sweep's own premise: it really did walk over lists, and enough of them.
    // A walk that found nothing would satisfy every assertion above.
    //
    // It was 18 while the swarm screen was in the product, and the screen contributed **five**
    // lists to this walk. It left on 2026-08-27 (plan-docker_management_app-swarm_removal/REQ-1),
    // so the floor moves by exactly those five and by nothing else: the margin it was chosen with
    // is the margin it keeps.
    expect(swept.length, `${at}: the sweep found ${swept.length} list(s), which is fewer than this product draws`).toBeGreaterThanOrEqual(
      13,
    );

    // …and the exclusions are named rather than filtered: every one the walk
    // should have met, it met. An entry matching nothing is an allowance nobody
    // is checking.
    console.log(`[b4/INT-4] ${at}: excluded by name — ${JSON.stringify(excluded.map((entry) => `${entry.callSite} on ${entry.screen}`))}`);
    for (const entry of EXCLUDED_BY_NAME.filter((candidate) => candidate.metOn !== null)) {
      expect(
        excluded.filter((met) => met.callSite === entry.callSite).length,
        `${at}: ${entry.callSite} was excluded by name and the walk never met it on ${entry.metOn} — the exclusion matches nothing`,
      ).toBe(1);
    }
    for (const entry of EXCLUDED_BY_NAME.filter((candidate) => candidate.metOn === null)) {
      expect(
        excluded.filter((met) => met.callSite === entry.callSite).length,
        `${at}: ${entry.callSite} is drawn inside a dialog or a panel this walk does not open, yet the walk met it on a screen`,
      ).toBe(0);
    }
  });
}

/**
 * **The three exclusions the walk cannot meet, met on purpose** — so that
 * "excluded by name" is a statement about a list that exists rather than a
 * predicate nobody has ever seen match.
 *
 * `metOn: null` means a screen-level walk does not reach them: two are drawn
 * inside the layer-stack dialog and one inside a container's detail panel. That
 * makes their entries the ones most easily left rotting — a predicate naming a
 * column that has been renamed excludes nothing, and the walk above would still
 * be green, having asserted only that it did *not* meet them. (Written first with
 * `COMMAND` where the call site says `Command`, which is exactly the rot this
 * test exists to catch.) So each is opened, and each is required to match its own
 * entry and **no other**.
 */
test('the exclusions the walk cannot reach still name the lists they were written for — 1440×1000', async ({ page }) => {
  test.setTimeout(900_000);
  await page.setViewportSize(DESKTOP);

  // The layer explorer's two, reached the way an operator reaches them: from a
  // finding of the efficiency analysis, whose changeset job the explorer shares —
  // so the changeset list is drawn without a second analysis being asked for.
  await openTheAnalysedDialog(page, efficiencyImage);
  const route = tableWithColumn(page, 'SUPERSEDED AT', { region: LARGE_DIALOG_REGION });
  await clickAt(page, route.locator('.ui-data-table__row').first().locator('.ui-data-table__cell').first(), 'the first wasted file');
  await clickAt(page, route.locator('.ui-data-table__expanded button').first(), 'its route to the layer');
  await expect(
    page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: `Layer stack — ${efficiencyImage}` }) }),
    'the layer explorer did not open',
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Changesets not analyzed yet'), 'the layer explorer drew no changeset list to measure').toHaveCount(0, {
    timeout: 30_000,
  });

  const inTheExplorer = await measureEveryList(page, { region: LARGE_DIALOG_REGION });
  console.log(
    `[b4/INT-4] 1440×1000 layer stack: ${inTheExplorer.length} table(s) drawn — ${JSON.stringify(
      inTheExplorer.map((candidate) => candidate.list.headers.join('/')),
    )}`,
  );
  for (const callSite of ['LayerExplorer.tsx:221', 'LayerExplorer.tsx:250']) {
    const entry = EXCLUDED_BY_NAME.find((candidate) => candidate.callSite === callSite)!;
    const matched = inTheExplorer.filter(({ list }) => entry.matches(list, 'images-layers'));
    expect(
      matched.length,
      `${callSite}: the exclusion matched ${matched.length} of the ${inTheExplorer.length} lists the layer stack draws, where it names one`,
    ).toBe(1);
    // …and it names that one alone: an exclusion matching a converted list would
    // hide it from the sweep, which is the failure a broad filter causes.
    const reference = await settledList(page, REFERENCE.images);
    expect(entry.matches(reference, 'images-layers'), `${callSite}: the exclusion also matches the images list`).toBe(false);
  }

  // …and the container processes list, inside a container's own detail panel.
  await page.locator('.ui-modal-overlay').first().click({ position: { x: 5, y: 5 } });
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 30_000 });
  await expect(containerCard(page, containerNames[0]), 'the container this spec created is not listed').toBeVisible({
    timeout: 30_000,
  });
  await openContainerDetail(page, containerNames[0]);
  const detail = containerDetail(page).first();
  await expect(detail, 'selecting the container opened no detail panel').toBeVisible({ timeout: 20_000 });
  await clickAt(page, detail.getByRole('tab', { name: 'Processes' }), 'the Processes tab');

  // The view reads the process list from the daemon **after** it mounts and
  // draws its table only once that read answers, so the tab being selected is
  // not the list being on screen. The walk below stops as soon as two readings
  // 500ms apart agree, and "not started yet" reads exactly like "settled": on
  // 2026-08-17 a complete run counted `1 table drawn` here — the containers list
  // alone, in the build that still drew one — and this test reported its exclusion matching nothing, on a build
  // whose exclusion is correct and which counts 2 whenever the list has landed.
  // Waited for by the view's own table, and reported by what the view shows
  // instead when it never arrives, so a daemon that refuses `top` is named as
  // that rather than mistaken for a stale predicate.
  await expect(async () => {
    const drawn = await detail.locator('.ui-data-table').count();
    const shows = (await detail.innerText()).replace(/\s+/g, ' ').trim().slice(0, 160);
    expect(drawn, `the Processes view drew no list of its own; the panel shows: "${shows}"`).toBe(1);
  }).toPass({ timeout: 30_000 });

  const onTheScreen = await measureEveryList(page);
  const processes = EXCLUDED_BY_NAME.find((candidate) => candidate.callSite === 'ContainerProcessesView.tsx:84')!;
  const matched = onTheScreen.filter(({ list }) => processes.matches(list, 'containers'));
  console.log(
    `[b4/INT-4] 1440×1000 containers with a panel open: ${onTheScreen.length} table(s) drawn — ${JSON.stringify(
      onTheScreen.map((candidate) => candidate.list.headers.join('/')),
    )}`,
  );
  expect(
    matched.length,
    `ContainerProcessesView.tsx:84: the exclusion matched ${matched.length} of the ${onTheScreen.length} lists on screen, where it names one`,
  ).toBe(1);
});
