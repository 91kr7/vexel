/**
 * **The classic-table criteria on the lists batch 3 converts — the two that draw
 * a list inside a *row* of another list**: compose's projects with their
 * per-project services, and swarm's configs and stacks with the stacks' own
 * services
 * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-2`
 * … `REQ-13`, `REQ-19`, `REQ-20`, `REQ-29`, `REQ-30`, `REQ-32`, `REQ-36`,
 * `REQ-39`, `REQ-40`).
 *
 * **The same instrument as batches 1 and 2, extended rather than copied**:
 * everything that measures a list lives in `support/classic-table.ts`, which the
 * other two criteria files use too. What this batch needed and did not find
 * there is a way to reach a list that draws **no header of its own** — a nested
 * list states `hideHeader`, so it carries no column to be named by — and a way to
 * read its inset against the row that carries it **in the same pass**. Both were
 * added there, beside the vocabulary they belong to.
 *
 * **The count is the first thing this file asserts, because losing it is
 * silent.** A project row that has dropped its services, or a stack row that has
 * dropped its own, errors at nothing and shortens no list: the rows simply get
 * shorter. So the services are counted against **the daemon's own reading** of
 * the same projects, in the same run, before any box is measured at all (REQ-6,
 * REQ-19, REQ-20).
 *
 * **Two shipped consequences the checks are written against rather than
 * around.** A child row is inset, so it is narrower than its parent's and its
 * cells are not on its parent's tracks — that is the nesting being legible, not
 * a defect. And the **last** child row of a group carries no bottom rule: the
 * group's closing hairline is the wrapper's, full width, so full-width rules
 * separate one parent from the next and indented rules separate children. A
 * check reading that junction on the last child row would measure a missing
 * hairline and be wrong about it, so it is read on the wrapper — which is what
 * `expectNestedByIndentationAlone` does.
 *
 * **Every criterion here was observed failing on the delivered build first**
 * (REQ-29, and the counter-practice the plan's risk list names): the last test
 * checks out `d17e1df`, builds it, serves it on a port of its own and reads the
 * same figures through the same fixtures — the nested list on a stack of cards of
 * its own, no indentation of a spacing step, no closing rule on the group, and a
 * pan region of its own. A criterion that cannot be observed red there is not yet
 * a criterion.
 *
 * **What each screen's reading costs, stated rather than hidden.** Compose runs
 * against **real projects on the daemon** — two of them, one of two services and
 * one of one, `pull_policy: never` so nothing is fetched, every container
 * labelled and removed with `docker rm -fv` in an `afterAll` (REQ-32); that is
 * what makes "counted against the daemon's own reading" mean the daemon. Swarm is
 * answered **in the browser**, as every swarm spec in this suite is and for the
 * reason `support/swarm-reading.ts` records: swarm mode is a property of the whole
 * daemon and this one is the operator's. No assertion anywhere is about a total,
 * about a count of the machine's own objects, or about a list being empty.
 *
 * Every interaction is driven with a **real pointer at the visible control's own
 * coordinates**, never `element.click()` and never a dispatched event (CLAUDE.md,
 * "What a check drives, and what it measures").
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from './support/test.js';
import { CASE_LABEL, OWNER_LABEL, RUN_ID, openApp, ownershipArgs } from './support/fixtures.js';
import { boxOf, boxThisFrame, clickAtItsCentre } from './support/settled.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { startDeliveredBuild, type DeliveredBuild } from './support/delivered-build.js';
import { managerSwarmFixture, stubSwarmReading } from './support/swarm-reading.js';
import {
  VIEWPORTS,
  expectClassicTable,
  expectFlushRuledRows,
  expectNestedByIndentationAlone,
  expectOnePanRegionWithItsParent,
  expectSameRowAsReference,
  expectSameTableAsReference,
  reportList,
  reportNestedList,
  round,
  settledList,
  spacingStep,
  tableWithColumn,
  type ListGeometry,
  type Viewport,
} from './support/classic-table.js';

const DESKTOP: Viewport = VIEWPORTS[0];
const PHONE: Viewport = VIEWPORTS[2];

/**
 * The revision the plan was delivered on top of — the merge this branch starts
 * from. Neither batch 1 nor batch 2 touched compose or swarm's configs & stacks,
 * so it is the delivered build for these lists exactly as it was for theirs.
 */
const DELIVERED_REF = process.env.VEXEL_DELIVERED_REF ?? 'd17e1df';

/** Its own port: neither the suite's 3100, nor a developer's 3000, nor batch 1's 3101 or batch 2's 3102. */
const DELIVERED_PORT = Number(process.env.VEXEL_DELIVERED_NESTED_PORT ?? 3103);

/**
 * A list is named by a column only it carries — which is what makes the locator
 * survive the surface recomposition, the section header naming a panel no longer
 * being inside its card (REQ-40). The two **nested** lists carry none: they draw
 * no header at all, and are reached through their parent's column instead.
 *
 * **`NETWORKS` names the stacks list and `STACK` cannot**: four of the five lists
 * on the swarm screen carry a `STACK` column — services, secrets, configs and the
 * stacks list itself — and the probe takes the first table carrying the name, so
 * `STACK` hands back the configs list, which is drawn above it and holds no
 * nested list at all. `SERVICES`, `SECRETS`, `CONFIGS` and `NETWORKS` are each
 * the stacks list's alone (the neighbouring inventories name their own object in
 * the singular); `NETWORKS` is the one of the four that no other column's text
 * even contains, so it holds under the substring match `tableWithColumn` uses as
 * well as under the exact one `measureList` uses.
 */
const LISTS = {
  projects: 'SERVICES UP',
  configs: 'CONFIG',
  stacks: 'NETWORKS',
  images: 'DISK USAGE',
} as const;

// ---------------------------------------------------------------------------
// The fixtures: two real compose projects, and the two reference lists' own.
// ---------------------------------------------------------------------------

const CASE_NAME = 'classic-table-nested';
/**
 * What a fixture's **name** carries of the run, which is deliberately less than
 * its labels do.
 *
 * A row's label is read from its first cell and truncated at 40 characters by
 * the shared instrument, so an object whose name is longer than that could never
 * be compared with the row drawn for it — the comparison would fail on the probe
 * rather than on the build. `RUN_ID` is `pid-timestamp`, 19 characters, and
 * `vexel-e2e-nested-multi-` is 23 more. Ownership is unaffected: the labels
 * carry the whole `RUN_ID`, and it is the labels the sweep goes by.
 */
const suffix = RUN_ID.slice(-10);
/** Two services, so a group has a junction between two children to be measured. */
const MULTI_PROJECT = `vexel-e2e-nested-multi-${suffix}`;
/** One service, so the group of a single child is measured too. */
const SOLO_PROJECT = `vexel-e2e-nested-solo-${suffix}`;
const referenceContainer = `vexel-e2e-nested-ref-${suffix}`;
const referenceImage = `vexel-e2e-nested-ref-${suffix}:1`;

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

test.beforeAll(async () => {
  // Ensured at the point of use rather than once for the run: the exclusive project prunes the host.
  await ensureImage(ALPINE_IMAGE);
  composeDir = await mkdtemp(join(tmpdir(), 'vexel-e2e-nested-'));

  const multiFile = join(composeDir, 'multi.yml');
  await writeFile(
    multiFile,
    `services:\n${serviceBlock('api', '["sleep", "900"]')}\n${serviceBlock('web', '["sleep", "900"]')}\n`,
    'utf8',
  );
  await execFileAsync('docker', ['compose', '-f', multiFile, '-p', MULTI_PROJECT, 'up', '-d']);

  const soloFile = join(composeDir, 'solo.yml');
  await writeFile(soloFile, `services:\n${serviceBlock('solo', '["sleep", "900"]')}\n`, 'utf8');
  await execFileAsync('docker', ['compose', '-f', soloFile, '-p', SOLO_PROJECT, 'up', '-d']);

  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    referenceContainer,
    ...ownershipArgs(referenceContainer),
    '--entrypoint',
    'sleep',
    ALPINE_IMAGE,
    '900',
  ]);
  await execFileAsync('docker', ['tag', ALPINE_IMAGE, referenceImage]);
});

test.afterAll(async () => {
  // Removed by their own compose project label, so teardown never depends on the
  // fixture's file still being on disk. `-fv` and not `-f`: without it an image's
  // anonymous volumes outlive the container that carried them.
  for (const project of [MULTI_PROJECT, SOLO_PROJECT]) {
    const containers = await execFileAsync('docker', [
      'ps',
      '-aq',
      '--filter',
      `label=com.docker.compose.project=${project}`,
    ]).catch(() => ({ stdout: '' }));
    const ids = containers.stdout.split('\n').filter((id) => id.length > 0);
    if (ids.length > 0) await execFileAsync('docker', ['rm', '-fv', ...ids]).catch(() => undefined);
    const networks = await execFileAsync('docker', [
      'network',
      'ls',
      '-q',
      '--filter',
      `label=com.docker.compose.project=${project}`,
    ]).catch(() => ({ stdout: '' }));
    const networkIds = networks.stdout.split('\n').filter((id) => id.length > 0);
    if (networkIds.length > 0) await execFileAsync('docker', ['network', 'rm', ...networkIds]).catch(() => undefined);
  }
  await execFileAsync('docker', ['rm', '-fv', referenceContainer]).catch(() => undefined);
  await execFileAsync('docker', ['rmi', '-f', referenceImage]).catch(() => undefined);
  if (composeDir) await rm(composeDir, { recursive: true, force: true }).catch(() => undefined);
});

/** The stacks the browser is answered with, and the services each of them holds. */
const SWARM = managerSwarmFixture();

/** How many services the **daemon** reports for a project, read in the same run as the rows. */
async function servicesTheDaemonReports(page: Page, project: string): Promise<string[]> {
  const response = await page.request.get('/api/compose/projects');
  expect(response.ok(), `the daemon's own reading of the compose projects failed with HTTP ${response.status()}`).toBe(true);
  const projects = (await response.json()) as { name: string; services: { name: string }[] }[];
  const found = projects.find((candidate) => candidate.name === project);
  expect(found, `the daemon does not report the ${project} project this spec created`).toBeDefined();
  return found!.services.map((service) => service.name).sort();
}

/**
 * What a stack row states in its **own** `SERVICES` column — the row's
 * independent witness of how many services the stack has, read from the browser
 * rather than from the reading the browser was answered with.
 *
 * It is what makes "nothing was silently dropped" a comparison of two readings
 * rather than of one against itself: a row that has lost its children still
 * states the count it always did.
 */
async function statedServiceCount(page: Page, stackName: string): Promise<string> {
  const table = tableWithColumn(page, LISTS.stacks);
  const column = await table.evaluate((element) =>
    [...element.querySelectorAll('.ui-data-table__header-cell')].findIndex(
      (cell) => (cell.textContent ?? '').trim() === 'SERVICES',
    ),
  );
  expect(column, `the stacks list draws no SERVICES column to read ${stackName}'s count from`).toBeGreaterThanOrEqual(0);
  const row = table.locator('.ui-data-table__body > .ui-data-table__row').filter({ hasText: stackName }).first();
  return (await row.locator('.ui-data-table__cell').nth(column).innerText()).trim();
}

async function openCompose(page: Page): Promise<void> {
  await openApp(page, 'compose');
  await expect(page.getByRole('heading', { level: 1, name: 'Compose' })).toBeVisible({ timeout: 20_000 });
  await expect(tableWithColumn(page, LISTS.projects).locator('.ui-data-table__row').first()).toBeVisible({
    timeout: 30_000,
  });
}

async function openSwarm(page: Page): Promise<void> {
  await openApp(page, 'swarm');
  await expect(page.getByRole('heading', { level: 1, name: 'Swarm' })).toBeVisible({ timeout: 20_000 });
  await expect(tableWithColumn(page, LISTS.stacks).locator('.ui-data-table__row').first()).toBeVisible({
    timeout: 20_000,
  });
}

/**
 * The reference list, read from the tree in this same run and in this same browser.
 *
 * **It was two, and the containers list left it on 2026-08-25**
 * (`plan-docker_management_app-containers_card_view/REQ-1`): that screen deliberately draws one card
 * per container now, and is the single named exception to the classic table
 * (`.../containers_card_view/REQ-63`). A screen that draws no table cannot be the table every other
 * list is compared against. The images list — still the classic table, and already the second
 * reference here — is what remains, and the comparison it takes part in is unchanged: each converted
 * list is measured against a reference row of this spec's own making, never against a total and
 * never against an emptiness.
 */
async function readTheReference(page: Page, at: string): Promise<{ name: string; list: ListGeometry }[]> {
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 20_000 });
  // The row this file created is what the reference is read on: never a total, never an emptiness.
  await expect(
    page.locator('.ui-data-table__row', { hasText: referenceImage }).first(),
    `${at}: the image this spec created is not listed, so the reference row may be anybody's`,
  ).toBeVisible({ timeout: 20_000 });
  const images = await settledList(page, LISTS.images);
  reportList(at, 'images (reference)', images, 'b3');

  return [{ name: 'images', list: images }];
}

/** The three screen lists this batch converts, measured in one pass each. */
async function readTheOuterLists(page: Page, at: string): Promise<Record<string, ListGeometry>> {
  await openCompose(page);
  const projects = await settledList(page, LISTS.projects);

  await openSwarm(page);
  const configs = await settledList(page, LISTS.configs);
  const stacks = await settledList(page, LISTS.stacks);

  const measured = { 'compose projects': projects, 'swarm configs': configs, 'swarm stacks': stacks };
  for (const [name, list] of Object.entries(measured)) reportList(at, name, list, 'b3');
  return measured;
}

/**
 * The nested lists, one per group, read under the row that carries them.
 *
 * The compose screen is on screen for the first two and the swarm screen for the
 * last two, so each is read where it is drawn; the caller opens neither twice.
 */
async function readTheNestedLists(page: Page, at: string, step: number): Promise<Record<string, ListGeometry>> {
  await openCompose(page);
  const multi = await settledList(page, { nestedInside: LISTS.projects, underRow: MULTI_PROJECT });
  const solo = await settledList(page, { nestedInside: LISTS.projects, underRow: SOLO_PROJECT });

  await openSwarm(page);
  const stackServices = await settledList(page, { nestedInside: LISTS.stacks, underRow: SWARM.stacks[0].name as string });
  const lonelyServices = await settledList(page, { nestedInside: LISTS.stacks, underRow: SWARM.stacks[1].name as string });

  const measured = {
    'compose services (two)': multi,
    'compose services (one)': solo,
    'stack services (two)': stackServices,
    'stack services (one)': lonelyServices,
  };
  for (const [name, list] of Object.entries(measured)) reportNestedList(at, name, list, step, 'b3');
  return measured;
}

// ---------------------------------------------------------------------------
// The count, first: nothing is silently dropped.
// ---------------------------------------------------------------------------

/**
 * REQ-6, REQ-19, REQ-20 — **a project row still carries every one of its
 * services, and a stack row every one of its own.**
 *
 * This is the assertion the whole batch turns on and the first one in the file,
 * because losing it is silent: the slot that draws a list inside a row used to be
 * gated on the retired presentation, so a call site that stopped asking for that
 * presentation without the gate going in the same change would drop its content
 * with no error, no type change and no shorter list — only shorter rows.
 *
 * Counted against the **daemon's own reading** of the same projects on compose,
 * and against the reading the browser was answered with on swarm; never against
 * a number written here.
 */
test('every project row carries every one of its services, and every stack row every one of its own — 1440×1000', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize(DESKTOP);
  await stubSwarmReading(page, SWARM);

  await openCompose(page);
  for (const project of [MULTI_PROJECT, SOLO_PROJECT]) {
    const reported = await servicesTheDaemonReports(page, project);
    const nested = await settledList(page, { nestedInside: LISTS.projects, underRow: project });
    const drawn = nested.rows.map((row) => row.label).sort();
    console.log(`[b3/REQ-19] 1440×1000 ${project}: the daemon reports ${JSON.stringify(reported)}, the row draws ${JSON.stringify(drawn)}`);
    expect(nested.found, `the ${project} row draws no nested list at all`).toBe(true);
    expect(drawn, `the ${project} row does not carry every service the daemon reports for it`).toEqual(reported);
  }

  await openSwarm(page);
  const stacks = await settledList(page, LISTS.stacks);
  for (const stack of SWARM.stacks) {
    const expected = (stack.services as { name: string }[]).map((service) => service.name).sort();
    const nested = await settledList(page, { nestedInside: LISTS.stacks, underRow: stack.name as string });
    const drawn = nested.rows.map((row) => row.label).sort();
    const stated = await statedServiceCount(page, stack.name as string);
    console.log(
      `[b3/REQ-20] 1440×1000 ${stack.name}: the reading holds ${JSON.stringify(expected)}, the row states "${stated}" and draws ${JSON.stringify(
        drawn,
      )}`,
    );
    expect(nested.found, `the ${stack.name} row draws no nested list at all`).toBe(true);
    expect(drawn, `the ${stack.name} row does not carry every service the reading holds for it`).toEqual(expected);
    // …and the stack is a row of the list, stating in its own SERVICES column the
    // number of children it draws: the row's own witness that none went missing
    // (REQ-13, and REQ-6's silence — a row that dropped its services still states
    // the count it always did).
    expect(
      stacks.rows.some((candidate) => candidate.label === stack.name),
      `the ${stack.name} stack is not a row of the stacks list at all`,
    ).toBe(true);
    expect(stated, `the ${stack.name} row states "${stated}" services and draws ${drawn.length}`).toBe(String(drawn.length));
  }
});

// ---------------------------------------------------------------------------
// The criteria, at the three viewports.
// ---------------------------------------------------------------------------

for (const viewport of VIEWPORTS) {
  const at = `${viewport.width}×${viewport.height}`;

  // REQ-2 … REQ-5, REQ-13, REQ-19, REQ-20, REQ-39, REQ-40 — the three screen
  // lists are the reference table, read in the same run so the equality is a
  // comparison and not a coincidence.
  test(`the projects, configs and stacks lists are the reference table, not a table like it — ${at}`, async ({ page }) => {
    test.setTimeout(420_000);
    await page.setViewportSize(viewport);
    await stubSwarmReading(page, SWARM);

    const references = await readTheReference(page, at);
    const measured = await readTheOuterLists(page, at);

    for (const [name, list] of Object.entries(measured)) {
      expectClassicTable(at, name, list);
      expectSameTableAsReference(at, name, list, references);
    }

    // Beside the boxes, the values the human reads (REQ-13): the columns each
    // list states, in order, and the rows this run put there.
    expect(measured['compose projects'].headers, `${at}: the projects list does not state its columns in order`).toEqual([
      'PROJECT',
      'STATE',
      'SERVICES UP',
      'COMPOSE FILES',
      'DOCKER REPORTS',
      'ACTIONS',
    ]);
    expect(measured['swarm stacks'].headers, `${at}: the stacks list does not state its columns in order`).toEqual([
      'STACK',
      'SERVICES',
      'SECRETS',
      'CONFIGS',
      'NETWORKS',
      'ACTIONS',
    ]);
    expect(measured['swarm configs'].headers, `${at}: the configs list does not state its columns in order`).toEqual([
      'CONFIG',
      'STACK',
      'CREATED',
      'UPDATED',
      'ACTIONS',
    ]);
    expect(
      measured['compose projects'].rows.some((row) => row.label === MULTI_PROJECT),
      `${at}: the project this spec created is not a row of the list`,
    ).toBe(true);

    // REQ-12 — no column of any of them is drawn at no width at all.
    for (const [name, list] of Object.entries(measured)) {
      expect(list.zeroWidthCells, `${at} ${name}: a cell is in the DOM and nowhere on screen`).toEqual([]);
      console.log(`[b3/REQ-12] ${at} ${name}: holds ${list.scrollWidth}px of row in ${list.clientWidth}px`);
    }
  });

  // REQ-7, REQ-39 — the child lists: rows ruled and flush like any other, the
  // same row as the reference, and told from their parent's by an indentation of
  // one spacing step and by nothing else.
  test(`a service row is its parent's row inset by one spacing step, in the same surface — ${at}`, async ({ page }) => {
    test.setTimeout(420_000);
    await page.setViewportSize(viewport);
    await stubSwarmReading(page, SWARM);

    const references = await readTheReference(page, at);
    const step = await spacingStep(page);
    console.log(`[b3/REQ-7] ${at}: the library's one spacing step is ${round(step)}px`);
    expect(step, `${at}: the library states no spacing step at all, so nothing below is a measurement`).toBeGreaterThan(0);

    const nested = await readTheNestedLists(page, at, step);

    for (const [name, list] of Object.entries(nested)) {
      // The header half of the criteria is not weakened for a header-less list:
      // it does not apply to it. What does apply is asserted in full.
      expectFlushRuledRows(at, name, list);
      expectNestedByIndentationAlone(at, name, list, step);
      // REQ-39 — a child row is the reference row too. Its **only** permitted
      // difference from its parent is the indentation, and its parent is the
      // reference row, so its height, alignment and modifier set are the
      // reference's as well.
      expectSameRowAsReference(at, name, list, references);
    }

    // The premise, so the loop cannot go vacuous: the two groups that carry two
    // children really do carry two, which is what makes a child→child junction
    // measurable at all.
    expect(nested['compose services (two)'].rows.length, `${at}: the two-service project draws fewer than two children`).toBe(2);
    expect(nested['stack services (two)'].rows.length, `${at}: the two-service stack draws fewer than two children`).toBe(2);

    // Beside the boxes: the child keeps the columns it declares (REQ-7, REQ-13) —
    // a service's own name, state, image and replicas on compose; name, image,
    // mode and replicas on swarm.
    const composeChild = nested['compose services (two)'].rows.map((row) => row.label).sort();
    expect(composeChild, `${at}: the project's services are not the rows of its nested list`).toEqual(['api', 'web']);
    const stackChild = nested['stack services (two)'].rows.map((row) => row.label).sort();
    expect(stackChild, `${at}: the stack's services are not the rows of its nested list`).toEqual(
      (SWARM.stacks[0].services as { name: string }[]).map((service) => service.name).sort(),
    );
  });
}

// ---------------------------------------------------------------------------
// One pan region, at the width where there is a pan at all.
// ---------------------------------------------------------------------------

/**
 * REQ-7, REQ-12 — **parent and child are one pan region, under one scrollbar.**
 *
 * The property is asserted where it lives (`overflow-x: visible` on the nested
 * list, which is what hands its columns' minimums up to its parent's scroller)
 * and then driven: a **real wheel over a child row** pans the parent's table, and
 * the child moves with it by the same distance. `auto` on the child would make it
 * a scroll container of its own — the parent would pan while the child sat still
 * on a scrollbar it drew itself — and that is what this measures.
 */
test('a nested list pans with its parent, under one scrollbar — 375×812', async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize(PHONE);
  await stubSwarmReading(page, SWARM);

  for (const [screen, parentColumn, underRow] of [
    ['compose', LISTS.projects, MULTI_PROJECT],
    ['swarm', LISTS.stacks, SWARM.stacks[0].name as string],
  ] as const) {
    if (screen === 'compose') await openCompose(page);
    else await openSwarm(page);

    // Read once the screen is up: the token lives in the loaded application, and
    // a step read from a blank page would be 0 (`spacingStep` refuses it).
    const step = await spacingStep(page);
    const nested = await settledList(page, { nestedInside: parentColumn, underRow });
    reportNestedList('375×812', `${screen} nested list`, nested, step, 'b3');
    expectOnePanRegionWithItsParent('375×812', `${screen} nested list`, nested);

    const parent = tableWithColumn(page, parentColumn);
    const outer = await settledList(page, parentColumn);
    expect(
      outer.scrollWidth,
      `375×812 ${screen}: the list holds ${outer.scrollWidth}px of row in ${outer.clientWidth}px, so there is no pan to share`,
    ).toBeGreaterThan(outer.clientWidth);

    // A real wheel, delivered over a **child** row: the gesture an operator makes
    // on the part of the list that is supposed to move with the rest of it.
    const childRow = parent.locator('.ui-data-table__row-content .ui-data-table__row').first();
    await childRow.scrollIntoViewIfNeeded();
    // The pair below measures **movement under a pan**, so both halves are read as they stand:
    // settling them would be answering a different question (`support/settled.ts`).
    const childBox = await boxOf(childRow, 'the nested row the wheel is delivered over');
    const before = {
      child: childBox.x,
      parentRow: (await boxThisFrame(parent.locator('.ui-data-table__row').first(), 'the parent row before the pan')).x,
    };
    await page.mouse.move(childBox.x + Math.min(60, childBox.width / 2), childBox.y + childBox.height / 2);
    for (let stroke = 0; stroke < 6; stroke += 1) {
      await page.mouse.wheel(120, 0);
      await page.waitForTimeout(150);
    }

    const offset = await parent.evaluate((element) => Math.round((element as HTMLElement).scrollLeft));
    const after = {
      child: (await boxThisFrame(childRow, 'the nested row after the pan')).x,
      parentRow: (await boxThisFrame(parent.locator('.ui-data-table__row').first(), 'the parent row after the pan')).x,
    };
    console.log(
      `[b3/REQ-12] 375×812 ${screen}: a wheel over a child row pans the parent to scrollLeft ${offset}; ` +
        `the parent row moved ${round(after.parentRow - before.parentRow)}px and the child ${round(after.child - before.child)}px`,
    );
    expect(offset, `375×812 ${screen}: a wheel over a child row panned nothing at all`).toBeGreaterThan(0);
    expect(
      round(after.child - before.child),
      `375×812 ${screen}: the child moved ${round(after.child - before.child)}px while its parent moved ${round(
        after.parentRow - before.parentRow,
      )}px — the two are not one pan region`,
    ).toBe(round(after.parentRow - before.parentRow));
  }
});

// ---------------------------------------------------------------------------
// The certified predecessors on these screens, named rather than assumed.
// ---------------------------------------------------------------------------

/**
 * REQ-10, REQ-36 — selecting a project reveals its panel **under its own row,
 * inside the same table**, its services stay where they were, and nothing on
 * either screen offers a copy affordance
 * (`plan-docker_management_app-copy_affordance_absence`).
 *
 * Driven with a real pointer at the row's **first cell**: below the desktop
 * breakpoint a row is wider than the box it is read in, so its own centre can sit
 * over another column — or over a control.
 */
test('selecting a project opens its panel under its own row without disturbing its services — 1440×1000', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize(DESKTOP);
  await stubSwarmReading(page, SWARM);
  await openCompose(page);
  // Read once the screen is up, for the reason `spacingStep` states: a blank page
  // holds no token, and a step of 0 would turn "inset by one step" into "inset by
  // nothing" — an assertion that passes on a build with no indentation at all.
  const step = await spacingStep(page);

  const before = await settledList(page, { nestedInside: LISTS.projects, underRow: MULTI_PROJECT });
  const projectRow = tableWithColumn(page, LISTS.projects)
    .locator('.ui-data-table__body > .ui-data-table__row')
    .filter({ hasText: MULTI_PROJECT })
    .first();
  await clickAtItsCentre(page, projectRow.locator('.ui-data-table__cell').first(), 'the project row’s own first cell');

  const panel = page.locator('.ui-detail-panel');
  await expect(panel, 'selecting a project opened no detail panel').toBeVisible({ timeout: 20_000 });

  const list = await settledList(page, LISTS.projects);
  const after = await settledList(page, { nestedInside: LISTS.projects, underRow: MULTI_PROJECT });
  reportNestedList('1440×1000 after opening the panel', 'compose services', after, step, 'b3');

  // The panel is inside the same table surface, below the row it belongs to and
  // below the services that row carries — **read in one pass**, panel, row and
  // group together: a box read after a scroll and one read before it are two
  // frames of reference, and "below" is not a statement either of them can make
  // on its own.
  const opened = await panel.evaluate((element) => {
    // The block the list draws the panel in — the panel itself is inside it, so
    // it is the block that is a sibling of the row and of the row's content.
    const expansion = element.closest('.ui-data-table__expanded');
    const group = expansion?.previousElementSibling ?? null;
    const row = group?.previousElementSibling ?? null;
    const box = (node: Element | null) => {
      if (node === null) return null;
      const rect = node.getBoundingClientRect();
      return { y: rect.y, bottom: rect.bottom, width: rect.width };
    };
    return {
      insideTheTable: element.closest('.ui-data-table') !== null,
      insideAnExpansion: expansion !== null,
      panel: box(element)!,
      // The row's own content slot — its services — and the row above it.
      groupIsTheContentSlot: group?.classList.contains('ui-data-table__row-content') ?? false,
      group: box(group),
      rowIsARow: row?.classList.contains('ui-data-table__row') ?? false,
      row: box(row),
      rowLabel: (row?.querySelector('.ui-table-two-line-cell__title')?.textContent ?? '').trim(),
    };
  });
  console.log(
    `[b3/REQ-10] 1440×1000: the "${opened.rowLabel}" row ends at y=${round(opened.row?.bottom ?? Number.NaN)}, its services at y=${round(
      opened.group?.bottom ?? Number.NaN,
    )}, its panel opens at y=${round(opened.panel.y)}, ${round(opened.panel.width)}px wide inside a ${round(list.table.width)}px table`,
  );
  expect(opened.insideTheTable, 'the panel is drawn outside the table its row belongs to').toBe(true);
  expect(opened.insideAnExpansion, "the panel is not drawn in the list's own expansion block").toBe(true);
  expect(opened.rowIsARow, 'the panel is not drawn under a row of the list at all').toBe(true);
  expect(opened.rowLabel, 'the panel opened under a row other than the one that was clicked').toBe(MULTI_PROJECT);
  expect(opened.groupIsTheContentSlot, "the panel is not drawn under the row's own content slot").toBe(true);
  expect(opened.panel.y, 'the panel does not open below the row that opened it').toBeGreaterThanOrEqual(
    (opened.row?.bottom ?? Number.NaN) - 1,
  );
  expect(opened.panel.y, 'the panel opens across the services the row carries').toBeGreaterThanOrEqual(
    (opened.group?.bottom ?? Number.NaN) - 1,
  );
  // …and the services are untouched: the same rows, at the same indentation.
  expect(after.rows.map((candidate) => candidate.label), 'opening the panel changed the services the row carries').toEqual(
    before.rows.map((candidate) => candidate.label),
  );
  expectNestedByIndentationAlone('1440×1000 with a panel open', 'compose services', after, step);
  expect(list.surfacesInside, 'a surface appeared inside the table when the panel opened').toBe(0);

  // …and nothing on either screen offers a copy affordance.
  for (const screen of ['compose', 'swarm'] as const) {
    if (screen === 'swarm') await openSwarm(page);
    const copyControls = await page.evaluate(() => {
      const inside = Array.from(document.querySelectorAll<HTMLElement>('.ui-data-table__row *'));
      return inside
        .filter((element) =>
          /copy/i.test(`${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''} ${element.textContent ?? ''}`),
        )
        .map((element) => `${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 40)}"`);
    });
    expect(copyControls, `a row of the ${screen} screen offers a copy affordance`).toEqual([]);
  }
});

// ---------------------------------------------------------------------------
// REQ-29 — the delivered figures, on record, before the change.
// ---------------------------------------------------------------------------

/** The figures a nested list is judged by, in the shape both builds are read into. */
function nestedFigures(list: ListGeometry): {
  children: number;
  childRowInsetFromTheParentCell: number;
  childCellInsetFromTheParentCell: number;
  surfacesInside: number;
  rowsOnASurface: number;
  worstCarrierRadius: number;
  childGaps: number[];
  groupClosingRule: number;
  lastChildRule: number;
  paddingUnderTheGroup: number;
  overflowX: string;
} {
  const carrier = list.carrier;
  const parentCellX = carrier?.rowCellXs[0] ?? Number.NaN;
  return {
    children: list.rows.length,
    childRowInsetFromTheParentCell: (list.rows[0]?.box.x ?? Number.NaN) - parentCellX,
    childCellInsetFromTheParentCell: (list.rows[0]?.cellXs[0] ?? Number.NaN) - parentCellX,
    surfacesInside: list.surfacesInside,
    rowsOnASurface: list.rows.filter((row) => row.isSurface).length,
    worstCarrierRadius: Math.max(0, ...list.rows.map((row) => row.carrierRadius)),
    childGaps: list.rowJunctions.map((junction) => round(junction.gap)),
    groupClosingRule: carrier?.contentBorderBottom ?? Number.NaN,
    lastChildRule: carrier?.lastChildBorderBottom ?? Number.NaN,
    paddingUnderTheGroup: carrier?.contentPaddingBottom ?? Number.NaN,
    overflowX: list.overflowX,
  };
}

/**
 * The build this plan started from is checked out, built and served on a port of
 * its own, and the same measurements are read on it through the same fixtures —
 * the compose projects being real ones on the daemon both origins talk to — so
 * the two readings differ in the build and in nothing else.
 *
 * Both halves are asserted: the criteria **fail** there, which is what makes this
 * check discriminating rather than merely green, and they hold on the build under
 * test. And the count is carried across: **the same services, before and after.**
 */
test('the delivered build fails these criteria, and the numbers are on record', async ({ page, browser, baseURL }) => {
  test.setTimeout(1_200_000);
  expect(baseURL, 'this run has no origin of its own to compare the delivered build against').toBeTruthy();
  let delivered: DeliveredBuild | undefined;
  let deliveredNested: Record<string, ReturnType<typeof nestedFigures>> = {};
  let deliveredServices: Record<string, string[]> = {};
  try {
    delivered = await startDeliveredBuild({ revision: DELIVERED_REF, port: DELIVERED_PORT });
    const revision = delivered.revision.slice(0, 7);
    const context = await browser.newContext({ baseURL: delivered.origin, viewport: DESKTOP });
    const before = await context.newPage();
    try {
      await stubSwarmReading(before, SWARM);
      const outer = await readTheOuterLists(before, `delivered ${revision}`);
      // The delivered build's **own** spacing step, read from it once it is up:
      // what has to be red there is "a child row was already inset by one step",
      // and one step is whatever that build's tokens say it is. Read before the
      // page had loaded it would be 0, and the criterion below would quietly
      // become "was already inset by nothing" — green on any build.
      const step = await spacingStep(before);
      const nested = await readTheNestedLists(before, `delivered ${revision}`, step);
      deliveredNested = Object.fromEntries(Object.entries(nested).map(([name, list]) => [name, nestedFigures(list)]));
      deliveredServices = Object.fromEntries(Object.entries(nested).map(([name, list]) => [name, list.rows.map((row) => row.label).sort()]));

      for (const [name, figures] of Object.entries(deliveredNested)) {
        console.log(`[b3/REQ-29] delivered ${revision} ${name}: ${JSON.stringify(figures)}`);
      }

      // Recorded failing, with its measurements — not "before: failed".
      for (const [name, list] of Object.entries(outer)) {
        expect(list.rows.length, `delivered ${revision} ${name}: fewer than two rows, so nothing here discriminates`).toBeGreaterThan(1);
        expect(
          list.rowJunctions.map((junction) => round(junction.gap)).filter((gap) => gap > 0.5).length,
          `delivered ${revision} ${name}: the delivered build already drew its rows flush`,
        ).toBeGreaterThan(0);
        expect(
          Math.max(...list.rows.map((row) => row.carrierRadius)),
          `delivered ${revision} ${name}: the delivered build already drew square rows`,
        ).toBeGreaterThan(0);
        expect(
          list.surfacesInside,
          `delivered ${revision} ${name}: the delivered build already drew no surface inside its list`,
        ).toBeGreaterThan(0);
        expect(
          list.rows.every((row) => row.modifiers.length === 0),
          `delivered ${revision} ${name}: the delivered build already stated no row modifier`,
        ).toBe(false);
        expect(
          Math.abs(list.table.x - (list.card?.x ?? 0)),
          `delivered ${revision} ${name}: the delivered build already ran its table edge to edge in its card`,
        ).toBeGreaterThan(1);
        expect(
          list.sectionHeaderInsideCard,
          `delivered ${revision} ${name}: the delivered build already put the section header outside the list's card`,
        ).toBe(true);
      }

      // …and the four criteria this batch adds, each of them red there. A
      // criterion that cannot be observed failing on the rejected build is not
      // yet a criterion (REQ-29).
      for (const [name, figures] of Object.entries(deliveredNested)) {
        expect(
          figures.surfacesInside + figures.rowsOnASurface,
          `delivered ${revision} ${name}: the delivered build already drew its children inside its parent's surface, so "no surface of its own" shows nothing`,
        ).toBeGreaterThan(0);
        expect(
          round(figures.childRowInsetFromTheParentCell),
          `delivered ${revision} ${name}: the delivered build already inset a child row by exactly one spacing step, so the indentation shows nothing`,
        ).not.toBe(round(step));
        expect(
          figures.groupClosingRule,
          `delivered ${revision} ${name}: the delivered build already closed the group with a rule of the wrapper's own`,
        ).toBe(0);
        expect(
          figures.overflowX,
          `delivered ${revision} ${name}: the delivered build's nested list was already no pan region of its own`,
        ).not.toBe('visible');
      }
      // The gap between two children is the fifth, and it is the card's own
      // signature: children separated rather than ruled.
      expect(
        deliveredNested['compose services (two)'].childGaps.filter((gap) => gap > 0.5).length,
        `delivered ${revision}: the delivered build already drew a project's services flush`,
      ).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  } finally {
    await delivered?.stop();
  }

  // …and the same figures on the build under test, measured minutes apart in the
  // same browser and against the same daemon.
  await page.setViewportSize(DESKTOP);
  await stubSwarmReading(page, SWARM);
  const references = await readTheReference(page, 'after');
  const step = await spacingStep(page);
  const outer = await readTheOuterLists(page, 'after');
  const nested = await readTheNestedLists(page, 'after', step);

  for (const [name, list] of Object.entries(outer)) {
    expectClassicTable('after', name, list);
    expectSameTableAsReference('after', name, list, references);
  }
  for (const [name, list] of Object.entries(nested)) {
    expectFlushRuledRows('after', name, list);
    expectNestedByIndentationAlone('after', name, list, step);
    expectSameRowAsReference('after', name, list, references);
  }

  // **The count, before and after** — the number that says nothing was silently
  // dropped when the slot stopped being gated on a presentation.
  for (const [name, list] of Object.entries(nested)) {
    const after = list.rows.map((row) => row.label).sort();
    console.log(
      `[b3/REQ-6] ${name}: ${deliveredServices[name].length} child row(s) on the delivered build → ${after.length} after — ` +
        `${JSON.stringify(deliveredServices[name])} → ${JSON.stringify(after)}`,
    );
    expect(after, `${name}: the conversion changed which children the row carries`).toEqual(deliveredServices[name]);
  }

  // …and the four criteria's figures, side by side.
  for (const [name, list] of Object.entries(nested)) {
    const figures = nestedFigures(list);
    console.log(
      `[b3/REQ-29] ${name}, delivered → after: child row inset from its parent's cell ${round(
        deliveredNested[name].childRowInsetFromTheParentCell,
      )} → ${round(figures.childRowInsetFromTheParentCell)}px (one spacing step is ${round(step)}px); child cell ${round(
        deliveredNested[name].childCellInsetFromTheParentCell,
      )} → ${round(figures.childCellInsetFromTheParentCell)}px; surfaces inside ${deliveredNested[name].surfacesInside} → ${
        figures.surfacesInside
      }; rows on a surface of their own ${deliveredNested[name].rowsOnASurface} → ${figures.rowsOnASurface}; ` +
        `worst row corner ${round(deliveredNested[name].worstCarrierRadius)} → ${round(figures.worstCarrierRadius)}px; ` +
        `gaps between children ${JSON.stringify(deliveredNested[name].childGaps)} → ${JSON.stringify(figures.childGaps)}; ` +
        `the group's closing rule ${round(deliveredNested[name].groupClosingRule)} → ${round(figures.groupClosingRule)}px over a last child of ${round(
          deliveredNested[name].lastChildRule,
        )} → ${round(figures.lastChildRule)}px; overflow-x ${deliveredNested[name].overflowX} → ${figures.overflowX}`,
    );
  }
});
