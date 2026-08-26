import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { expectBandGrowsWithinItsRow, expectBandIsTheHeightOfItsControl, measureSearchBand } from './support/search-band-axis.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { containerDetail, openContainerDetail } from './support/container-cards.js';

// A tiny, already-cached image whose entrypoint is overridden to `sh`: the
// container prints one line on each stream, then keeps ticking so the tail is
// live while the test looks at it.
const LOG_SCRIPT = 'echo hello-from-stdout; echo boom-from-stderr 1>&2; i=0; while true; do i=$((i+1)); echo tick-$i; sleep 1; done';

async function createLoggingContainer(name: string): Promise<void> {
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sh', 'alpine:3.20', '-c', LOG_SCRIPT]);
}

/** Prints `count` numbered lines at once, then stays alive: a log of a known, stable size. */
async function createBulkLoggingContainer(name: string, count: number): Promise<void> {
  await execFileAsync('docker', [
    'run',
    '-d',
    '--name',
    name,
    // Labelled like every other fixture here, so a run killed mid-test still leaves something
    // `npm run test:sweep -w server` can prove is ours (CLAUDE.md).
    ...ownershipArgs(name),
    '--entrypoint',
    'sh',
    'alpine:3.20',
    '-c',
    `for i in $(seq 1 ${count}); do echo bulk-$i; done; sleep 300`,
  ]);
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** The project's own default viewport, restored by the one test that moves it. */
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

/**
 * One line of each kind the level reading has to tell apart, on both streams: two lines that state
 * a marker, one ordinary line, and the lines that merely mention an error and must stay neutral.
 */
const ORDINARY_LINE = 'ordinary line';
const ERROR_LINE = 'ERROR: cannot connect';
const WARN_LINE = 'WARN retrying in 3s';
const MENTIONS_ONLY = ['GET /api/error-report 200', 'LOG_LEVEL=ERROR', 'no errors found', 'POST /v1/payments 500 42ms'];
const STDERR_LINE = 'ordinary on stderr';
const STDERR_ERROR_LINE = 'ERROR: on stderr';

async function createLevelledLoggingContainer(name: string): Promise<void> {
  const script = [
    `echo '${ORDINARY_LINE}'`,
    `echo '${ERROR_LINE}'`,
    `echo '${WARN_LINE}'`,
    ...MENTIONS_ONLY.map((line) => `echo '${line}'`),
    `echo '${STDERR_LINE}' 1>&2`,
    `echo '${STDERR_ERROR_LINE}' 1>&2`,
    'sleep 300',
  ].join('; ');
  await execFileAsync('docker', ['run', '-d', '--name', name, ...ownershipArgs(name), '--entrypoint', 'sh', 'alpine:3.20', '-c', script]);
}

/**
 * How a line is drawn, read from the browser's own computed values rather than from a class name:
 * the channels a distinction can ride, plus the text the line actually shows.
 */
interface LineTreatment {
  color: string;
  backgroundColor: string;
  backgroundImage: string;
  borderLeft: string;
  boxShadow: string;
  accent: string;
  text: string;
}

type TreatmentProperty = Exclude<keyof LineTreatment, 'text'>;

async function readLineTreatments(detail: Locator, texts: string[]): Promise<Record<string, LineTreatment>> {
  return await detail.locator('.ui-log-stream__lines').evaluate((root, wanted: string[]) => {
    const treatments: Record<string, LineTreatment> = {};
    for (const text of wanted) {
      const line = [...root.querySelectorAll('.ui-log-stream__line')].find(
        (row) => row.querySelector('.ui-log-stream__text')?.textContent === text,
      );
      if (!line) throw new Error(`no line is drawn for "${text}"`);
      const own = getComputedStyle(line);
      // The leading-edge layer too: a distinction drawn on a pseudo element is invisible to the
      // element's own computed style.
      const edge = getComputedStyle(line, '::before');
      treatments[text] = {
        color: own.color,
        backgroundColor: own.backgroundColor,
        backgroundImage: own.backgroundImage,
        borderLeft: `${own.borderLeftWidth} ${own.borderLeftStyle} ${own.borderLeftColor}`,
        boxShadow: own.boxShadow,
        accent: `${edge.content} ${edge.backgroundColor} ${edge.width} ${edge.borderLeftWidth} ${edge.borderLeftColor}`,
        text: line.textContent ?? '',
      };
    }
    return treatments;
  }, texts);
}

/** How a line is drawn, without the text it draws: two lines' treatments compared, never their content. */
function visualOf(treatment: LineTreatment): Omit<LineTreatment, 'text'> {
  const { text: _text, ...visual } = treatment;
  return visual;
}

/** The texts of the drawn lines carrying at least one search match. */
async function readMarkedLines(detail: Locator): Promise<string[]> {
  return await detail.locator('.ui-log-stream__lines').evaluate((root) =>
    [...root.querySelectorAll('.ui-log-stream__line')]
      .filter((line) => line.querySelector('mark') !== null)
      .map((line) => line.querySelector('.ui-log-stream__text')?.textContent ?? ''),
  );
}

interface ControlBox {
  group: string;
  name: string;
  /** The label of the group the control is actually inside of, or "(none)". */
  owner: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** What a pointer aimed at the control's own centre reaches. */
  hitsItself: boolean;
}

async function controlBox(group: string, name: string, locator: Locator): Promise<ControlBox> {
  return await locator.evaluate(
    (element, [groupName, controlName]) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const owner = element.closest('.ui-control-group');
      return {
        group: groupName,
        name: controlName,
        owner: owner?.querySelector('.ui-control-group__label')?.textContent ?? '(none)',
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        hitsItself: hit !== null && (element.contains(hit) || hit.contains(element)),
      };
    },
    [group, name],
  );
}

/** The groups' own boxes and the row they sit on, read in one frame so every number is one layout. */
async function readGroupBoxes(detail: Locator) {
  return await detail.locator('.ui-log-stream__actions').evaluate((row) => {
    const rowRect = row.getBoundingClientRect();
    const rowStyle = getComputedStyle(row);
    return {
      groups: [...row.querySelectorAll('.ui-control-group')].map((group) => {
        const rect = group.getBoundingClientRect();
        // The gap the group lays its own controls out with: what a break costs, so "there was room
        // for the next control" is measured against the room it would actually have needed.
        const inner = group.querySelector('.ui-row');
        return {
          label: group.querySelector('.ui-control-group__label')?.textContent ?? '',
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          gap: inner ? Number.parseFloat(getComputedStyle(inner).columnGap) || 0 : 0,
        };
      }),
      row: {
        contentLeft: rowRect.left + Number.parseFloat(rowStyle.paddingLeft),
        contentRight: rowRect.right - Number.parseFloat(rowStyle.paddingRight),
      },
    };
  });
}

/**
 * The boxes grouped into the lines they are actually drawn on: two controls share a line when their
 * vertical extents overlap by more than half the shorter one. Read from geometry, never from the
 * markup — which line a control is placed on is exactly what a wrap changes.
 */
function rowsOf<T extends { y: number; height: number }>(boxes: T[]): T[][] {
  const rows: T[][] = [];
  for (const box of [...boxes].sort((left, right) => left.y - right.y)) {
    const row = rows.find((candidate) => {
      const reference = candidate[0]!;
      const overlap = Math.min(reference.y + reference.height, box.y + box.height) - Math.max(reference.y, box.y);
      return overlap > Math.min(reference.height, box.height) / 2;
    });
    if (row) row.push(box);
    else rows.push([box]);
  }
  return rows;
}

async function openLogsTab(page: Page, name: string) {
  await openContainerDetail(page, name);
  const detail = containerDetail(page);
  await expect(detail).toBeVisible();
  await detail.getByRole('tab', { name: 'Logs' }).click();
  return detail;
}

test.beforeEach(async ({ page }) => {
  // Pinned, not inherited: the last active screen survives by design (REQ-115),
  // and the Dashboard the application otherwise lands on names this screen in a
  // cross-navigation tile of its own, which an unscoped rail click matches too.
  await openApp(page, 'containers');
  await expect(page.getByRole('heading', { level: 1, name: 'Containers' })).toBeVisible();
});

// These tests keep a container's detail panel open across several UI steps.
// DataTable virtualisation does not reserve extra space for an expanded row
// (ui-library/specs/data-table.md), so another worker's containers appearing
// mid-interaction can push the row out of the mounted window and reset the
// panel; serial mode keeps that window stable.
test.describe('Container logs (REQ-30, REQ-31)', () => {
  test.describe.configure({ mode: 'serial' });

  // plan-docker_management_app/REQ-30 — a container's logs can be viewed, with both streams and a live follow
  test('the Logs tab shows the container output from both streams and keeps following it live', async ({ page }) => {
    const name = `vexel-e2e-logs-live-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openLogsTab(page, name);

      await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 15_000 });
      await expect(detail.getByText('boom-from-stderr')).toBeVisible();
      // New output appears on its own, with no manual refresh.
      await expect(detail.getByText('tick-3', { exact: true })).toBeVisible({ timeout: 20_000 });
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-30 — the streams shown are selectable
  test('turning stdout off leaves only the stderr output on screen', async ({ page }) => {
    const name = `vexel-e2e-logs-streams-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 15_000 });

      await detail.getByRole('button', { name: 'stdout', exact: true }).click();

      await expect(detail.getByText('boom-from-stderr')).toBeVisible({ timeout: 15_000 });
      await expect(detail.getByText('hello-from-stdout')).toHaveCount(0);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-30 — timestamps can be turned on
  test('turning timestamps on shows the instant of each line', async ({ page }) => {
    const name = `vexel-e2e-logs-timestamps-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 15_000 });
      await expect(detail.locator('.ui-log-stream__timestamp')).toHaveCount(0);

      // The toggle's input is visually hidden behind its track, as a real
      // operator sees it; the label is what gets clicked.
      await detail.getByText('Timestamps', { exact: true }).click();
      await expect(detail.getByRole('checkbox', { name: 'Timestamps' })).toBeChecked();

      const firstTimestamp = detail.locator('.ui-log-stream__timestamp').first();
      await expect(firstTimestamp).toBeVisible({ timeout: 15_000 });
      await expect(firstTimestamp).toHaveText(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // detail_modal/REQ-20, REQ-21 — the log stream's floating jump-to-live control still blurs the
  // lines beneath it inside the dialog, and is not repaired by adding anything to the allow-list.
  //
  // This is the case CLAUDE.md's blur section names: an element carrying `backdrop-filter` becomes
  // the backdrop root of everything inside it, and in Chromium a nested one renders nothing at all.
  // The dialog above this control carries the overlay material, so a build that moved the blur off
  // the surface's own `::before` layer would leave the lines under this control sharp — an absence
  // no content assertion can see.
  test('the jump-to-live control still blurs the lines under it inside the dialog', async ({ page }) => {
    const name = `vexel-e2e-logs-jump-${Date.now()}`;
    try {
      await createBulkLoggingContainer(name, 400);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText('bulk-400', { exact: true })).toBeVisible({ timeout: 20_000 });

      // Scrolled back from the live edge, which is the only state the control exists in.
      await detail.locator('.ui-log-stream__surface .ui-scroll-area').evaluate((node) => {
        node.scrollTop = 0;
      });
      const jump = detail.locator('.ui-log-stream__jump');
      await expect(jump, 'the jump-to-live control never appeared').toBeVisible({ timeout: 20_000 });

      // The control stands over the lines, and it is inside the dialog rather than hoisted out of it.
      const box = (await jump.boundingBox())!;
      const dialogBox = (await detail.boundingBox())!;
      expect(box.x, 'the jump-to-live control is drawn outside the dialog').toBeGreaterThanOrEqual(dialogBox.x - 1);
      expect(box.x + box.width, 'the jump-to-live control is drawn outside the dialog').toBeLessThanOrEqual(
        dialogBox.x + dialogBox.width + 1,
      );

      // The blur is declared on the surface's own `::before` layer, valued from the one token.
      const blur = await jump.evaluate((element) => {
        const layer = getComputedStyle(element, '::before');
        const surface = getComputedStyle(element);
        // `-webkit-backdrop-filter` is read through the property name, the typed alias not
        // covering the prefixed form.
        const read = (style: CSSStyleDeclaration) =>
          style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter');
        return { layer: read(layer), surface: read(surface) };
      });
      console.log(`[REQ-21] the jump-to-live control blurs with: ${JSON.stringify(blur)}`);
      expect(blur.layer, 'the jump-to-live control no longer blurs the lines beneath it').toMatch(/blur\(20px\)/);
      expect(blur.surface, 'the blur moved onto the surface itself, making it a backdrop root').toMatch(/^(none|)$/);

      // Nothing was added to the allow-list to get there: this is the delivered selector.
      expect(await jump.getAttribute('class')).toContain('ui-overlay-glass');
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-30 — the tail size bounds the log to that many trailing lines
  test('picking a tail size reloads the log bounded to that many trailing lines', async ({ page }) => {
    const name = `vexel-e2e-logs-tail-${Date.now()}`;
    try {
      // 200 lines at once: the search match count is what makes the loaded
      // window observable to the operator.
      await createBulkLoggingContainer(name, 200);
      const detail = await openLogsTab(page, name);
      await detail.getByRole('textbox', { name: 'Search the stream' }).fill('bulk-');
      await expect(detail.getByText(/^1\/200$/)).toBeVisible({ timeout: 20_000 });

      await detail.getByRole('combobox', { name: 'Tail size' }).selectOption('last 100 lines');

      await expect(detail.getByText(/^1\/100$/)).toBeVisible({ timeout: 20_000 });
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-31 — the displayed logs can be text-searched with the matches highlighted
  test('searching the log highlights the matches, counts them and moves between them', async ({ page }) => {
    const name = `vexel-e2e-logs-search-${Date.now()}`;
    try {
      // 20 lines, of which bulk-1, bulk-10 … bulk-19 match "bulk-1": a match
      // count that does not move while the test looks at it.
      await createBulkLoggingContainer(name, 20);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText('bulk-20', { exact: true })).toBeVisible({ timeout: 20_000 });

      await detail.getByRole('textbox', { name: 'Search the stream' }).fill('bulk-1');

      await expect(detail.locator('mark').first()).toBeVisible();
      await expect(detail.getByText('1/11')).toBeVisible();

      await detail.getByRole('button', { name: 'Next' }).click();
      await expect(detail.getByText('2/11')).toBeVisible();

      await detail.getByRole('button', { name: 'Previous' }).click();
      await expect(detail.getByText('1/11')).toBeVisible();
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app-filesystem_browser_layout/REQ-4, REQ-27, REQ-35 — **the row axis of
  // the shared search band**, measured on the one screen that uses it that way.
  //
  // The band is corrected for a column by the filesystem-browser layout report, and the correction
  // lives in the band itself rather than at either call site. This is the check that goes red if the
  // column is fixed by breaking the row: the band keeps its 240px floor, keeps growing into the room
  // its row leaves it — asserted on the box, so "grow" is measured and not read off a stylesheet —
  // and is the height of the control it holds here exactly as it must become there.
  //
  // Re-anchored on the composition, not weakened (…tabs_composition_refactor/REQ-43): the band's own
  // declaration is untouched and the floor stands, but the band is no longer the last control of its
  // row — the timestamps control and `Download` follow it inside the `Read` group — so "grows to the
  // row's content edge" is now read as "grows up to the control drawn after it".
  //
  // Geometry, with a real pointer at the visible control's coordinates (REQ-29, REQ-31).
  test('the search band keeps its row-axis behaviour: at least 240px wide, growing into its row, and the height of its control', async ({ page }) => {
    const name = `vexel-e2e-logs-band-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 15_000 });

      // A real pointer on the visible field before it is measured: the band is
      // read in the state an operator leaves it in, never through its markup.
      await detail.getByRole('textbox', { name: 'Search the stream' }).click();
      const geometry = await measureSearchBand(detail.locator('.ui-stream-search'));

      expectBandGrowsWithinItsRow('Containers → Logs, the stream search band', geometry);
      expectBandIsTheHeightOfItsControl('Containers → Logs, the stream search band', geometry);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // plan-docker_management_app/REQ-31 — the visible log can be downloaded
  test('downloading the log saves it as <container name>-logs.txt', async ({ page }) => {
    const name = `vexel-e2e-logs-download-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 15_000 });

      const downloadPromise = page.waitForEvent('download');
      await detail.getByRole('button', { name: 'Download' }).click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toBe(`${name}-logs.txt`);
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // …tabs_composition_refactor/REQ-28 — "The two groups wrap as whole blocks: at every width the
  // line break falls between them, never inside one, and no control is separated from the group it
  // belongs to." Geometry only: a row that reflows keeps every child and every character it had,
  // and what it changes is coordinates (CLAUDE.md). REQ-27 is asserted here too, since a group's
  // membership is what "the break falls between them" is about.
  test('the two control groups wrap as whole blocks, the break falling between them', async ({ page }) => {
    test.setTimeout(180_000);
    const name = `vexel-e2e-logs-groups-${Date.now()}`;
    try {
      await createLoggingContainer(name);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText('hello-from-stdout')).toBeVisible({ timeout: 20_000 });

      const controls: [string, string, Locator][] = [
        ['Fetch', 'stdout', detail.getByRole('button', { name: 'stdout', exact: true })],
        ['Fetch', 'stderr', detail.getByRole('button', { name: 'stderr', exact: true })],
        ['Fetch', 'Tail size', detail.getByRole('combobox', { name: 'Tail size' })],
        ['Fetch', 'Since', detail.getByRole('textbox', { name: 'Since' })],
        ['Fetch', 'Until', detail.getByRole('textbox', { name: 'Until' })],
        ['Read', 'Search the stream', detail.getByRole('textbox', { name: 'Search the stream' })],
        ['Read', 'Previous', detail.getByRole('button', { name: 'Previous' })],
        ['Read', 'Next', detail.getByRole('button', { name: 'Next' })],
        // The toggle's own visible box, never the input hidden behind it (REQ-44).
        ['Read', 'Timestamps', detail.locator('.ui-toggle').filter({ hasText: 'Timestamps' })],
        ['Read', 'Download', detail.getByRole('button', { name: 'Download' })],
      ];

      let sawTheBreak = false;
      for (const viewport of [
        { width: 1500, height: 900 },
        { width: 1280, height: 900 },
        { width: 1024, height: 900 },
        { width: 800, height: 900 },
        { width: 375, height: 812 },
      ]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(500);
        const at = `${viewport.width}×${viewport.height}`;

        const boxes: ControlBox[] = [];
        for (const [group, controlName, locator] of controls) {
          await expect(locator, `[REQ-28] ${at}: ${controlName} is not on the surface`).toBeVisible();
          boxes.push(await controlBox(group, controlName, locator));
        }
        const groups = await readGroupBoxes(detail);
        const lines = rowsOf(boxes);
        console.log(
          `[REQ-28] ${at} — groups ${groups.groups
            .map((group) => `${group.label} ${Math.round(group.width)}px at y=${Math.round(group.y)}`)
            .join(', ')} on a ${Math.round(groups.row.contentRight - groups.row.contentLeft)}px row; lines: `
            + lines.map((line) => `[${line.map((box) => `${box.group}/${box.name}`).join(', ')}]`).join(' '),
        );

        // The two labelled groups, and every control inside the one it belongs to (REQ-27).
        expect(
          groups.groups.map((group) => group.label).sort(),
          `[REQ-28] ${at}: the controls are not presented as the two labelled groups`,
        ).toEqual(['Fetch', 'Read']);
        const fetchGroup = groups.groups.find((group) => group.label === 'Fetch')!;
        const readGroup = groups.groups.find((group) => group.label === 'Read')!;
        for (const box of boxes) {
          expect(box.owner, `[REQ-28] ${at}: ${box.name} is not inside the ${box.group} group`).toBe(box.group);
          expect(box.hitsItself, `[REQ-28] ${at}: ${box.name} is not reachable at the centre of its own box`).toBe(true);
          // No control is separated from the group it belongs to: it is drawn inside its box.
          const own = box.group === 'Fetch' ? fetchGroup : readGroup;
          expect(
            box.x >= own.x - 1 && box.x + box.width <= own.x + own.width + 1
              && box.y >= own.y - 1 && box.y + box.height <= own.y + own.height + 1,
            `[REQ-28] ${at}: ${box.name} is drawn outside the ${box.group} group's own box`,
          ).toBe(true);
        }

        // REQ-28's **first** clause — the break falls "never inside one" — asserted here rather
        // than left to the second. It is asserted at every width driven, with one escape that is
        // measured and never assumed: a group may be drawn on more than one line only where it
        // alone has been squeezed to the whole row and every one of its breaks was forced.
        //
        // That escape is **not** in REQ-28's words. It is written in
        // `containers/specs/container-logs-view.md` and `ui-library/specs/control-group.md` — "a
        // group breaks internally only where it alone is wider than the row" — because at the phone
        // width the alternative is the sideways scrolling REQ-40 forbids. Whether a requirement may
        // be narrowed by a component spec is not this check's to settle: what it does is refuse to
        // let the escape be silent, and refuse to grant it where the room was there.
        for (const group of [fetchGroup, readGroup]) {
          const own = boxes.filter((box) => box.group === group.label);
          const drawn = rowsOf(own);
          if (drawn.length === 1) continue;

          const other = group === fetchGroup ? readGroup : fetchGroup;
          const rowWidth = groups.row.contentRight - groups.row.contentLeft;
          console.log(
            `[REQ-28] ${at} — the ${group.label} group is drawn on ${drawn.length} lines: `
              + `${Math.round(group.width)}px of a ${Math.round(rowWidth)}px row`,
          );

          // It is alone on its line, and it has been squeezed to the whole row: nothing narrower
          // than the row broke, and it did not break while still sharing a line with the other.
          expect(
            Math.min(group.y + group.height, other.y + other.height) - Math.max(group.y, other.y),
            `[REQ-28] ${at}: the ${group.label} group broke into ${drawn.length} lines while still sharing a line with ${other.label}`,
          ).toBeLessThanOrEqual(0);
          expect(
            rowWidth - group.width,
            `[REQ-28] ${at}: the ${group.label} group broke into ${drawn.length} lines although it is only `
              + `${Math.round(group.width)}px of the ${Math.round(rowWidth)}px row it has to itself`,
          ).toBeLessThanOrEqual(1);

          // And every one of its breaks was forced: what the line it left behind still had free is
          // less than the control that went to the next line needed.
          const limit = group.x + group.width;
          for (let index = 0; index + 1 < drawn.length; index += 1) {
            const free = limit - Math.max(...drawn[index]!.map((box) => box.x + box.width));
            const next = drawn[index + 1]!.reduce((leftmost, box) => (box.x < leftmost.x ? box : leftmost));
            expect(
              free,
              `[REQ-28] ${at}: the ${group.label} group broke before ${next.name} although its line still had `
                + `${Math.round(free)}px free and ${next.name} needs ${Math.round(next.width + group.gap)}px`,
            ).toBeLessThan(next.width + group.gap);
          }
        }

        const share = Math.min(fetchGroup.y + fetchGroup.height, readGroup.y + readGroup.height)
          - Math.max(fetchGroup.y, readGroup.y) > Math.min(fetchGroup.height, readGroup.height) / 2;
        if (!share) {
          sawTheBreak = true;
          // The row has broken: the break falls between the groups, so no drawn line mixes them and
          // neither group is left with a control on the other's line.
          for (const line of lines) {
            expect(
              [...new Set(line.map((box) => box.group))],
              `[REQ-28] ${at}: the row broke and one drawn line still holds controls of both groups — ${line
                .map((box) => `${box.group}/${box.name}`)
                .join(', ')}`,
            ).toHaveLength(1);
          }
        }

        if (viewport.width === 1500) {
          // Wide enough for both: one line, and the composed row spreads them to its two ends
          // (ui-library/specs/log-stream.md, the composer form).
          expect(share, '[REQ-28] 1500×900: the two groups do not share a line although both fit').toBe(true);
          expect(
            Math.abs(fetchGroup.x - groups.row.contentLeft),
            `[REQ-28] the Fetch group starts ${Math.round(fetchGroup.x - groups.row.contentLeft)}px inside the row's content edge`,
          ).toBeLessThanOrEqual(2);
          expect(
            Math.abs(readGroup.x + readGroup.width - groups.row.contentRight),
            `[REQ-28] the Read group ends ${Math.round(groups.row.contentRight - readGroup.x - readGroup.width)}px short of the row's content edge`,
          ).toBeLessThanOrEqual(2);
        }

        if (viewport.width === 375) {
          // REQ-40, re-asserted on the surface this batch rearranged: nothing asks for sideways
          // scrolling at the phone width.
          const overflow = await detail.evaluate((dialog) => {
            const row = dialog.querySelector('.ui-log-stream__actions')!;
            return {
              dialog: dialog.scrollWidth - dialog.clientWidth,
              row: row.scrollWidth - row.clientWidth,
              document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
          });
          console.log(`[REQ-40] 375×812 — overflow ${JSON.stringify(overflow)}`);
          expect(overflow.row, '[REQ-40] the control row overflows sideways at 375px').toBeLessThanOrEqual(1);
          expect(overflow.dialog, '[REQ-40] the dialog overflows sideways at 375px').toBeLessThanOrEqual(1);
          expect(overflow.document, '[REQ-40] the page overflows sideways at 375px').toBeLessThanOrEqual(1);
        }
      }

      expect(sawTheBreak, '[REQ-28] the row never broke at any of the widths driven: the break was not observed').toBe(true);
    } finally {
      await page.setViewportSize(DEFAULT_VIEWPORT);
      await removeContainerQuietly(name);
    }
  });

  // …tabs_composition_refactor/REQ-29 — "A log line is distinguished by the level deduced from its
  // text, and the deduction is conservative: a line carrying no recognised level marker keeps the
  // neutral treatment rather than being guessed at." The negative half is the one that matters: a
  // wrong colour is worse than no colour.
  //
  // REQ-31 stands beside it: the text reads exactly as the container wrote it, and the search still
  // marks its matches over the colouring.
  test('the level colours the lines that state one and leaves the lines that merely mention an error neutral', async ({ page }) => {
    test.setTimeout(180_000);
    const name = `vexel-e2e-logs-levels-${Date.now()}`;
    try {
      await createLevelledLoggingContainer(name);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText(ORDINARY_LINE, { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(detail.getByText(ERROR_LINE, { exact: true })).toBeVisible({ timeout: 20_000 });

      const treatments = await readLineTreatments(detail, [ORDINARY_LINE, ERROR_LINE, WARN_LINE, ...MENTIONS_ONLY]);
      console.log(
        `[REQ-29] ${Object.entries(treatments)
          .map(([text, treatment]) => `"${text}" → ${treatment.color}`)
          .join('; ')}`,
      );

      const neutral = treatments[ORDINARY_LINE]!;
      expect(treatments[ERROR_LINE]!.color, '[REQ-29] the error line is drawn in the ordinary text colour').not.toBe(neutral.color);
      expect(treatments[WARN_LINE]!.color, '[REQ-29] the warned line is drawn in the ordinary text colour').not.toBe(neutral.color);
      expect(treatments[WARN_LINE]!.color, '[REQ-29] the two levels are drawn in the same colour').not.toBe(treatments[ERROR_LINE]!.color);

      // The conservative half: no marker, no colour — the whole treatment, not only the text colour.
      for (const text of MENTIONS_ONLY) {
        expect(
          treatments[text]!.color,
          `[REQ-29] "${text}" states no level marker and was coloured ${treatments[text]!.color} against the ordinary ${neutral.color}`,
        ).toBe(neutral.color);
        expect(
          visualOf(treatments[text]!),
          `[REQ-29] "${text}" states no level marker and is not left in the neutral treatment`,
        ).toEqual(visualOf(neutral));
      }

      // REQ-31 — the text, verbatim, whatever distinguishes the line.
      for (const text of [ORDINARY_LINE, ERROR_LINE, WARN_LINE, ...MENTIONS_ONLY]) {
        expect(treatments[text]!.text, '[REQ-31] a line no longer reads as the container wrote it').toBe(text);
      }

      // REQ-31 — and the search still finds and marks them, over the colouring.
      await detail.getByRole('textbox', { name: 'Search the stream' }).click();
      await detail.getByRole('textbox', { name: 'Search the stream' }).pressSequentially('error');
      await expect(detail.locator('mark').first()).toBeVisible();
      const marked = await readMarkedLines(detail);
      console.log(`[REQ-31] marked lines: ${JSON.stringify(marked)}`);
      expect(marked, '[REQ-31] the search no longer finds the levelled line').toContain(ERROR_LINE);
      expect(marked, '[REQ-31] the search no longer finds a line that merely mentions an error').toContain('no errors found');
      // The line carrying both distinctions at once is marked like any other: the highlight rides
      // over the level colour and the stream's own edge rather than being hidden by either.
      expect(marked, '[REQ-31] the search no longer finds the line that is both an stderr and an error line').toContain(
        STDERR_ERROR_LINE,
      );

      const afterSearch = await readLineTreatments(detail, [ERROR_LINE, ORDINARY_LINE]);
      expect(afterSearch[ERROR_LINE]!.text, '[REQ-31] the highlight rewrote the line\'s text').toBe(ERROR_LINE);
      expect(afterSearch[ERROR_LINE]!.color, '[REQ-31] the highlight took the line\'s level colour away').toBe(
        treatments[ERROR_LINE]!.color,
      );
    } finally {
      await removeContainerQuietly(name);
    }
  });

  // …tabs_composition_refactor/REQ-30 — "A line coming from stderr is distinguished from a line
  // coming from stdout", and the level must not swallow it: the two distinctions ride different
  // channels, so a line that is both shows both (ui-library/specs/log-stream.md).
  test('a stderr line stays told from a stdout one, whether or not it states a level', async ({ page }) => {
    test.setTimeout(180_000);
    const name = `vexel-e2e-logs-stderr-${Date.now()}`;
    try {
      await createLevelledLoggingContainer(name);
      const detail = await openLogsTab(page, name);
      await expect(detail.getByText(STDERR_LINE, { exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(detail.getByText(STDERR_ERROR_LINE, { exact: true })).toBeVisible({ timeout: 20_000 });

      const treatments = await readLineTreatments(detail, [ORDINARY_LINE, ERROR_LINE, STDERR_LINE, STDERR_ERROR_LINE]);
      console.log(`[REQ-30] ${JSON.stringify(treatments)}`);

      const properties = Object.keys(treatments[ORDINARY_LINE]!).filter((property) => property !== 'text') as TreatmentProperty[];
      const streamChannel = properties.filter(
        (property) => treatments[STDERR_LINE]![property] !== treatments[ORDINARY_LINE]![property],
      );
      const levelChannel = properties.filter(
        (property) => treatments[ERROR_LINE]![property] !== treatments[ORDINARY_LINE]![property],
      );

      expect(streamChannel, '[REQ-30] nothing distinguishes an stderr line from a stdout one').not.toHaveLength(0);
      expect(levelChannel, '[REQ-29] nothing distinguishes an error line from an ordinary one').not.toHaveLength(0);
      expect(
        streamChannel.filter((property) => levelChannel.includes(property)),
        '[REQ-30] the stream and the level are drawn on the same channel, so one hides the other',
      ).toEqual([]);

      // The line that is both: the level readable, and the stream readable, neither replacing the other.
      for (const property of levelChannel) {
        expect(
          treatments[STDERR_ERROR_LINE]![property],
          `[REQ-30] the stderr line that states an error lost its level (${property})`,
        ).toBe(treatments[ERROR_LINE]![property]);
      }
      for (const property of streamChannel) {
        expect(
          treatments[STDERR_ERROR_LINE]![property],
          `[REQ-30] the stderr line that states an error is no longer told from a stdout one (${property})`,
        ).toBe(treatments[STDERR_LINE]![property]);
      }
    } finally {
      await removeContainerQuietly(name);
    }
  });
});
