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
 * - no surface, anywhere, changes `x`, and none changes width **but the empty
 *   state's own box** — asserted whatever the daemon reported, since nothing the
 *   daemon says moves a surface sideways. The exception is the hairline again,
 *   on the other axis: where an empty state's box is content-sized rather than
 *   stretched (at 375×812, two of Compose's), a border on all four sides is 2px
 *   of width exactly as it is 2px of height. It is bounded to that component's
 *   own box and to those 2px, and it was measured on the batch-5 build
 *   (`VEXEL_DELIVERED_REF=56b0c90`: 318 surfaces, **0 moved**), which is what
 *   places it with the hairline and not with a later batch;
 * - a surface grows in height by **the hairlines of the empty states it holds**,
 *   and by one where it merely shares a stretched row with a card that holds
 *   one; never by more, and never at all on a screen that draws none;
 * - a surface sits lower by **the hairlines of the empty states drawn above
 *   it**, and by nothing else;
 * - an empty state's own height grows by exactly that hairline;
 * - and Raw console, which draws no empty state at all, is identical to the
 *   pixel.
 *
 * **One screen is now deliberately different, and it is restated rather than
 * switched off.** `plan-ui-coherence-optimisation/REQ-31` … `REQ-35` migrated
 * volumes and networks onto the object list and the detail panel, and the pair
 * of half-width cards went with it: the two lists are stacked at the content
 * column's full width so that the detail either reveals is full width too. For
 * that screen the negative claim above is false by construction, so what is
 * asserted instead is **the change this batch declares**, measured against the
 * same delivered build — the pair on one side, one stacked full-width column on
 * the other. Every other screen stays under the rule unchanged; the screen is
 * excluded from nothing but the assertion it can no longer satisfy.
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

/**
 * The screen whose shape this plan deliberately changes, and what it changed to.
 *
 * A screen listed here is not compared surface by surface against the delivered
 * build — the comparison would be a statement that a migration did not happen —
 * but it is not left unmeasured either: the batch's own declared geometry is
 * asserted on both builds instead, below.
 */
const DELIBERATELY_CHANGED: Record<string, string> = {
  'volumes-networks':
    'plan-ui-coherence-optimisation/REQ-31…REQ-35 — the pair of half-width cards became one stacked full-width column, so a revealed detail is full width',
  registries:
    'plan-ui-coherence-optimisation/REQ-36…REQ-38 — the two lists became the object list, and the fixed 1 : 1.2 template that never collapsed became the library’s pair arrangement: equal panels at desktop widths, one column at the phone breakpoint',
  'builders-cache':
    'plan-ui-coherence-optimisation/REQ-39…REQ-41 — the builder list and the build-cache list became the object list, the hand-built cards deleted, and each card’s page-level action moved from its header into the screen toolbar under it',
  contexts:
    'plan-ui-coherence-optimisation/REQ-42…REQ-45 — the context list became the object list, `use` became a primary action of the row’s cluster beside the `active` marker, and the second eight-property daemon card left the screen; with it went the `Grid` that had been halving the list, one child not being a pair',
};

/** The eight properties REQ-45 takes off the contexts screen, by the labels the delivered block used. */
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

/**
 * The contexts screen, as the change REQ-42…REQ-45 declares can be measured on
 * both builds: what the list is made of, how many cards the screen draws, and
 * whether the eight daemon properties are stated on it.
 */
async function measureContextsScreen(page: Page): Promise<{
  columnWidth: number;
  cards: { title: string; x: number; y: number; width: number }[];
  cardLists: number;
  objectLists: number;
  toolbars: number;
  daemonProperties: string[];
}> {
  return await page.evaluate((daemonLabels) => {
    const content = document.querySelector('.ui-frame__content')! as HTMLElement;
    const contentStyle = getComputedStyle(content);
    const columnWidth = content.clientWidth - Number.parseFloat(contentStyle.paddingLeft) - Number.parseFloat(contentStyle.paddingRight);
    // The element both builds draw for a card's title.
    const cards = [...content.querySelectorAll('.ui-section-header__title')]
      .map((node) => ({ title: (node.textContent ?? '').trim(), card: node.closest('.ui-surface') }))
      .filter((entry): entry is { title: string; card: Element } => entry.card !== null)
      .map(({ title, card }) => {
        const rect = card.getBoundingClientRect();
        return { title, x: rect.x, y: rect.y, width: rect.width };
      });
    const text = (content.textContent ?? '').replace(/\s+/g, ' ');
    return {
      columnWidth,
      cards,
      cardLists: content.querySelectorAll('.ui-card-list').length,
      objectLists: content.querySelectorAll('.ui-data-table').length,
      toolbars: content.querySelectorAll('.ui-screen-toolbar').length,
      daemonProperties: daemonLabels.filter((label) => text.includes(label)),
    };
  }, DAEMON_PROPERTIES);
}

/** The builders screen, as the change REQ-39…REQ-41 declares can be measured on both builds. */
async function measureBuildersScreen(page: Page): Promise<{
  columnWidth: number;
  cards: { title: string; x: number; y: number; width: number }[];
  cardLists: number;
  objectLists: number;
  toolbars: number;
}> {
  return await page.evaluate(() => {
    const content = document.querySelector('.ui-frame__content')! as HTMLElement;
    const contentStyle = getComputedStyle(content);
    const columnWidth = content.clientWidth - Number.parseFloat(contentStyle.paddingLeft) - Number.parseFloat(contentStyle.paddingRight);
    // The element both builds draw for a card's title.
    const cards = [...document.querySelectorAll('.ui-section-header__title')]
      .map((node) => ({ title: (node.textContent ?? '').trim(), card: node.closest('.ui-surface') }))
      .filter((entry): entry is { title: string; card: Element } => entry.card !== null)
      .map(({ title, card }) => {
        const rect = card.getBoundingClientRect();
        return { title, x: rect.x, y: rect.y, width: rect.width };
      });
    return {
      columnWidth,
      cards,
      cardLists: content.querySelectorAll('.ui-card-list').length,
      objectLists: content.querySelectorAll('.ui-data-table').length,
      toolbars: content.querySelectorAll('.ui-screen-toolbar').length,
    };
  });
}

/** The two cards of the registries screen, by the section header each carries. */
async function measureRegistryPanels(page: Page): Promise<{
  columnWidth: number;
  registries: { x: number; y: number; width: number } | null;
  repositories: { x: number; y: number; width: number } | null;
}> {
  return await page.evaluate(() => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width };
    };
    const content = document.querySelector('.ui-frame__content')! as HTMLElement;
    const contentStyle = getComputedStyle(content);
    const columnWidth = content.clientWidth - Number.parseFloat(contentStyle.paddingLeft) - Number.parseFloat(contentStyle.paddingRight);
    // The element both builds draw for a card's title.
    const titles = [...document.querySelectorAll('.ui-section-header__title')];
    const cardOf = (matches: (text: string) => boolean) =>
      titles.find((node) => matches((node.textContent ?? '').trim()))?.closest('.ui-surface') ?? null;
    const registries = cardOf((text) => text === 'Registries & credentials');
    const repositories = cardOf((text) => text.startsWith('Repositories'));
    return {
      columnWidth,
      registries: registries ? box(registries) : null,
      repositories: repositories ? box(repositories) : null,
    };
  });
}

/** The two lists of the volumes & networks screen, by the section header each card carries. */
async function measureStackedLists(page: Page): Promise<{
  content: { x: number; width: number; columnWidth: number };
  volumes: { x: number; y: number; width: number } | null;
  networks: { x: number; y: number; width: number } | null;
}> {
  return await page.evaluate(() => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width };
    };
    const content = document.querySelector('.ui-frame__content')! as HTMLElement;
    // The element both builds draw for a card's title: the delivered build and
    // this one both put the panel's name in a section header.
    const titles = [...document.querySelectorAll('.ui-section-header__title')];
    const cardOf = (title: string) =>
      titles.find((node) => node.textContent?.trim() === title)?.closest('.ui-surface') ?? null;
    const volumes = cardOf('Volumes');
    const networks = cardOf('Networks');
    const contentBox = content.getBoundingClientRect();
    // The content **column**, not the region: the shell's own padding is not
    // width a screen has to lay anything out in.
    const contentStyle = getComputedStyle(content);
    const columnWidth =
      content.clientWidth - Number.parseFloat(contentStyle.paddingLeft) - Number.parseFloat(contentStyle.paddingRight);
    return {
      content: { x: contentBox.x, width: contentBox.width, columnWidth },
      volumes: volumes ? box(volumes) : null,
      networks: networks ? box(networks) : null,
    };
  });
}

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

          // The one screen this plan has deliberately redrawn: its own declared geometry is
          // asserted here instead of the negative claim, and the surface-by-surface comparison is
          // skipped **for this screen only**, with the reason stated.
          // The registries screen, whose declared change is the panel pair rather than the stack:
          // the fixed template it handed `Grid` divided every width in 1 : 1.2 and collapsed at
          // none, which at 375×812 left a 143px panel; the pair arrangement makes the two equal at
          // desktop widths and stacks them below the breakpoint.
          if (screen.id === 'registries') {
            const deliveredPanels = await measureRegistryPanels(before);
            const currentPanels = await measureRegistryPanels(page);
            console.log(
              `[REQ-36] ${at} ${screen.heading}: delivered registries x=${round(deliveredPanels.registries?.x ?? Number.NaN)} w=${round(
                deliveredPanels.registries?.width ?? Number.NaN,
              )}, repositories x=${round(deliveredPanels.repositories?.x ?? Number.NaN)} w=${round(deliveredPanels.repositories?.width ?? Number.NaN)} — ` +
                `now registries x=${round(currentPanels.registries?.x ?? Number.NaN)} w=${round(currentPanels.registries?.width ?? Number.NaN)}, ` +
                `repositories x=${round(currentPanels.repositories?.x ?? Number.NaN)} w=${round(currentPanels.repositories?.width ?? Number.NaN)}, ` +
                `content column ${round(currentPanels.columnWidth)}px — ${DELIBERATELY_CHANGED[screen.id]}`,
            );

            for (const [name, panels] of [
              ['the delivered build', deliveredPanels],
              ['this build', currentPanels],
            ] as const) {
              expect(panels.registries, `${at}: ${name} draws no registries card`).not.toBeNull();
              expect(panels.repositories, `${at}: ${name} draws no repositories card`).not.toBeNull();
            }

            // The premise: the delivered build really did divide the width unequally, and really
            // did keep the two side by side at every viewport.
            expect(
              round(deliveredPanels.registries!.width),
              `${at}: the delivered build already gave the two panels one width, so this comparison shows nothing`,
            ).not.toBe(round(deliveredPanels.repositories!.width));
            expect(
              round(deliveredPanels.repositories!.x),
              `${at}: the delivered build already stacked the two panels, so this comparison shows nothing`,
            ).not.toBe(round(deliveredPanels.registries!.x));

            if (viewport.width >= 1280) {
              expect(round(currentPanels.repositories!.y), `${at}: the two panels are no longer on one row`).toBe(round(currentPanels.registries!.y));
              expect(
                Math.abs(currentPanels.repositories!.width - currentPanels.registries!.width),
                `${at}: the pair still divides the column unequally`,
              ).toBeLessThanOrEqual(1);
              expect(
                currentPanels.registries!.width,
                `${at}: the registries panel is no wider than the one the fixed template gave it`,
              ).toBeGreaterThan(deliveredPanels.registries!.width);
            } else {
              expect(round(currentPanels.repositories!.x), `${at}: the panels are still side by side`).toBe(round(currentPanels.registries!.x));
              expect(round(currentPanels.repositories!.width), `${at}: the stacked panels do not share one width`).toBe(
                round(currentPanels.registries!.width),
              );
              expect(currentPanels.repositories!.y, `${at}: the repositories panel is not below the registries one`).toBeGreaterThan(
                currentPanels.registries!.y,
              );
              expect(
                round(currentPanels.registries!.width),
                `${at}: the registries panel is ${round(currentPanels.registries!.width)}px of a ${round(currentPanels.columnWidth)}px content column`,
              ).toBeGreaterThanOrEqual(round(currentPanels.columnWidth) - 1);
            }

            // The change is inside the screen: the shell's content region is where it was.
            expect(round(currentPanels.columnWidth), `${at}: the shell's content column changed width`).toBe(round(deliveredPanels.columnWidth));
            continue;
          }

          // The builders screen, whose declared change is what the two lists are made of rather
          // than where the cards sit: the hand-built card lists are deleted for the object list,
          // and each card's page-level action leaves its header for the toolbar under it. The
          // cards themselves are where they were, at the content column's width, which is what is
          // asserted on both builds.
          if (screen.id === 'builders-cache') {
            const deliveredScreen = await measureBuildersScreen(before);
            const currentScreen = await measureBuildersScreen(page);
            console.log(
              `[REQ-39] ${at} ${screen.heading}: delivered ${deliveredScreen.cardLists} card list(s), ${deliveredScreen.objectLists} object list(s), ` +
                `${deliveredScreen.toolbars} toolbar(s) — now ${currentScreen.cardLists} / ${currentScreen.objectLists} / ${currentScreen.toolbars}; ` +
                `cards ${currentScreen.cards.map((card) => `${card.title} x=${round(card.x)} w=${round(card.width)}`).join(', ')} — ${
                  DELIBERATELY_CHANGED[screen.id]
                }`,
            );

            // The premise: the delivered build really did draw the hand-built list this batch
            // deletes, and no object list at all.
            expect(deliveredScreen.cardLists, `${at}: the delivered build drew no card list here, so this comparison shows nothing`).toBeGreaterThan(0);
            expect(deliveredScreen.objectLists, `${at}: the delivered build already listed these on the object list`).toBe(0);

            expect(currentScreen.cardLists, `${at}: a hand-built card list is still drawn on this screen`).toBe(0);
            expect(currentScreen.objectLists, `${at}: the two lists are not both on the object list`).toBe(2);
            expect(currentScreen.toolbars, `${at}: each card does not carry a screen toolbar of its own`).toBe(2);

            // The cards are where they were: same left edge, same width, at the content column.
            expect(currentScreen.cards.length, `${at}: this build draws a different number of cards`).toBe(deliveredScreen.cards.length);
            currentScreen.cards.forEach((card, index) => {
              const deliveredCard = deliveredScreen.cards[index];
              expect(card.title, `${at}: the cards are drawn in a different order`).toBe(deliveredCard.title);
              expect(round(card.x), `${at}: the ${card.title} card moved sideways`).toBe(round(deliveredCard.x));
              expect(round(card.width), `${at}: the ${card.title} card changed width`).toBe(round(deliveredCard.width));
              expect(
                round(card.width),
                `${at}: the ${card.title} card is ${round(card.width)}px of a ${round(currentScreen.columnWidth)}px content column`,
              ).toBeGreaterThanOrEqual(round(currentScreen.columnWidth) - 1);
            });

            // The change is inside the screen: the shell's content column is where it was.
            expect(round(currentScreen.columnWidth), `${at}: the shell's content column changed width`).toBe(round(deliveredScreen.columnWidth));
            continue;
          }

          // The contexts screen, whose declared change is the list, the switch and a card that is
          // gone: the eight-property daemon block described the daemon rather than the context
          // (REQ-45), and the `Grid` that had been dividing the content column went with it —
          // "one child is not a pair" — so the list is read at the column's full width and the
          // detail it reveals is full width too.
          if (screen.id === 'contexts') {
            const deliveredScreen = await measureContextsScreen(before);
            const currentScreen = await measureContextsScreen(page);
            console.log(
              `[REQ-42] ${at} ${screen.heading}: delivered ${deliveredScreen.cardLists} card list(s), ${deliveredScreen.objectLists} object list(s), ` +
                `${deliveredScreen.toolbars} toolbar(s), ${deliveredScreen.daemonProperties.length}/8 daemon properties, ` +
                `cards ${deliveredScreen.cards.map((card) => `${card.title} x=${round(card.x)} w=${round(card.width)}`).join(', ')} — ` +
                `now ${currentScreen.cardLists} / ${currentScreen.objectLists} / ${currentScreen.toolbars}, ` +
                `${currentScreen.daemonProperties.length}/8 daemon properties, ` +
                `cards ${currentScreen.cards.map((card) => `${card.title} x=${round(card.x)} w=${round(card.width)}`).join(', ')} — ${
                  DELIBERATELY_CHANGED[screen.id]
                }`,
            );

            // The premise: the delivered build really did draw the hand-built list this batch
            // deletes, no object list at all, and the daemon block beside the list.
            expect(deliveredScreen.cardLists, `${at}: the delivered build drew no card list here, so this comparison shows nothing`).toBeGreaterThan(0);
            expect(deliveredScreen.objectLists, `${at}: the delivered build already listed the contexts on the object list`).toBe(0);
            expect(
              deliveredScreen.daemonProperties.length,
              `${at}: the delivered build stated ${deliveredScreen.daemonProperties.length} of the eight daemon properties, so REQ-45 has nothing to remove here`,
            ).toBe(8);
            expect(deliveredScreen.cards.length, `${at}: the delivered build drew one card, so the pair REQ-45 breaks up was not there`).toBe(2);

            expect(currentScreen.cardLists, `${at}: a hand-built card list is still drawn on this screen`).toBe(0);
            expect(currentScreen.objectLists, `${at}: the contexts are not on the object list`).toBe(1);
            expect(currentScreen.toolbars, `${at}: the card does not carry a screen toolbar of its own`).toBe(1);
            expect(
              currentScreen.daemonProperties,
              `${at}: the screen still states daemon properties of the active context (REQ-45)`,
            ).toEqual([]);
            expect(currentScreen.cards.map((card) => card.title), `${at}: a second card is still drawn beside the list`).toEqual(['Docker contexts']);

            // The one card left is read at the content column's full width, which the half of a
            // pair could not give the detail panel it now reveals (REQ-23).
            const card = currentScreen.cards[0]!;
            expect(
              round(card.width),
              `${at}: the card is ${round(card.width)}px of a ${round(currentScreen.columnWidth)}px content column`,
            ).toBeGreaterThanOrEqual(round(currentScreen.columnWidth) - 1);
            expect(
              card.width,
              `${at}: the migrated list is no wider than the card of the pair it replaces`,
            ).toBeGreaterThan(deliveredScreen.cards[0]!.width);

            // The change is inside the screen: the shell's content column is where it was.
            expect(round(currentScreen.columnWidth), `${at}: the shell's content column changed width`).toBe(round(deliveredScreen.columnWidth));
            continue;
          }

          if (DELIBERATELY_CHANGED[screen.id] !== undefined) {
            const deliveredLists = await measureStackedLists(before);
            const currentLists = await measureStackedLists(page);
            console.log(
              `[REQ-31] ${at} ${screen.heading}: delivered Volumes x=${round(deliveredLists.volumes?.x ?? Number.NaN)} w=${round(
                deliveredLists.volumes?.width ?? Number.NaN,
              )}, Networks x=${round(deliveredLists.networks?.x ?? Number.NaN)} w=${round(deliveredLists.networks?.width ?? Number.NaN)} — ` +
                `now Volumes x=${round(currentLists.volumes?.x ?? Number.NaN)} w=${round(currentLists.volumes?.width ?? Number.NaN)}, ` +
                `Networks x=${round(currentLists.networks?.x ?? Number.NaN)} w=${round(currentLists.networks?.width ?? Number.NaN)}, ` +
                `content column ${round(currentLists.content.columnWidth)}px — ${DELIBERATELY_CHANGED[screen.id]}`,
            );

            expect(deliveredLists.volumes, `${at}: the delivered build draws no Volumes card`).not.toBeNull();
            expect(deliveredLists.networks, `${at}: the delivered build draws no Networks card`).not.toBeNull();
            expect(currentLists.volumes, `${at}: this build draws no Volumes card`).not.toBeNull();
            expect(currentLists.networks, `${at}: this build draws no Networks card`).not.toBeNull();

            // The premise, so that what follows is a change and not a coincidence: the delivered
            // build really did lay the two lists side by side.
            expect(
              round(deliveredLists.networks!.x),
              `${at}: the delivered build already stacked the two lists, so this comparison shows nothing`,
            ).not.toBe(round(deliveredLists.volumes!.x));

            // …and this one stacks them, at the content column's full width, the second under the
            // first (volumes-networks-screen.md).
            expect(round(currentLists.networks!.x), `${at}: the two lists are not on one left edge`).toBe(round(currentLists.volumes!.x));
            expect(round(currentLists.networks!.width), `${at}: the two lists do not share one width`).toBe(round(currentLists.volumes!.width));
            expect(currentLists.networks!.y, `${at}: the Networks card is not below the Volumes card`).toBeGreaterThan(currentLists.volumes!.y);
            expect(
              round(currentLists.volumes!.width),
              `${at}: a list card is ${round(currentLists.volumes!.width)}px of a ${round(currentLists.content.columnWidth)}px content column`,
            ).toBeGreaterThanOrEqual(round(currentLists.content.columnWidth) - 1);
            expect(
              currentLists.volumes!.width,
              `${at}: the migrated list is no wider than the half-width card it replaces`,
            ).toBeGreaterThan(deliveredLists.volumes!.width);

            // The change is inside the screen: the shell's content region is where it was.
            expect(round(currentLists.content.x), `${at}: the shell's content region moved`).toBe(round(deliveredLists.content.x));
            expect(round(currentLists.content.width), `${at}: the shell's content region changed width`).toBe(round(deliveredLists.content.width));
            continue;
          }
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
            // moves a surface sideways. `x` is absolute; width is absolute everywhere except on the
            // empty state's own box, which is entitled to its hairline on this axis too (see the
            // header) — bounded to 2px, and to that component.
            if (after.x !== deliveredSurface.x) record('x', after.x - deliveredSurface.x);
            const widthDelta = after.width - deliveredSurface.width;
            const widthAllowance = after.isEmptyState ? 2 : 0;
            if (widthDelta < 0 || widthDelta > widthAllowance) record('width', widthDelta);

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
        for (const delta of emptyStateDeltas.filter((state) => !state.compact)) {
          expect(
            delta.widthDelta,
            `${at} ${delta.screen} ${delta.key}: the empty state's surface costs width beyond the hairline's 2px`,
          ).toBeGreaterThanOrEqual(0);
          expect(
            delta.widthDelta,
            `${at} ${delta.screen} ${delta.key}: the empty state's surface costs width beyond the hairline's 2px`,
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
