/**
 * F5 — the foundation batch's own acceptance: the thirteen screens are where
 * they were (`plan-ui-coherence-optimisation/REQ-30`, and REQ-25's one measured
 * consequence).
 *
 * This batch changes no feature and adds no screen. Its whole claim is
 * therefore a **negative** one, and a negative claim about a user interface can
 * only be checked one way: against the build that came before it. So the
 * predecessor is checked out, built and served on a port of its own
 * (`support/delivered-build.ts`), and every principal surface of every screen
 * is measured on both, minutes apart, against the same daemon.
 *
 * **Content assertions cannot do this job.** A surface moved 2px, moved 400px,
 * or dragged off the viewport entirely keeps every child and every character it
 * had; what it loses is its coordinates (CLAUDE.md, "What a check drives, and
 * what it measures"). Every assertion below is on a viewport box.
 *
 * The one delta the batch declares is `EmptyState`'s surface (REQ-25): the
 * hairline it gained costs **no width** and **2px of height**, at all 49 sites
 * at once because it is one component. So the arithmetic is stated rather than
 * hoped:
 *
 * - no surface, anywhere, changes width or `x` — asserted whatever the daemon
 *   reported, since nothing the daemon says moves a surface sideways;
 * - a surface grows in height by **the hairlines of the empty states it holds**,
 *   and by one where it merely shares a stretched row with a card that holds
 *   one; never by more, and never at all on a screen that draws none;
 * - a surface sits lower by **the hairlines of the empty states drawn above
 *   it**, and by nothing else;
 * - an empty state's own height grows by exactly that hairline;
 * - and Raw console, which draws no empty state at all, is identical to the
 *   pixel.
 *
 * Two things are read but not asserted, each for a stated reason: the live
 * daemon feed (below), and any surface whose **text** differs between the two
 * reads — the daemon is the operator's own and moves under both builds.
 *
 * Nothing here creates a fixture on the daemon: the screens are read as the
 * operator's own daemon fills them, and both builds read the same one. The
 * worktree, the build, the data directory and the process the comparison needs
 * are removed in an `afterAll`.
 */
import { expect, test, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import { startDeliveredBuild, type DeliveredBuild } from './support/delivered-build.js';

interface Viewport {
  width: number;
  height: number;
}

/** The three viewports the plan is written against. */
const VIEWPORTS: Viewport[] = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
];

/** The thirteen screens of the shell, by the id the preference holds and the heading each draws. */
const SCREENS: { id: string; heading: string }[] = [
  { id: 'dashboard', heading: 'Dashboard' },
  { id: 'containers', heading: 'Containers' },
  { id: 'compose', heading: 'Compose' },
  { id: 'swarm', heading: 'Swarm' },
  { id: 'images-layers', heading: 'Images & layers' },
  { id: 'volumes-networks', heading: 'Volumes & networks' },
  { id: 'registries', heading: 'Registries' },
  { id: 'builders-cache', heading: 'Builders & cache' },
  { id: 'contexts', heading: 'Contexts' },
  { id: 'plugins', heading: 'Plugins' },
  { id: 'system-prune', heading: 'System & prune' },
  { id: 'raw-console', heading: 'Raw console' },
  { id: 'coverage-matrix', heading: 'About' },
];

/**
 * The principal surfaces — the shell's regions, the panels, the lists and the
 * placeholders — rather than every node the page draws. A row or a cell moving
 * inside a card that did not move is the daemon's data changing between two
 * reads, not this batch.
 *
 * `.ui-section-header` is deliberately **absent**: a card's title is now that
 * component (REQ-26), so the delivered build draws fewer of them by design. The
 * element the two builds share is `.ui-card__title`, whose box is exactly what
 * must not have moved, and it is measured.
 */
const SURFACES = [
  '.ui-frame__main',
  '.ui-frame__header',
  '.ui-frame__content',
  '.ui-frame__footer',
  '.ui-frame__rail',
  '.ui-nav-rail',
  '.ui-page-header',
  '.ui-screen-toolbar',
  '.ui-surface',
  '.ui-card__title',
  '.ui-dashboard-layout',
  '.ui-quad-panel-layout',
  '.ui-split-pane',
  '.ui-band-stack',
  '.ui-data-table',
  '.ui-data-table__header',
  '.ui-card-list',
  '.ui-grouped-rows-panel',
  '.ui-detail-panel',
  '.ui-definition-list',
  '.ui-tabs',
  '.ui-metric-tile',
  '.ui-state-summary-bar',
  '.ui-console-surface',
  '.ui-log-stream',
  '.ui-empty-state',
];

interface Surface {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** How many empty states the surface is or holds: each of them is entitled to the hairline's 2px. */
  emptyStatesHeld: number;
  /** How many are drawn before it, so a shift down of that many hairlines is theirs and not this batch's. */
  emptyStatesBefore: number;
  /** The surface is an empty state itself. */
  isEmptyState: boolean;
  /** ... in its compact presentation, the one site that also gains a horizontal inset. */
  compact: boolean;
  /** The live daemon feed is drawn before it, so its height — the harness's, not the build's — moved it. */
  afterLiveFeed: boolean;
  /** Where it is drawn, as a child-index path: a prefix of another path is an ancestor of it. */
  path: string;
  /** Its index in document order, and the index of the last measured surface inside it. */
  order: number;
  endOrder: number;
  /**
   * What the surface says, whitespace collapsed.
   *
   * The two builds read the operator's own daemon a few seconds apart, and some
   * of what they read moves on its own: a relative timestamp turning "9 minutes"
   * into "10 minutes" wraps a line and makes a card 21px taller. A surface whose
   * **content** differs between the two reads is not two builds disagreeing
   * about layout, so its geometry is not comparable and is reported as drift
   * rather than asserted. This batch changes no copy anywhere — every
   * feature-layer edit in it adds an explicit `null` where a prop was absent —
   * so text equality is a safe gate to put in front of the geometry.
   */
  text: string;
}

/**
 * Everything inside the **daemon event feed** is left unmeasured, and the
 * surfaces holding it are excluded from the height comparison.
 *
 * Not a convenience: the feed shows the events its **server process** has seen
 * since it connected to the daemon, and the two builds are necessarily served
 * by two processes started minutes apart — the suite's own web server saw the
 * run's registry being prepared, the delivered build's did not. Diagnosed by
 * swapping the order in which the two are read: the difference followed the
 * server and not the reading order, and the feed's own empty state ("No daemon
 * events yet.") was what the delivered build drew in its place. Comparing it
 * measures the harness.
 */
const LIVE_FEED = '.ui-event-stream';

async function measure(page: Page): Promise<Surface[]> {
  return await page.evaluate(
    ({ selectors, liveFeed }) => {
      const counters = new Map<string, number>();
      const measured = [...document.querySelectorAll(selectors.join(','))].filter(
        (element) => element.closest(liveFeed) === null,
      );
      const emptyStates = measured.filter((element) => element.matches('.ui-empty-state'));
      const liveFeeds = [...document.querySelectorAll(liveFeed)];
      /** The element's position in the tree, so a surface is identified by where it is drawn. */
      const pathOf = (element: Element): string => {
        const parts: number[] = [];
        let node: Element | null = element;
        while (node !== null && node !== document.body && node.parentElement !== null) {
          parts.unshift([...node.parentElement.children].indexOf(node));
          node = node.parentElement;
        }
        return parts.join('/');
      };

      return measured.map((element, order) => {
        const selector = selectors.find((candidate) => element.matches(candidate)) ?? 'unknown';
        const index = counters.get(selector) ?? 0;
        counters.set(selector, index + 1);
        const box = element.getBoundingClientRect();
        let endOrder = order;
        // The measured list is in document order, so an element's subtree is the run that follows it.
        while (endOrder + 1 < measured.length && element.contains(measured[endOrder + 1])) endOrder += 1;
        return {
          // Keyed by where it is drawn, not by how many like it came before: a surface the other
          // build draws in the same slot is the same surface, and a path makes ancestry a prefix.
          key: `${pathOf(element)} ${selector}#${index}`,
          path: pathOf(element),
          order,
          endOrder,
          text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
          x: box.x,
          y: box.y,
          width: box.width,
          height: element.querySelector(liveFeed) === null ? box.height : Number.NaN,
          emptyStatesHeld: element.matches('.ui-empty-state')
            ? 1
            : element.querySelectorAll('.ui-empty-state').length,
          emptyStatesBefore: emptyStates.filter(
            (state) =>
              !state.contains(element) &&
              (state.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
          ).length,
          isEmptyState: element.matches('.ui-empty-state'),
          compact: element.matches('.ui-empty-state--compact'),
          afterLiveFeed: liveFeeds.some(
            (feed) =>
              !feed.contains(element) &&
              (feed.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
          ),
        };
      });
    },
    { selectors: SURFACES, liveFeed: LIVE_FEED },
  );
}

/**
 * The screen's surfaces once they have stopped moving.
 *
 * A screen's content arrives with a daemon read behind it, so a measurement
 * taken the instant the heading appears would compare this runner's timing
 * rather than the two builds.
 */
async function settled(page: Page, budget = 20_000): Promise<Surface[]> {
  const deadline = Date.now() + budget;
  let previous = JSON.stringify(await measure(page));
  while (Date.now() < deadline) {
    await page.waitForTimeout(400);
    const current = await measure(page);
    const serialised = JSON.stringify(current);
    if (serialised === previous) return current;
    previous = serialised;
  }
  return await measure(page);
}

async function openScreen(page: Page, screen: { id: string; heading: string }): Promise<Surface[]> {
  await openApp(page, screen.id);
  await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible({ timeout: 20_000 });
  return await settled(page);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function describeBox(surface: Surface): string {
  return `x=${round(surface.x)}, y=${round(surface.y)}, ${round(surface.width)}×${round(surface.height)}`;
}

interface Difference {
  screen: string;
  key: string;
  axis: 'x' | 'y' | 'width' | 'height';
  delta: number;
  before: Surface;
  after: Surface;
}

function report(difference: Difference): string {
  return `${difference.screen} ${difference.key}: ${difference.axis} ${difference.delta > 0 ? '+' : ''}${round(
    difference.delta,
  )}px — delivered (${describeBox(difference.before)}), now (${describeBox(difference.after)})`;
}

test.describe('F5 — the thirteen screens render as the delivered build does', () => {
  let delivered: DeliveredBuild;

  test.beforeAll(async () => {
    delivered = await startDeliveredBuild();
  });

  test.afterAll(async () => {
    await delivered?.stop();
  });

  for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}×${viewport.height}`;

    // REQ-30 — "With the primitives added and exported and nothing yet consuming them, all thirteen
    // screens render exactly as before at all three viewports", and REQ-25's single measured
    // consequence: the empty state's own surface.
    test(`no screen moved at ${at}, but for the empty state's own hairline`, async ({ browser, page }) => {
      test.setTimeout(600_000);
      const deliveredContext = await browser.newContext({ baseURL: delivered.origin, viewport });
      const before = await deliveredContext.newPage();

      try {
        await page.setViewportSize(viewport);

        const movements: Difference[] = [];
        const structural: string[] = [];
        const emptyStateDeltas: { screen: string; key: string; delta: number; widthDelta: number; compact: boolean }[] = [];
        let surfacesCompared = 0;
        let drifted = 0;

        for (const screen of SCREENS) {
          // Measured one screen at a time on both builds, so the daemon they read is as nearly the
          // same as it can be made.
          const deliveredSurfaces = await openScreen(before, screen);
          const currentSurfaces = await openScreen(page, screen);
          const deliveredByKey = new Map(deliveredSurfaces.map((surface) => [surface.key, surface]));
          const currentByKey = new Map(currentSurfaces.map((surface) => [surface.key, surface]));

          // The hairline is the whole of the batch's declared geometry, so what a surface is
          // allowed is stated in hairlines: none at all where no empty state is drawn.
          const screenDrawsEmptyState = currentSurfaces.some((surface) => surface.isEmptyState);

          // Where the two reads of the daemon disagree about *content*, they are not two builds
          // disagreeing about layout. The earliest such surface to end is where the screen below it
          // stops being comparable in y.
          const driftingSurfaces = [...currentByKey]
            .filter(([key, after]) => deliveredByKey.get(key)?.text !== after.text)
            .map(([, after]) => after);
          const comparableUntil =
            driftingSurfaces.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...driftingSurfaces.map((s) => s.endOrder));
          drifted += driftingSurfaces.length;

          // A surface only one build draws is a structural difference — unless it sits inside one
          // whose content the daemon changed under it, which is what the daemon event feed is: one
          // build draws the stream, the other the placeholder that stands in for it.
          const withinDrift = (path: string) =>
            driftingSurfaces.some((surface) => path.startsWith(`${surface.path}/`));
          for (const [key, surface] of deliveredByKey) {
            if (!currentByKey.has(key) && !withinDrift(surface.path)) {
              structural.push(`${screen.heading}: ${key} is no longer drawn`);
            }
          }
          for (const [key, surface] of currentByKey) {
            if (!deliveredByKey.has(key) && !withinDrift(surface.path)) {
              structural.push(`${screen.heading}: ${key} was not drawn before`);
            }
          }

          for (const [key, after] of currentByKey) {
            const deliveredSurface = deliveredByKey.get(key);
            if (deliveredSurface === undefined) continue;
            surfacesCompared += 1;

            const record = (axis: Difference['axis'], delta: number) => {
              movements.push({ screen: screen.heading, key, axis, delta, before: deliveredSurface, after });
            };

            // The horizontal axis is compared whatever the content says: nothing the daemon reports
            // moves a surface sideways, and "width unchanged everywhere" is this batch's own claim.
            if (after.x !== deliveredSurface.x) record('x', after.x - deliveredSurface.x);
            if (after.width !== deliveredSurface.width) record('width', after.width - deliveredSurface.width);

            const sameContent = after.text === deliveredSurface.text;

            // A surface holding empty states may grow by their hairlines; one merely sharing a
            // stretched row with another that does may follow it by a single hairline.
            const heightAllowance = 2 * Math.max(after.emptyStatesHeld, screenDrawsEmptyState ? 1 : 0);
            const heightDelta = after.height - deliveredSurface.height;
            if (sameContent && !Number.isNaN(heightDelta) && (heightDelta < 0 || heightDelta > heightAllowance)) {
              record('height', heightDelta);
            }

            // And it may sit lower by the hairlines of the empty states drawn above it, no more.
            const yDelta = after.y - deliveredSurface.y;
            const comparableY = !after.afterLiveFeed && after.order <= comparableUntil;
            if (comparableY && (yDelta < 0 || yDelta > 2 * after.emptyStatesBefore)) {
              record('y', yDelta);
            }

            if (after.isEmptyState) {
              emptyStateDeltas.push({
                screen: screen.heading,
                key,
                delta: after.height - deliveredSurface.height,
                widthDelta: after.width - deliveredSurface.width,
                compact: after.compact,
              });
            }
          }

          // REQ-30 amended — Raw console has no empty state at all, so it is pixel-identical.
          if (screen.id === 'raw-console') {
            expect(
              currentSurfaces.filter((surface) => surface.isEmptyState),
              'Raw console draws an empty state, which the batch states it does not',
            ).toEqual([]);
            expect(
              currentSurfaces.map((surface) => `${surface.key} ${describeBox(surface)}`),
              'Raw console is not identical to the delivered build',
            ).toEqual(deliveredSurfaces.map((surface) => `${surface.key} ${describeBox(surface)}`));
          }
        }

        console.log(
          `[REQ-30] ${at}: ${surfacesCompared} principal surfaces compared over ${SCREENS.length} screens against ${delivered.revision.slice(0, 7)} — ` +
            `${movements.length} moved, ${structural.length} structural difference(s), ${emptyStateDeltas.length} empty state(s) on screen, ` +
            `${drifted} surface(s) whose content the daemon changed between the two reads`,
        );
        for (const delta of emptyStateDeltas) {
          console.log(
            `[REQ-25] ${at} ${delta.screen} ${delta.key}${delta.compact ? ' (compact)' : ''}: height ${
              delta.delta >= 0 ? '+' : ''
            }${round(delta.delta)}px, width ${delta.widthDelta === 0 ? 'unchanged' : `${delta.widthDelta > 0 ? '+' : ''}${round(delta.widthDelta)}px`}`,
          );
        }
        for (const movement of movements) console.log(`[REQ-30] moved: ${report(movement)}`);
        for (const line of structural) console.log(`[REQ-30] structural: ${line}`);

        expect(structural, `${at}: a screen gained or lost a principal surface`).toEqual([]);
        expect(movements.map(report), `${at}: a surface moved that this batch states does not move`).toEqual([]);

        // REQ-25 / empty-state.md — the surface costs the hairline and nothing else in the
        // full-height presentation; the compact site additionally gains its horizontal inset.
        for (const delta of emptyStateDeltas.filter((state) => !state.compact)) {
          expect(
            delta.delta,
            `${at} ${delta.screen} ${delta.key}: the empty state's surface costs more than the hairline's 2px`,
          ).toBeGreaterThanOrEqual(0);
          expect(
            delta.delta,
            `${at} ${delta.screen} ${delta.key}: the empty state's surface costs more than the hairline's 2px`,
          ).toBeLessThanOrEqual(2);
        }
        for (const delta of emptyStateDeltas.filter((state) => state.compact)) {
          expect(
            delta.delta,
            `${at} ${delta.screen} ${delta.key}: the compact empty state's inset costs a different height than the +10px stated`,
          ).toBeGreaterThanOrEqual(10);
        }
      } finally {
        await deliveredContext.close();
      }
    });
  }
});
