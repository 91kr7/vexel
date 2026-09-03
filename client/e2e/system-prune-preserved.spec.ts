/**
 * F17 — the System & prune screen states what it always stated
 * (`plan-ui-coherence-optimisation/REQ-73`, `REQ-74`, `REQ-75`).
 *
 * This is the batch's INT-1 check, and it is written as a **preservation** claim
 * because that is what the batch is: a screen where most of what is there is
 * already right and must not be improved.
 *
 * What is asserted, and why in this form:
 *
 * - **The eight daemon properties, label and value** (REQ-75): this is the screen
 *   that keeps them, and their words, values and order are not this screen's to
 *   revise.
 * - **Every prune row: what it says, what it occupies, whether it is enabled and
 *   whether its action is tinted** (REQ-73). A presentation change that moves an
 *   enablement is a data-loss defect wearing a cosmetic diff, so enablement is
 *   read as a fact of the control and then, separately, checked **against the
 *   rule** — a row is enabled exactly when its category holds something readable,
 *   which the empty wordings `system-screen.md` fixes make decidable from the row
 *   itself.
 * - **The standing warning** (REQ-74): one style used twice in the product, not
 *   restyled, not absorbed into a header, not replaced by an empty result.
 * - **The `Unused volumes` row's painted ink** against its size and its `Prune`
 *   button (REQ-18 observed here, which the batch owns: the truncation sweep
 *   reports the site and pins it to this batch by name, `SystemScreen.tsx:176`).
 *   Ink, not strings — an ellipsised line is laid out at its full length and only
 *   painted clipped (`support/truncating-rows.ts`).
 *
 * The daemon is the operator's own and moves under the reading, so every value is
 * read **twice**: a field that differs between the two reads is the daemon
 * changing under the check and is reported as drift rather than asserted, and the
 * live quantities are normalised out altogether (`withoutLiveQuantities`).
 *
 * The one fixture — a container left in `created`, so that "the stopped
 * containers category holds something" is this spec's own fact and not the
 * operator's — carries the ownership labels and is removed with `docker rm -fv`
 * in a `finally`. No test here confirms a prune: the prunes act on the whole host
 * and live in `e2e/system-prune-confirmed.spec.ts`.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp, ownershipArgs } from './support/fixtures.js';
import { boxOf, boxThisFrame } from './support/settled.js';
import { execFileAsync } from '../../server/test/support/docker-cli.js';
import {
  F4_VIEWPORTS,
  SYNTHETIC_64_CHAR_IDENTIFIER,
  describeRect,
  measureTruncatingRows,
  metaInkClippedByTheCard,
  metaInkSqueezed,
  round,
} from './support/truncating-rows.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

const RUN_ID = `${process.pid}-${Date.now()}`;

/** The reading viewport of the comparison tests: the widest of the three the plan is written at. */
const COMPARISON_VIEWPORT = { width: 1440, height: 1000 };

/** The eight properties this screen keeps, by the labels the delivered block used (REQ-45, REQ-75). */
const DAEMON_PROPERTIES = [
  'Docker version',
  'Engine API',
  'BuildKit',
  'Storage driver',
  'Cgroup driver',
  'OS / Arch',
  'Root directory',
  'Containers (running)',
];

/** The five categories, in the order `system-screen.md` states them. */
const CATEGORIES = ['Stopped containers', 'Dangling images', 'Unused volumes', 'Unused networks', 'Build cache'];

/**
 * What each category says when it holds nothing, verbatim from
 * `system-screen.md`. A row saying one of these holds nothing to prune, which is
 * what makes "enabled exactly when the category holds something readable"
 * decidable from the row itself rather than from a second daemon call.
 */
const EMPTY_WORDINGS = [
  'No container is stopped',
  'No untagged, unreferenced image',
  'Every volume is attached to a container',
  'Every network has an attached container',
  'No reclaimable BuildKit record',
];

interface ScreenReading {
  properties: { label: string; value: string }[];
  propertyGrids: number;
  rows: { label: string; description: string; size: string; enabled: boolean; destructive: boolean }[];
  callouts: { classes: string; text: string; insideSectionHeader: boolean; insideEmptyState: boolean }[];
  systemPrune: { enabled: boolean; destructive: boolean; insideToolbar: boolean; insideSectionHeader: boolean } | null;
}

/** Everything the screen states, read in one pass so that no two figures come from two layouts. */
async function readScreen(page: Page): Promise<ScreenReading> {
  return await page.evaluate((labels) => {
    const content = document.querySelector('.ui-frame__content')!;
    const text = (element: Element | null | undefined) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

    const bands = [...content.querySelectorAll('.ui-definition-list__row')].map((band) => ({
      label: text(band.querySelector('.ui-definition-list__label')),
      value: text(band.querySelector('.ui-definition-list__value')),
    }));

    const prune = [...content.querySelectorAll('button')].find((button) => text(button).startsWith('System prune'));

    return {
      // The eight this screen keeps, in the order the screen states them; a band
      // whose label is not one of them would show up as a structural difference.
      properties: bands.filter((band) => labels.includes(band.label)),
      propertyGrids: content.querySelectorAll('.ui-definition-list').length,
      rows: [...content.querySelectorAll('.ui-storage-usage-row')].map((row) => {
        const action = row.querySelector('button');
        return {
          label: text(row.querySelector('.ui-storage-usage-row__label')),
          description: text(row.querySelector('.ui-storage-usage-row__description')),
          size: text(row.querySelector('.ui-storage-usage-row__size')),
          enabled: action !== null && !(action as HTMLButtonElement).disabled,
          destructive: action !== null && action.className.includes('ui-button--destructive'),
        };
      }),
      callouts: [...content.querySelectorAll('.ui-callout')].map((callout) => ({
        classes: callout.className.toString(),
        text: text(callout),
        insideSectionHeader: callout.closest('.ui-section-header') !== null,
        insideEmptyState: callout.closest('.ui-empty-state') !== null,
      })),
      systemPrune: prune
        ? {
            enabled: !(prune as HTMLButtonElement).disabled,
            destructive: prune.className.includes('ui-button--destructive'),
            insideToolbar: prune.closest('.ui-screen-toolbar') !== null,
            insideSectionHeader: prune.closest('.ui-section-header') !== null,
          }
        : null,
    };
  }, DAEMON_PROPERTIES);
}

/** A size as this screen writes one — `317.7MB`, `0B` — wherever it appears in a stated value. */
const STATED_SIZE = /(?<![\w.])\d+(?:\.\d+)?\s?(?:B|KB|MB|GB|TB)(?![\w])/g;

/** A number standing on its own inside a sentence — the `N` of "N records …" — never a digit inside a word (`arm64`). */
const STATED_COUNT = /(?<![\w.])\d+(?:[.,]\d+)*(?![\w.])/g;

/** Sizes and in-sentence counts are the daemon's to move under a check; what is compared is the wording around them. */
function withoutLiveQuantities(value: string): string {
  // An em dash is the whole of a size that could not be read: the same live
  // quantity in its empty form, and the only value this screen states as one.
  if (value === '—') return '<size>';
  const withoutSizes = value.replace(STATED_SIZE, '<size>');
  // A count is normalised only **inside a sentence**. A value that is nothing but a
  // number is a version, not a quantity, so those stay compared character for character.
  return /\p{L}/u.test(value) ? withoutSizes.replace(STATED_COUNT, '<n>') : withoutSizes;
}

/** The reading as flat `what it states` → `what it says` pairs, normalised once, so a difference names itself. */
function stated(reading: ScreenReading): Map<string, string> {
  const out = new Map<string, string>();
  const say = (key: string, value: string) => out.set(key, withoutLiveQuantities(value));
  for (const property of reading.properties) say(`property "${property.label}"`, property.value);
  for (const row of reading.rows) {
    say(`row "${row.label}" line`, row.description);
    say(`row "${row.label}" size`, row.size);
    say(`row "${row.label}" Prune`, row.enabled ? 'enabled' : 'disabled');
    say(`row "${row.label}" tint`, row.destructive ? 'destructive' : 'plain');
  }
  reading.callouts.forEach((callout, index) => say(`callout ${index}`, callout.text));
  return out;
}

async function openSystemScreen(page: Page, viewport = COMPARISON_VIEWPORT): Promise<void> {
  await page.setViewportSize(viewport);
  // The last active screen survives by design (REQ-115): pin it rather than inherit it.
  await openApp(page, 'system-prune');
  await expect(page.getByRole('heading', { level: 1, name: 'System & prune' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.ui-storage-usage-row').first(), 'the reclaim listing drew no row at all').toBeVisible({ timeout: 30_000 });
}

/** A container in the `created` state — what a prune of stopped containers acts on — that never runs. */
async function createStoppedContainer(caseName: string): Promise<string> {
  const name = `vexel-e2e-system-preserved-${caseName}-${RUN_ID}`;
  await execFileAsync('docker', ['create', '--name', name, ...ownershipArgs(caseName), '--entrypoint', 'sleep', 'alpine:3.20', '300']);
  return name;
}

async function removeContainerQuietly(name: string): Promise<void> {
  await execFileAsync('docker', ['rm', '-fv', name]).catch(() => undefined);
}

/** Records every prune request a page issues, so a test can prove none was. */
function watchPruneRequests(page: Page): string[] {
  const issued: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/system/prune')) issued.push(`${request.method()} ${request.url()}`);
  });
  return issued;
}

/**
 * Whether a control answers a hit test at its own visible centre: a trailing
 * action cleared of ink is not repaired if something has been drawn over it.
 */
async function hitTestAtVisibleCentre(control: Locator): Promise<{ reached: boolean; box: string; hit: string }> {
  await control.scrollIntoViewIfNeeded();
  return control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      reached: hit !== null && (hit === element || element.contains(hit) || hit.contains(element)),
      box: `x=${Math.round(box.left)}, y=${Math.round(box.top)}, ${Math.round(box.width)}×${Math.round(box.height)}`,
      hit: hit === null ? 'nothing' : `${hit.tagName.toLowerCase()}.${hit.className.toString().split(' ').join('.')}`,
    };
  });
}

test.describe('F17 — the screen states the facts it is there to state', () => {
  // plan-ui-coherence-optimisation/REQ-73, REQ-74, REQ-75 — the eight daemon properties, the five
  // prune rows and the standing warning, each stated once and in its own words.
  test('the screen states the eight properties, the five prune rows and the standing warning', async ({ page }) => {
    test.setTimeout(300_000);
    const container = await createStoppedContainer('compared');

    try {
      await openSystemScreen(page);
      const firstReading = await readScreen(page);
      await openSystemScreen(page);
      const secondReading = await readScreen(page);

      console.log(`[REQ-75] properties ${JSON.stringify(firstReading.properties)}`);
      console.log(`[REQ-73] rows ${JSON.stringify(firstReading.rows)}`);
      console.log(`[REQ-74] callout(s) ${JSON.stringify(firstReading.callouts)}`);

      expect(firstReading.properties.map((property) => property.label), 'the eight daemon properties are not stated here (REQ-75)').toEqual(
        DAEMON_PROPERTIES,
      );
      expect(firstReading.propertyGrids, 'the daemon properties are not presented in one property grid (REQ-75)').toBe(1);

      expect(firstReading.rows.map((row) => row.label), 'the prune rows are not the five the screen prunes (REQ-73)').toEqual(CATEGORIES);
      for (const row of firstReading.rows) {
        expect(row.destructive, `the ${row.label} row's action lost its destructive tint (REQ-73)`).toBe(true);
        expect(row.description, `the ${row.label} row says nothing about what it holds (REQ-73)`).not.toBe('');
        expect(row.size, `the ${row.label} row states no size (REQ-73)`).toMatch(/^(—|\d+(\.\d+)?(B|KB|MB|GB|TB))$/);
      }

      expect(firstReading.callouts, 'the standing warning is no longer stated as one callout (REQ-74)').toHaveLength(1);
      expect(firstReading.callouts[0]!.text, 'the standing warning no longer names the tools sharing the daemon (REQ-74)').toMatch(
        /other tools sharing this daemon are affected/i,
      );
      expect(firstReading.callouts[0]!.classes, 'the standing warning is no longer drawn as a warning-toned callout (REQ-74)').toMatch(
        /warning/,
      );
      expect(firstReading.callouts[0]!.insideSectionHeader, 'the standing warning has been absorbed into a section header (REQ-74)').toBe(false);
      expect(firstReading.callouts[0]!.insideEmptyState, 'the standing warning has been replaced by an empty result (REQ-74)').toBe(false);

      const drift = [...stated(firstReading)].filter(([key, value]) => stated(secondReading).get(key) !== value);
      for (const [key, value] of drift) console.log(`[REQ-73] daemon drift: ${key} read "${value}" then "${stated(secondReading).get(key)}"`);
      expect(
        [...stated(firstReading).keys()].filter((key) => !stated(secondReading).has(key)),
        'the screen stopped stating one of its own facts between two reads',
      ).toEqual([]);
    } finally {
      await removeContainerQuietly(container);
    }
  });

  // REQ-73 — "each prunes exactly the category it names, is enabled exactly when that category holds
  // something readable". The rule, checked against the row itself.
  test('every prune row is enabled exactly when its category holds something readable', async ({ page }) => {
    test.setTimeout(180_000);
    const container = await createStoppedContainer('enablement');

    try {
      await openSystemScreen(page);
      const reading = await readScreen(page);
      console.log(`[REQ-73] enablement: ${JSON.stringify(reading.rows.map((row) => `${row.label} — "${row.description}" ${row.size} ${row.enabled ? 'enabled' : 'disabled'}`))}`);

      for (const row of reading.rows) {
        const unreadable = row.size === '—';
        const empty = EMPTY_WORDINGS.includes(row.description);
        expect(
          row.enabled,
          `the ${row.label} row says "${row.description}" at ${row.size} and its Prune is ${row.enabled ? 'enabled' : 'disabled'} (REQ-73)`,
        ).toBe(!unreadable && !empty);
      }

      // This spec's own container makes one category non-empty, so the rule above is exercised on
      // both sides rather than on whatever the operator's daemon happens to hold.
      const stopped = reading.rows.find((row) => row.label === 'Stopped containers')!;
      expect(stopped.description, 'the container this spec left in `created` is not counted among the stopped containers').toMatch(
        /\d+ containers? not running/,
      );
      expect(stopped.enabled, 'the stopped-containers row holds something readable and its Prune is disabled (REQ-73)').toBe(true);
      expect(reading.systemPrune?.enabled, 'something is prunable and the system prune is disabled (REQ-73)').toBe(true);
    } finally {
      await removeContainerQuietly(container);
    }
  });

  // REQ-18 observed here, and the site the truncation sweep pins on this batch by name: the
  // `Unused volumes` line against its size and its `Prune` button, as the daemon fills it and again
  // carrying a 64-character identifier (REQ-19).
  test('no prune row’s text inks over its size or its Prune button, at all three viewports', async ({ page }) => {
    test.setTimeout(600_000);
    {
      for (const viewport of F4_VIEWPORTS) {
        const at = `@${viewport.width}×${viewport.height}`;
        await openSystemScreen(page, viewport);

        for (const [name, target] of [['now', page]] as const) {
          const rows = (await measureTruncatingRows(target)).filter((row) => row.kind === 'storage');
          const stressed = (await measureTruncatingRows(target, undefined, { inject: SYNTHETIC_64_CHAR_IDENTIFIER })).filter(
            (row) => row.kind === 'storage',
          );
          expect(rows.length, `${at} ${name}: no storage row was measured`).toBeGreaterThan(0);

          for (const [reading, measured] of [
            ['as drawn', rows],
            ['64-character identifier', stressed],
          ] as const) {
            for (const row of measured) {
              const overlap = row.overlaps.reduce((total, hit) => total + hit.area, 0);
              const clippedByTheCard = metaInkClippedByTheCard(row);
              const squeezed = metaInkSqueezed(row);
              console.log(
                `[REQ-18] ${at} ${name} (${reading}) row "${row.label.slice(0, 28)}": row ${describeRect(row.rowBox)}, ` +
                  `trailing ${row.metaBoxes.map(describeRect).join(' | ')} — ${round(overlap)}px² of the line's ink over the trailing group, ` +
                  `${round(squeezed)}px of trailing ink squeezed inside the row, ${round(clippedByTheCard)}px clipped away by the card`,
              );

              {
                expect(
                  row.overlaps.map((hit) => `${round(hit.area)}px² over trailing element ${hit.meta}`),
                  `${at}: the "${row.label.slice(0, 28)}" line's painted ink lands on its size or its Prune button (REQ-18)`,
                ).toEqual([]);
                expect(
                  round(squeezed),
                  `${at}: the "${row.label.slice(0, 28)}" row's size or Prune button is squeezed out of its natural width (REQ-19)`,
                ).toBeLessThanOrEqual(1);
                expect(
                  round(clippedByTheCard),
                  `${at}: ${round(clippedByTheCard)}px of the "${row.label.slice(0, 28)}" row's size or Prune button is clipped away by the card holding it (REQ-18)`,
                ).toBeLessThanOrEqual(1);
              }
            }
          }
        }

        // The trailing control, hit-tested at its own visible centre in every row: a value cleared
        // of ink by something drawn over it is not a repair.
        const pruneButtons = page.locator('.ui-storage-usage-row').getByRole('button', { name: 'Prune', exact: true });
        const count = await pruneButtons.count();
        expect(count, `${at}: the reclaim listing offers no Prune action to check`).toBeGreaterThan(0);
        for (let index = 0; index < count; index += 1) {
          const outcome = await hitTestAtVisibleCentre(pruneButtons.nth(index));
          console.log(`[REQ-18] ${at} Prune ${index}: box ${outcome.box}, centre reaches ${outcome.hit}`);
          expect(
            outcome.reached,
            `${at}: the Prune button of row ${index} is at ${outcome.box} and its own centre reaches ${outcome.hit} instead — it is covered, not repaired (REQ-18)`,
          ).toBe(true);
        }
      }
    }
  });
});

// REQ-73 — the system prune's own scope, confirmation and enablement, and the control that carries
// them, which has moved. A moved control is checked the way CLAUDE.md requires:
// a **real pointer at its visible coordinates**, and the surface's **viewport box** before and after,
// since a surface dragged out of the viewport keeps every child and every character it had.
test('the system prune opens its confirmation from the toolbar, at every viewport, moving nothing', async ({ page }) => {
  test.setTimeout(300_000);
  const container = await createStoppedContainer('toolbar');
  const pruneRequests = watchPruneRequests(page);

  try {
    for (const viewport of F4_VIEWPORTS) {
      const at = `@${viewport.width}×${viewport.height}`;
      await openSystemScreen(page, viewport);

      const reclaimCard = page.locator('.ui-surface', { has: page.getByRole('heading', { level: 2, name: 'Reclaim disk space' }) });
      const action = reclaimCard.getByRole('button', { name: 'System prune…' });
      await expect(action, `${at}: the screen offers no system prune`).toBeEnabled({ timeout: 30_000 });

      // system-screen.md — "in the action bar under the panel's header", red.
      const placement = await action.evaluate((element) => ({
        insideToolbar: element.closest('.ui-screen-toolbar') !== null,
        insideSectionHeader: element.closest('.ui-section-header') !== null,
        destructive: element.className.includes('ui-button--destructive'),
        headerBottom: element.closest('.ui-surface')!.querySelector('.ui-section-header')!.getBoundingClientRect().bottom,
        top: element.getBoundingClientRect().top,
      }));
      console.log(`[REQ-73] ${at} system prune: ${JSON.stringify(placement)}`);
      expect(placement.insideToolbar, `${at}: the system prune is not a control of the action bar (system-screen.md)`).toBe(true);
      expect(placement.insideSectionHeader, `${at}: the system prune is still inside the section header (system-screen.md)`).toBe(false);
      expect(placement.destructive, `${at}: the system prune is no longer marked as destructive (REQ-73)`).toBe(true);
      expect(placement.top, `${at}: the action bar is not under the panel's header`).toBeGreaterThanOrEqual(placement.headerBottom - 1);

      // **Single-frame on purpose.** This pair and the one after the click are a *displacement*
      // measurement — the defect it exists for drags a surface out of the viewport (CLAUDE.md,
      // "A check that measures content cannot detect a defect that moves position") — so neither
      // half is settled: a settled reading answers a different question.
      const cardBefore = await boxThisFrame(reclaimCard, `${at}: the reclaim card before the click`);
      const actionBox = await boxThisFrame(action, `${at}: the prune action before the click`);
      // A real pointer at the visible control's own coordinates: a programmatic activation moves no
      // focus and hit-tests nothing, and focus is exactly what carried a dialog off screen once.
      await page.mouse.click(actionBox.x + actionBox.width / 2, actionBox.y + actionBox.height / 2);

      const dialog = page.locator('.ui-modal').filter({ has: page.getByRole('heading', { name: /^Confirm:/ }) });
      await expect(dialog, `${at}: a real click on the system prune opened no confirmation`).toBeVisible({ timeout: 20_000 });
      await expect(dialog, `${at}: the scope confirmation does not state that the daemon is shared (REQ-97)`).toContainText(/daemon is shared/i);
      for (const title of CATEGORIES) {
        await expect(dialog.getByRole('checkbox', { name: title }), `${at}: the scope offers no ${title} checkbox`).toHaveCount(1);
      }

      const dialogBox = await boxOf(dialog, `${at}: the prune confirmation`);
      console.log(
        `[REQ-73] ${at} confirmation at x=${Math.round(dialogBox.x)}, y=${Math.round(dialogBox.y)}, ` +
          `${Math.round(dialogBox.width)}×${Math.round(dialogBox.height)}`,
      );
      expect(dialogBox.y, `${at}: the confirmation is drawn above the top of the viewport`).toBeGreaterThanOrEqual(-1);
      expect(dialogBox.x, `${at}: the confirmation is drawn left of the viewport`).toBeGreaterThanOrEqual(-1);
      expect(dialogBox.y, `${at}: the confirmation is drawn below the bottom of the viewport`).toBeLessThan(viewport.height);

      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();

      // The surface the control belongs to is where it was, and the control is still inside the
      // viewport: a box, not a character count.
      const cardAfter = await boxThisFrame(reclaimCard, `${at}: the reclaim card after the click`);
      const actionAfter = await boxThisFrame(action, `${at}: the prune action after the click`);
      expect(
        `${round(cardAfter.x)},${round(cardAfter.y)},${round(cardAfter.width)}`,
        `${at}: the reclaim panel moved when its own action was operated`,
      ).toBe(`${round(cardBefore.x)},${round(cardBefore.y)},${round(cardBefore.width)}`);
      expect(actionAfter.y, `${at}: the system prune was carried above the top of the viewport`).toBeGreaterThanOrEqual(0);
      expect(actionAfter.y, `${at}: the system prune was carried below the bottom of the viewport`).toBeLessThan(viewport.height);
    }

    // REQ-6 — cancelling performs nothing on the daemon.
    expect(pruneRequests, 'a cancelled scope confirmation issued a prune').toEqual([]);
  } finally {
    await removeContainerQuietly(container);
  }
});
