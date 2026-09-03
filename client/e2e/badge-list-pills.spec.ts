import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import { TINY_IMAGE, ensureImage } from '../../server/test/support/base-images.js';
import { F4_VIEWPORTS, describeRect, round } from './support/truncating-rows.js';
import { waitUntilTheScreenStatesWhatTheDaemonStates } from './support/caught-up.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/**
 * **No badge is ever painted over the badge next to it**
 * (`ui-library/specs/table-cells.md`, `plan-ui-coherence-optimisation/REQ-18`,
 * `REQ-89`).
 *
 * The defect batch 8 recorded and batch 13 owns: a `BadgeListCell`'s `__item`
 * wrapper is `flex: 0 1 auto` and shrinks, the `.ui-badge` inside it did not, and
 * it carried no truncation of its own — so under width pressure the pill simply
 * overflowed its wrapper and was drawn across its neighbour. Measured on the
 * shape that produced it, seven platform strings in a 165px column at 1440×1000:
 * item boxes **65.1 / 67.4 / 24.8px** against badge boxes **78 / 80.7 / 29.7px**,
 * each pill ending ~9px inside its neighbour's box, twice per row and at all
 * three viewports.
 *
 * **It showed nowhere on the delivered data, and only because of the data** — one
 * short tag per images row, `MOUNTED BY` usually empty. So this spec *makes* the
 * pressure rather than waiting for it: one volume, four containers whose names
 * are long, in the column that lists them. A defect invisible only because of the
 * data is the kind that ships.
 *
 * Geometry, not content (CLAUDE.md): a pill drawn across its neighbour keeps
 * every character it had — what it loses is the box it is supposed to sit in. So
 * every assertion here is a measured rectangle, at the three viewports F4 is
 * stated at, and the boxes are printed whether the run passes or fails.
 *
 * The cell is the library's, and the screen is only where it can be filled: the
 * same repair serves the images list's own pills.
 */

/** Four names, long enough that three of them cannot sit side by side in one column. */
const MOUNTING_CONTAINERS = 4;

// The panel is the innermost region carrying both its heading and its list: a
// converted list's section header sits **above** its card rather than inside it
// (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`),
// so the card can no longer be found by the title it used to hold.
function volumesPanel(page: Page): Locator {
  return page
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Volumes' }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

function volumeRow(page: Page, name: string): Locator {
  return volumesPanel(page).locator('.ui-data-table__row', { hasText: name });
}

interface PillGeometry {
  text: string;
  title: string | null;
  overflow: boolean;
  item: { left: number; right: number; top: number; bottom: number; width: number; height: number };
  badge: { left: number; right: number; top: number; bottom: number; width: number; height: number };
  /** Whether the pill's own text is currently longer than the box painting it. */
  badgeIsCut: boolean;
}

/** Every pill of the row's badge-list cell, with the wrapper it is supposed to be bounded by. */
async function measurePills(row: Locator): Promise<PillGeometry[]> {
  return row.locator('.ui-table-badge-list-cell').first().evaluate((cell) => {
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    return Array.from(cell.querySelectorAll('.ui-table-badge-list-cell__item')).map((item) => {
      const badge = item.querySelector('.ui-badge')!;
      return {
        text: (badge.textContent ?? '').trim(),
        title: item.getAttribute('title'),
        overflow: item.classList.contains('ui-table-badge-list-cell__item--overflow'),
        item: rect(item),
        badge: rect(badge),
        badgeIsCut: badge.scrollWidth > badge.clientWidth + 1,
      };
    });
  });
}

/**
 * Waits until the cell names every container the daemon says mounts this volume.
 *
 * The four fixtures are created one `docker create` at a time, and the list is served from a snapshot
 * the server holds: the row is drawn — and its first pill with it — as soon as the first of them is
 * read (`support/caught-up.ts`). Measuring there measures a column under a third of the pressure the
 * check exists to create, which is the state a run of the full suite caught: 1 mount, then 3, then 4.
 *
 * What the cell **states** is not what it draws: each pill it fits carries its name in its own
 * tooltip, and the names it could not fit are in the overflow indicator's. Every assertion below is
 * still about the boxes of what is drawn.
 */
async function waitForTheCellToNameEveryMount(row: Locator, volumeName: string): Promise<void> {
  await waitUntilTheScreenStatesWhatTheDaemonStates({
    what: `the containers mounting ${volumeName}`,
    daemon: async () => {
      const { stdout } = await execFileAsync('docker', ['ps', '--all', '--filter', `volume=${volumeName}`, '--format', '{{.Names}}']);
      return stdout
        .trim()
        .split('\n')
        .filter((line) => line !== '');
    },
    screen: async () =>
      row
        .locator('.ui-table-badge-list-cell')
        .first()
        .evaluate((cell) =>
          Array.from(cell.querySelectorAll('.ui-table-badge-list-cell__item')).flatMap((item) =>
            (item.getAttribute('title') ?? '')
              .split(', ')
              .map((name) => name.trim())
              .filter((name) => name !== ''),
          ),
        ),
  });
}

function overlapWidth(left: PillGeometry, right: PillGeometry): number {
  const horizontal = Math.min(left.badge.right, right.badge.right) - Math.max(left.badge.left, right.badge.left);
  const vertical = Math.min(left.badge.bottom, right.badge.bottom) - Math.max(left.badge.top, right.badge.top);
  return horizontal > 0.5 && vertical > 0.5 ? horizontal : 0;
}

test('a pill is bounded by its own wrapper and never painted over its neighbour, at all three viewports', async ({ page }) => {
  const stem = `vexel-e2e-pills-${Date.now()}`;
  const volumeName = `${stem}-volume`;
  const containerNames = Array.from(
    { length: MOUNTING_CONTAINERS },
    (_unused, index) => `${stem}-a-deliberately-long-consumer-name-${index}`,
  );
  try {
    await ensureImage(TINY_IMAGE);
    await execFileAsync('docker', ['volume', 'create', ...ownershipArgs(volumeName), volumeName]);
    for (const name of containerNames) {
      // Created, never started: the daemon reports a volume's mounts from every container it holds,
      // running or not, so nothing here needs a process.
      await execFileAsync('docker', ['create', '--name', name, ...ownershipArgs(name), '-v', `${volumeName}:/data`, TINY_IMAGE]);
    }

    for (const viewport of F4_VIEWPORTS) {
      const at = `@${viewport.width}×${viewport.height}`;
      await page.setViewportSize(viewport);
      await openApp(page, 'volumes-networks');
      await expect(page.getByRole('heading', { level: 1, name: 'Volumes & networks' })).toBeVisible();

      const row = volumeRow(page, volumeName).first();
      await expect(row).toBeVisible({ timeout: 20_000 });
      // The names arrive with the list's own re-read; the cell is measured once it holds them **all**,
      // the first of them being drawn while three are still missing.
      await expect(row.locator('.ui-table-badge-list-cell__item').first()).toBeVisible({ timeout: 20_000 });
      await waitForTheCellToNameEveryMount(row, volumeName);

      const pills = await measurePills(row);
      console.log(
        `[REQ-18] ${at} ${pills.length} pill(s): ${pills
          .map((pill) => `"${pill.text}" wrapper ${describeRect(pill.item)} / badge ${describeRect(pill.badge)}`)
          .join(' | ')}`,
      );

      expect(pills.length, `${at}: the cell drew no pill at all, so this check measures nothing`).toBeGreaterThan(0);

      // (1) Each pill is bounded by the wrapper that shrinks, rather than keeping its natural width
      // while the wrapper shrinks under it. That is the half the repair changed.
      for (const pill of pills) {
        expect(
          round(pill.badge.right),
          `${at}: the pill "${pill.text}" ends ${round(pill.badge.right - pill.item.right)}px past the right edge of its own wrapper (${describeRect(pill.item)})`,
        ).toBeLessThanOrEqual(round(pill.item.right) + 0.5);
        expect(round(pill.badge.left), `${at}: the pill "${pill.text}" starts left of its own wrapper`).toBeGreaterThanOrEqual(round(pill.item.left) - 0.5);
      }

      // (2) And the consequence REQ-18 states: no text rectangle overlaps another.
      const collisions = pills.flatMap((pill, index) =>
        pills.slice(index + 1).map((other) => ({ pill, other, width: overlapWidth(pill, other) })).filter((hit) => hit.width > 0),
      );
      for (const hit of collisions) console.log(`[REQ-18] ${at} "${hit.pill.text}" overlaps "${hit.other.text}" by ${round(hit.width)}px`);
      expect(collisions.length, `${at}: ${collisions.length} pair(s) of pills are painted over one another`).toBe(0);

      // (3) The count of what is hidden is never the part that gets cut.
      const overflow = pills.find((pill) => pill.overflow);
      expect(overflow, `${at}: the cell drew no overflow indicator, so ${MOUNTING_CONTAINERS} names fitted and the column was never under pressure`).toBeDefined();
      expect(overflow!.badgeIsCut, `${at}: the "${overflow!.text}" indicator is itself truncated`).toBe(false);

      // (4) A label the column had to cut is still readable: its full text stays in the wrapper's
      // own tooltip, which is what makes the truncation legitimate rather than a loss.
      for (const pill of pills.filter((candidate) => !candidate.overflow)) {
        expect(pill.title, `${at}: the pill "${pill.text}" carries no tooltip, so what it cut is unrecoverable`).toBeTruthy();
        expect(containerNames, `${at}: the pill's tooltip "${pill.title}" is not one of the mounting containers' names`).toContain(pill.title);
      }
    }
  } finally {
    for (const name of containerNames) await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
    await execFileAsync('docker', ['volume', 'rm', '-f', volumeName]).catch(() => undefined);
  }
});
