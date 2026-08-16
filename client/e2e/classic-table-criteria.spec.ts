/**
 * **The classic-table criteria, on the three lists batch 1 converts** — volumes,
 * networks, the registries list and the repositories list
 * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-2`
 * … `REQ-6`, `REQ-8` … `REQ-12`, `REQ-14`, `REQ-15`, `REQ-29`, `REQ-30`,
 * `REQ-32`, `REQ-36`, `REQ-39`, `REQ-40`).
 *
 * **Every character on these screens is identical before and after**, so
 * *"eleven volumes are listed"* and *"the mount path is displayed"* are true of
 * the build the human rejected. What changed is the boxes, so what is asserted
 * here is boxes: the gap between two rows, the corners a row carries, the number
 * of enclosing surfaces, the distance between a header cell's left edge and its
 * column's, and the row's own height and alignment. Content assertions stand
 * **beside** them and never instead of them (REQ-30).
 *
 * **The expected values are read from the reference lists in the same run.**
 * REQ-39 and REQ-40 are comparisons against containers and images *as they stand
 * in the tree*, so no row height and no edge inset is written into this file: a
 * converted row is measured against a containers row and an images row read
 * minutes apart in the same browser, and a number copied here would rot the day
 * the reference legitimately changes. That is the whole correction the 2026-08-16
 * amendment makes: the first attempt met four geometric criteria, measured, and
 * was still not the containers table.
 *
 * **The delivered build is measured too, and recorded failing** (REQ-29): the
 * revision this branch left is checked out, built and served on a port of its
 * own (`support/delivered-build.ts`), and the same figures are read on it. A
 * "before: failed" with no numbers is not evidence on a layout defect.
 *
 * Every interaction is driven with a **real pointer at the visible control's own
 * coordinates**, never `element.click()` and never a dispatched event
 * (CLAUDE.md, "What a check drives, and what it measures").
 *
 * **Test discipline** (REQ-32): the fixtures are this file's own — two volumes, a
 * network with a container attached to it, a container and an image tag for the
 * reference lists — each labelled and each removed in an `afterAll`, containers
 * with `docker rm -fv`. Nothing is asserted about totals or emptiness, only about
 * the rows this file created. The registries inventory is the suite's own fixture
 * server (`support/registry-fixture-server.ts`), which neither reads nor writes
 * the operator's Docker configuration, and the repositories list is served from a
 * route stub: the only registry every machine has configured is the public index,
 * and no test here reaches it.
 */
import type { Browser } from '@playwright/test';
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { ALPINE_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { startRegistryFixtureServer, type RegistryFixtureServer } from './support/registry-fixture-server.js';
import { startDeliveredBuild, type DeliveredBuild } from './support/delivered-build.js';
import {
  expectLinesReadAsLines,
  expectNothingClippedOrOverlapped,
  measureSection,
  report as reportSection,
} from './support/property-bands.js';
// The measuring vocabulary itself — moved out of this file by batch 2 so that
// every batch of the plan measures its lists with the same instrument rather
// than with a copy of it. Nothing about it changed here: `support/classic-table.ts`
// carries the same probes, the same tolerances and the same reports.
import {
  VIEWPORTS,
  expectBothLinesUnclipped,
  expectClassicTable,
  expectPanReachesLastColumn,
  expectSameTableAsReference,
  measureList,
  reportList,
  round,
  settledList,
  type ListGeometry,
  type Viewport,
} from './support/classic-table.js';

/**
 * The revision the batch was implemented on top of — the merge this branch
 * starts from, byte-identical over `client/` and `server/` to the plan commit.
 */
const DELIVERED_REF = process.env.VEXEL_DELIVERED_REF ?? 'd17e1df';

const DESKTOP: Viewport = VIEWPORTS[0];
const PHONE: Viewport = VIEWPORTS[2];

/**
 * A list is named by a column only it has, which is what makes the locator
 * survive the surface recomposition: the section header naming the panel is no
 * longer inside the list's card (REQ-40), so a card can no longer be found by the
 * heading it used to hold.
 */
const LISTS = {
  volumes: 'MOUNTED BY',
  networks: 'SCOPE',
  registries: 'CREDENTIAL STORE',
  repositories: 'PULLS',
  containers: 'UPTIME',
  images: 'DISK USAGE',
} as const;

const RUN_ID = `${process.pid}-${Date.now()}`;
const volumeNames = [`vexel-e2e-classic-a-${RUN_ID}`, `vexel-e2e-classic-b-${RUN_ID}`];
const networkName = `vexel-e2e-classic-net-${RUN_ID}`;
const attachedName = `vexel-e2e-classic-attached-${RUN_ID}`;
const referenceContainer = `vexel-e2e-classic-ref-${RUN_ID}`;
const referenceImage = `vexel-e2e-classic-ref-${RUN_ID}:1`;
let volumeMountpoints: string[] = [];
let registryFixture: RegistryFixtureServer;

test.beforeAll(async () => {
  // Ensured at the point of use, not once for the run: the exclusive project prunes the host.
  await ensureImage(ALPINE_IMAGE);
  for (const name of volumeNames) {
    await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(name), name]);
  }
  volumeMountpoints = await Promise.all(
    volumeNames.map(async (name) => {
      const { stdout } = await execFileAsync('docker', ['volume', 'inspect', '-f', '{{.Mountpoint}}', name]);
      return stdout.trim();
    }),
  );
  await execFileAsync('docker', [
    'network',
    'create',
    ...ownershipArgs(networkName),
    '--subnet',
    '10.199.40.0/24',
    '--gateway',
    '10.199.40.1',
    networkName,
  ]);
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    attachedName,
    ...ownershipArgs(attachedName),
    '--network',
    networkName,
    '--entrypoint',
    'sleep',
    ALPINE_IMAGE,
    '600',
  ]);
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    referenceContainer,
    ...ownershipArgs(referenceContainer),
    '--entrypoint',
    'sleep',
    ALPINE_IMAGE,
    '600',
  ]);
  await execFileAsync('docker', ['tag', ALPINE_IMAGE, referenceImage]);
  registryFixture = await startRegistryFixtureServer();
});

test.afterAll(async () => {
  // `-fv` and not `-f`: without it an image's anonymous volumes outlive the container.
  await execFileAsync('docker', ['rm', '-fv', attachedName]).catch(() => undefined);
  await execFileAsync('docker', ['rm', '-fv', referenceContainer]).catch(() => undefined);
  await execFileAsync('docker', ['rmi', '-f', referenceImage]).catch(() => undefined);
  await execFileAsync('docker', ['network', 'rm', networkName]).catch(() => undefined);
  for (const name of volumeNames) {
    await execFileAsync('docker', ['volume', 'rm', '-f', name]).catch(() => undefined);
  }
  await registryFixture?.stop();
});

/** The stub the repositories list is filled from: no test here reaches Docker Hub. */
async function stubRepositories(page: Page): Promise<void> {
  await page.route('**/api/registries/repositories*', async (route) => {
    await route.fulfill({
      json: [
        { name: 'library/vexel-e2e', description: 'a stubbed repository, so this list has rows', pullCount: 1_800_000_000 },
        { name: 'myorg/vexel-e2e-plain', description: 'a second one, so two rows have a junction', pullCount: 48_000 },
      ],
    });
  });
  await page.route('**/api/registries/tags*', async (route) => {
    await route.fulfill({ json: [{ name: '1.0', sizeBytes: 5_242_880, pullReference: 'docker.io/library/vexel-e2e:1.0' }] });
  });
}

/**
 * The registries screen, on the run's own nine-registry inventory and with the
 * repositories list filled from the stub, at `viewport`.
 */
async function openRegistries(
  browser: Browser,
  viewport: Viewport,
  origin = registryFixture.origin,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ baseURL: origin, viewport });
  const page = await context.newPage();
  await stubRepositories(page);
  await openApp(page, 'registries');
  await expect(page.getByRole('heading', { level: 1, name: 'Registries' })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Search repositories').fill('vexel-e2e');
  return { page, close: () => context.close() };
}

for (const viewport of VIEWPORTS) {
  const at = `${viewport.width}×${viewport.height}`;

  // REQ-2 … REQ-5, REQ-8, REQ-12, REQ-14, REQ-15, REQ-39, REQ-40 — the whole of
  // the criteria on the four converted lists, with the two reference lists read
  // in the same run so the equality is a comparison and not a coincidence.
  test(`the converted lists are the containers table, not a table like it — ${at}`, async ({ page, browser }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(viewport);

    // The reference, first and from the tree: containers and images as they stand.
    await openApp(page, 'containers');
    await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });
    const containers = await settledList(page, LISTS.containers);
    reportList(at, 'containers (reference)', containers);

    await openApp(page, 'images-layers');
    await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible({ timeout: 20_000 });
    const images = await settledList(page, LISTS.images);
    reportList(at, 'images (reference)', images);

    const references = [
      { name: 'containers', list: containers },
      { name: 'images', list: images },
    ];

    await openApp(page, 'volumes-networks');
    await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible({ timeout: 20_000 });
    const volumes = await settledList(page, LISTS.volumes);
    const networks = await settledList(page, LISTS.networks);
    reportList(at, 'volumes', volumes);
    reportList(at, 'networks', networks);

    const { page: registriesPage, close } = await openRegistries(browser, viewport);
    try {
      const registries = await settledList(registriesPage, LISTS.registries);
      const repositories = await settledList(registriesPage, LISTS.repositories);
      reportList(at, 'registries', registries);
      reportList(at, 'repositories', repositories);
      await assertEveryList({ at, page, registriesPage, references, volumes, networks, registries, repositories });
    } finally {
      await close();
    }
  });
}

/**
 * Everything the four converted lists owe, once all six have been measured —
 * kept out of the test body so the registries context is closed in a `finally`
 * whatever fails.
 */
async function assertEveryList({
  at,
  page,
  registriesPage,
  references,
  volumes,
  networks,
  registries,
  repositories,
}: {
  at: string;
  page: Page;
  registriesPage: Page;
  references: { name: string; list: ListGeometry }[];
  volumes: ListGeometry;
  networks: ListGeometry;
  registries: ListGeometry;
  repositories: ListGeometry;
}): Promise<void> {
  {
    // The rows this file created are the ones asserted on: never a total, never an emptiness.
    expect(
      volumes.rows.some((row) => row.label.startsWith('vexel-e2e-classic-a-')),
      `${at}: the volume this spec created is not listed`,
    ).toBe(true);
    expect(
      networks.rows.some((row) => row.label.startsWith('vexel-e2e-classic-net-')),
      `${at}: the network this spec created is not listed`,
    ).toBe(true);

    for (const [name, list] of [
      ['volumes', volumes],
      ['networks', networks],
      ['registries', registries],
      ['repositories', repositories],
    ] as const) {
      expectClassicTable(at, name, list);
      expectSameTableAsReference(at, name, list, references);
    }

    // REQ-8 — the row that caused this report, and its two neighbours in shape.
    expectBothLinesUnclipped(at, 'volumes', volumes, volumeMountpoints[0]);
    expectBothLinesUnclipped(at, 'networks', networks, '10.199.40.0/24');
    expectBothLinesUnclipped(at, 'registries', registries);
    expectBothLinesUnclipped(at, 'repositories', repositories);

    // REQ-6 — the content below a row's cells is drawn whatever the presentation.
    expect(
      networks.rowContentBlocks,
      `${at}: ${networks.rowContentBlocks} chip group(s) under ${networks.rows.length} network row(s)`,
    ).toBe(networks.rows.length);
    expect(
      repositories.rowContentBlocks,
      `${at}: ${repositories.rowContentBlocks} tag group(s) under ${repositories.rows.length} repository row(s)`,
    ).toBe(repositories.rows.length);
    // …and it is not separated from the row it belongs to: the hairline is drawn
    // below it, so it groups with its own row rather than with the next one.
    for (const [name, list] of [
      ['networks', networks],
      ['repositories', repositories],
    ] as const) {
      for (const junction of list.ownContentJunctions) {
        expect(
          junction.edges,
          `${at} ${name}: ${junction.edges} rule(s) between a row's cells and that row's own content (${junction.label})`,
        ).toBe(0);
        expect(
          Math.abs(junction.gap),
          `${at} ${name}: ${round(junction.gap)}px between a row's cells and that row's own content`,
        ).toBeLessThanOrEqual(0.5);
      }
    }

    // REQ-12 — below the desktop breakpoint the lists pan, and no column is drawn at no width.
    for (const [name, list] of [
      ['volumes', volumes],
      ['networks', networks],
      ['registries', registries],
      ['repositories', repositories],
    ] as const) {
      expect(list.zeroWidthCells, `${at} ${name}: a cell is in the DOM and nowhere on screen`).toEqual([]);
      console.log(`[b1/REQ-12] ${at} ${name}: holds ${list.scrollWidth}px of row in ${list.clientWidth}px`);
      // REQ-12 is a claim about **reachability**: no column at zero width, and
      // every column brought into view by panning. A list whose columns fit the
      // box it is read in has nothing to pan and reaches every one of them
      // already, which is what the repositories list's two columns do at 375
      // (measured 333px of row in 333px); a list wider than its box must pan, and
      // the pan must arrive at the last column.
      if (list.scrollWidth > list.clientWidth) {
        const panPage = name === 'registries' || name === 'repositories' ? registriesPage : page;
        await expectPanReachesLastColumn(panPage, LISTS[name], `${at} ${name}`);
      }
    }
  }
}

// REQ-5 — "at every horizontal scroll offset": a header that is inset separately
// from its rows drifts as soon as the two pan, which is the retired
// presentation's own signature. Driven by a real wheel, at the one viewport where
// there is a pan at all.
test('the columns hold their header at every pan offset — 375×812', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize(PHONE);
  await openApp(page, 'volumes-networks');
  await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible({ timeout: 20_000 });

  for (const [name, column] of [
    ['volumes', LISTS.volumes],
    ['networks', LISTS.networks],
  ] as const) {
    const rested = await settledList(page, column);
    expect(rested.scrollWidth, `${name}: there is no pan to measure a drift against`).toBeGreaterThan(rested.clientWidth);

    // The list is named by the column only it carries: the panel's own heading is
    // no longer inside its card, so a card can no longer be found by its title.
    const table = page
      .locator('.ui-frame__content .ui-data-table')
      .filter({ has: page.locator('.ui-data-table__header-cell', { hasText: column }) })
      .first();
    const row = page.locator('.ui-data-table__row', { hasText: name === 'volumes' ? volumeNames[0] : networkName }).first();
    const rowBox = (await row.boundingBox())!;
    await page.mouse.move(rowBox.x + Math.min(60, rowBox.width / 2), rowBox.y + rowBox.height / 2);

    const offsets: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      await page.mouse.wheel(120, 0);
      await page.waitForTimeout(200);
      const panned = await measureList(page, column);
      const offset = await table.evaluate((element) => Math.round((element as HTMLElement).scrollLeft));
      offsets.push(
        `scrollLeft ${offset} → ${panned.columnEdges.map((edge) => `${edge.header || '·'}=${round(edge.worstDelta)}`).join(', ')}`,
      );
      for (const edge of panned.columnEdges) {
        expect(
          edge.worstDelta,
          `${name}: at scrollLeft ${offset} the ${edge.header || 'unnamed'} column drifts ${round(edge.worstDelta)}px from its header`,
        ).toBeLessThanOrEqual(0.5);
      }
      if (offset >= rested.scrollWidth - rested.clientWidth) break;
    }
    console.log(`[b1/REQ-5] 375×812 ${name}: ${offsets.join(' | ')}`);
    expect(offsets.length, `${name}: a wheel over the list moved it to no offset at all`).toBeGreaterThan(1);
  }
});

// REQ-6, REQ-14 — the regression this batch exists not to ship: the chips are
// drawn by a slot that used to be switched on by the presentation being retired,
// and their detach still acts on the chip it is on. Driven with a real pointer at
// the chip's own coordinates.
test('the networks chips are still under their row, counted, and their detach still detaches', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(DESKTOP);
  await openApp(page, 'volumes-networks');
  await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible({ timeout: 20_000 });

  const row = page.locator('.ui-data-table__row', { hasText: networkName }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  // The chips are a **sibling** of the row, not a descendant of it: the slot
  // renders below the selectable row and outside it (data-table.md). There is no
  // enclosing element to scope to any more, and the block carries the names of the
  // containers attached rather than the network's own, so it is found by position
  // — this list draws one content block per row, in the same order.
  const networks = page
    .locator('.ui-frame__content .ui-data-table')
    .filter({ has: page.locator('.ui-data-table__header-cell', { hasText: 'SCOPE' }) })
    .first();
  const index = await networks
    .locator('.ui-data-table__row')
    .evaluateAll((rows, wanted) => rows.findIndex((candidate) => (candidate.textContent ?? '').includes(wanted)), networkName);
  expect(index, 'no row of the networks list names the network this spec created').toBeGreaterThanOrEqual(0);
  const chips = networks.locator('.ui-data-table__row-content').nth(index);
  await expect(chips).toBeVisible({ timeout: 20_000 });
  await expect(chips, 'the chips of this network do not name the container attached to it').toContainText(attachedName);

  const before = await page.locator('.ui-data-table__row-content').count();
  const rows = await page.locator('.ui-data-table__row').count();
  console.log(`[b1/REQ-6] 1440×1000 networks: ${before} row-content block(s) under ${rows} row(s) on this screen`);
  expect(before, 'the networks list draws no content under its rows').toBeGreaterThan(0);

  const detach = chips.getByRole('button', { name: 'detach' }).first();
  // Brought into view as an operator brings it into view, and then clicked where
  // it is drawn: the panel sits below the fold on this screen.
  await detach.scrollIntoViewIfNeeded();
  const detachBox = (await detach.boundingBox())!;
  // Beside its own box: a control dragged out of the viewport keeps every character it had.
  expect(detachBox.y, 'the detach control sits above the top of the viewport').toBeGreaterThanOrEqual(0);
  expect(
    detachBox.y + detachBox.height,
    `the detach control ends at y ${round(detachBox.y + detachBox.height)} in a ${DESKTOP.height}px viewport`,
  ).toBeLessThanOrEqual(DESKTOP.height);
  await page.mouse.click(detachBox.x + detachBox.width / 2, detachBox.y + detachBox.height / 2);

  await expect(chips, 'the detach did not remove the container from its network').not.toContainText(attachedName, {
    timeout: 20_000,
  });
  await expect(chips).toContainText('No attached containers');

  // Put the fixture back the way the rest of this file expects it.
  await execFileAsync('docker', ['network', 'connect', networkName, attachedName]);
});

// REQ-10, REQ-11 — the expansion still opens under its own row, one at a time,
// inside the same table surface; and it holds the table's visible box while the
// grid pans underneath it.
test('one expansion opens at a time, under its own row, and holds the pan region — 375×812', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(PHONE);
  await openApp(page, 'volumes-networks');
  await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible({ timeout: 20_000 });

  const first = page.locator('.ui-data-table__row', { hasText: volumeNames[0] }).first();
  const second = page.locator('.ui-data-table__row', { hasText: volumeNames[1] }).first();
  await expect(first).toBeVisible({ timeout: 20_000 });

  // A real pointer on the row's own first cell: below the desktop breakpoint the
  // row is wider than the box it is read in, so its own centre can sit over
  // another column.
  const openRow = async (row: Locator) => {
    const cell = row.locator('.ui-data-table__cell').first();
    await cell.scrollIntoViewIfNeeded();
    const box = (await cell.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  };

  await openRow(first);
  const table = page.locator('.ui-frame__content .ui-data-table').first();
  const expansion = table.locator('.ui-data-table__expanded');
  await expect(expansion).toBeVisible({ timeout: 20_000 });
  expect(await expansion.count(), 'more than one panel is open in one list').toBe(1);
  expect(
    await expansion.evaluate((element) => (element.previousElementSibling?.textContent ?? '').slice(0, 60)),
    'the panel did not open directly below the row it belongs to',
  ).toContain(volumeNames[0]);

  await openRow(second);
  await expect(expansion).toBeVisible({ timeout: 20_000 });
  expect(await expansion.count(), 'opening a second panel left the first one open').toBe(1);
  expect(
    await expansion.evaluate((element) => (element.previousElementSibling?.textContent ?? '').slice(0, 60)),
    'the panel did not follow the row that was selected',
  ).toContain(volumeNames[1]);

  // …and it holds the table's own visible box while the grid pans underneath it.
  const geometry = await table.evaluate((element) => ({
    x: element.getBoundingClientRect().x,
    clientWidth: (element as HTMLElement).clientWidth,
    scrollWidth: (element as HTMLElement).scrollWidth,
  }));
  const rowBox = (await second.boundingBox())!;
  await page.mouse.move(rowBox.x + Math.min(60, rowBox.width / 2), rowBox.y + rowBox.height / 2);
  const readings: string[] = [];
  for (let step = 0; step < 4 && geometry.scrollWidth > geometry.clientWidth; step += 1) {
    await page.mouse.wheel(120, 0);
    await page.waitForTimeout(200);
    const offset = await table.evaluate((element) => Math.round((element as HTMLElement).scrollLeft));
    const box = (await expansion.boundingBox())!;
    readings.push(`scrollLeft ${offset} → x ${round(box.x)}`);
    expect(
      box.x - geometry.x,
      `at scrollLeft ${offset} the panel sits at x ${round(box.x)} where the table's visible box starts at ${round(geometry.x)}`,
    ).toBeGreaterThanOrEqual(-0.5);
    expect(box.x - geometry.x, `at scrollLeft ${offset} the panel has panned away from the table's visible box`).toBeLessThanOrEqual(1.5);
  }
  console.log(`[b1/REQ-10] 375×812 volumes: ${readings.join('; ')}`);
});

// REQ-36 — the certified predecessors on these screens, asserted rather than
// assumed: no copy affordance anywhere on these rows, and the detail property
// column rule on the panels they expand into.
test('the certified predecessors still hold on these rows and the panels they open', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(DESKTOP);
  await openApp(page, 'volumes-networks');
  await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible({ timeout: 20_000 });

  // plan-docker_management_app-copy_affordance_absence — nothing on a row offers a copy.
  const copyControls = await page.evaluate(() => {
    const labelled = Array.from(document.querySelectorAll<HTMLElement>('.ui-data-table__row *, .ui-data-table__row-content *'));
    return labelled
      .filter((element) => /copy/i.test(`${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''} ${element.textContent ?? ''}`))
      .map((element) => `${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 40)}"`);
  });
  expect(copyControls, 'a row of these lists offers a copy affordance').toEqual([]);

  const row = page.locator('.ui-data-table__row', { hasText: volumeNames[0] }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const cell = row.locator('.ui-data-table__cell').first();
  const box = (await cell.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  // plan-docker_management_app-detail_property_columns — the panel the row
  // expands into still lays its property bands out by the certified rule.
  const panel = page.locator('.ui-data-table__expanded .ui-detail-panel').first();
  await expect(panel).toBeVisible({ timeout: 20_000 });
  const section = await measureSection(panel.locator('.ui-definition-list').first(), 'volumes → inline inspect');
  console.log(reportSection('[b1/REQ-36] volumes → inline inspect', section));
  expectNothingClippedOrOverlapped(section, 'volumes → inline inspect, at 1440×1000');
  expectLinesReadAsLines(section, 'volumes → inline inspect, at 1440×1000');
});

/**
 * REQ-29 — the delivered figures, on record, before the change.
 *
 * The build this branch started from is checked out, built and served on a port
 * of its own, and the same measurements are read on it. Both halves are asserted:
 * the criteria **fail** there — which is what makes this check discriminating
 * rather than merely green — and they hold on the build under test, with the
 * reference's own figures beside them.
 */
test('the delivered build fails these criteria, and the numbers are on record', async ({ page, browser, baseURL }) => {
  test.setTimeout(600_000);
  expect(baseURL, 'this run has no origin of its own to compare the delivered build against').toBeTruthy();
  let delivered: DeliveredBuild | undefined;
  try {
    delivered = await startDeliveredBuild({ revision: DELIVERED_REF });
    const context = await browser.newContext({ baseURL: delivered.origin, viewport: DESKTOP });
    const before = await context.newPage();
    try {
      await openApp(before, 'volumes-networks');
      await expect(before.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible({ timeout: 30_000 });
      const deliveredVolumes = await settledList(before, LISTS.volumes);
      const deliveredNetworks = await settledList(before, LISTS.networks);
      reportList(`delivered ${delivered.revision.slice(0, 7)}`, 'volumes', deliveredVolumes);
      reportList(`delivered ${delivered.revision.slice(0, 7)}`, 'networks', deliveredNetworks);

      // Recorded failing, with its measurements — not "before: failed".
      expect(deliveredVolumes.rows.length, 'the delivered build listed fewer than two volumes').toBeGreaterThan(1);
      expect(
        deliveredVolumes.rowJunctions.map((junction) => round(junction.gap)).filter((gap) => gap > 0.5).length,
        'the delivered build already drew its volume rows flush, so this check discriminates nothing',
      ).toBeGreaterThan(0);
      expect(
        Math.max(...deliveredVolumes.rows.map((row) => row.carrierRadius)),
        'the delivered build already drew square volume rows',
      ).toBeGreaterThan(0);
      expect(deliveredVolumes.surfacesInside, 'the delivered build already drew no surface inside its list').toBeGreaterThan(0);
      // …and the two the amendment added, which the first attempt satisfied the
      // four geometric criteria without satisfying.
      expect(
        deliveredVolumes.rows.every((row) => row.modifiers.length === 0),
        'the delivered build already stated no row modifier',
      ).toBe(false);
      expect(
        Math.abs(deliveredVolumes.table.x - (deliveredVolumes.card?.x ?? 0)),
        'the delivered build already ran its table edge to edge in its card',
      ).toBeGreaterThan(1);
      expect(
        deliveredVolumes.sectionHeaderInsideCard,
        'the delivered build already put the section header outside the list’s card',
      ).toBe(true);
    } finally {
      await context.close();
    }

    // The fourth converted list's own before-figures.
    //
    // **These rows are stubbed, where every other list's are real fixtures**, and
    // the reason is the same one `registries-row-geometry.spec.ts` states: the
    // only registry every machine has configured is the public index, and no test
    // here reaches it (CLAUDE.md, "No test reaches Docker Hub"). The stub is
    // `stubRepositories` — **the same one the after-pass below uses**, so the two
    // readings differ in the build and in nothing else — and it serves the browse
    // endpoints alone: the table, its card and the tag chips under each row are
    // the product's own.
    const deliveredRegistries = await openRegistries(browser, DESKTOP, delivered.origin);
    try {
      const beforeRepositories = await settledList(deliveredRegistries.page, LISTS.repositories);
      const beforeRegistries = await settledList(deliveredRegistries.page, LISTS.registries);
      reportList(`delivered ${delivered.revision.slice(0, 7)}`, 'registries', beforeRegistries);
      reportList(`delivered ${delivered.revision.slice(0, 7)}`, 'repositories', beforeRepositories);

      expect(beforeRepositories.rows.length, 'the stub put fewer than two repositories on the delivered build').toBeGreaterThan(1);
      expect(
        beforeRepositories.rowJunctions.map((junction) => round(junction.gap)).filter((gap) => gap > 0.5).length,
        'the delivered build already drew its repository rows flush',
      ).toBeGreaterThan(0);
      expect(
        Math.max(...beforeRepositories.rows.map((row) => row.carrierRadius)),
        'the delivered build already drew square repository rows',
      ).toBeGreaterThan(0);
      expect(
        beforeRepositories.surfacesInside,
        'the delivered build already drew no surface inside its repositories list',
      ).toBeGreaterThan(0);
      expect(
        beforeRepositories.rows.every((row) => row.modifiers.length === 0),
        'the delivered build already stated no row modifier on a repository row',
      ).toBe(false);
      expect(
        Math.abs(beforeRepositories.table.x - (beforeRepositories.card?.x ?? 0)),
        'the delivered build already ran the repositories table edge to edge in its card',
      ).toBeGreaterThan(1);
      // …and the content below those rows was there before, which is the count the
      // conversion has to reproduce rather than merely not error on.
      expect(
        beforeRepositories.rowContentBlocks,
        'the delivered build drew no tag chips under its repository rows, so the count after proves nothing',
      ).toBe(beforeRepositories.rows.length);
    } finally {
      await deliveredRegistries.close();
    }
  } finally {
    await delivered?.stop();
  }

  // …and the same figures on the build under test, measured minutes apart against the same daemon.
  await page.setViewportSize(DESKTOP);
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible({ timeout: 20_000 });
  const containers = await settledList(page, LISTS.containers);
  await openApp(page, 'volumes-networks');
  await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible({ timeout: 20_000 });
  const volumes = await settledList(page, LISTS.volumes);
  const networks = await settledList(page, LISTS.networks);
  reportList('after', 'containers (reference)', containers);
  reportList('after', 'volumes', volumes);
  reportList('after', 'networks', networks);

  expectClassicTable('after', 'volumes', volumes);
  expectClassicTable('after', 'networks', networks);
  expectSameTableAsReference('after', 'volumes', volumes, [{ name: 'containers', list: containers }]);
  expectSameTableAsReference('after', 'networks', networks, [{ name: 'containers', list: containers }]);

  // The repositories list's after-figures, read through **the same stub** and on
  // the operator's own registry inventory, exactly as the before-pass read them:
  // the two sides differ in the build and in nothing else. (Its rows are stubbed;
  // the note above the before-pass says why, and it applies to both.)
  const afterRegistries = await openRegistries(browser, DESKTOP, baseURL as string);
  try {
    const repositories = await settledList(afterRegistries.page, LISTS.repositories);
    reportList('after', 'repositories', repositories);
    expectClassicTable('after', 'repositories', repositories);
    expectSameTableAsReference('after', 'repositories', repositories, [{ name: 'containers', list: containers }]);
    expect(
      repositories.rowContentBlocks,
      `after: ${repositories.rowContentBlocks} tag group(s) under ${repositories.rows.length} repository row(s), where the delivered build drew one per row`,
    ).toBe(repositories.rows.length);
  } finally {
    await afterRegistries.close();
  }
});
