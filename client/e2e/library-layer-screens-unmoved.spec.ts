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
  // Retired by batch 12 (`plan-ui-coherence-optimisation/REQ-55`): the swarm screen was its last
  // call site, so it is matched on the delivered build alone now, and kept here so that the
  // comparison keeps naming what that build drew.
  '.ui-quad-panel-layout',
  '.ui-split-pane',
  '.ui-band-stack',
  '.ui-data-table',
  '.ui-data-table__header',
  // Deleted by batch 13 (`plan-ui-coherence-optimisation/REQ-82`), its last three call sites being
  // inside a modal rather than on any of the thirteen screens: like the two below, it is matched on
  // the delivered build alone now, and kept here so that the comparison keeps naming what that
  // build drew.
  '.ui-card-list',
  // Retired by batch 11 (`plan-ui-coherence-optimisation/REQ-49`): it is matched on the delivered
  // build alone now, and kept here so that the comparison keeps naming what that build drew.
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
 *
 * It was written for the About screen's own card and now applies to the
 * **Dashboard alone**: `plan-ui-coherence-optimisation/REQ-71` leaves the stream
 * presented in one place, which is why the About entry below asserts that no
 * such surface is drawn on that screen at all.
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
  plugins:
    'plan-ui-coherence-optimisation/REQ-46…REQ-48 — the two hand-built plugin lists became the object list, the `Grid` that laid them side by side at every width was deleted rather than collapsed, the install action moved from a card header into the screen toolbar, and both empty results became the empty-state primitive',
  compose:
    'plan-ui-coherence-optimisation/REQ-49…REQ-51 — the projects left `GroupedRowsPanel`, the product’s third answer to “how is an object listed”, for the object list, and the component was deleted with them; the fixed `2fr 1fr` template that never collapsed was deleted rather than collapsed, its two regions having become views of the selected project’s own panel; and `No compose projects`, a bare title, became the empty-state primitive with a line and the action that resolves it',
  'images-layers':
    'plan-ui-coherence-optimisation/REQ-57, REQ-59 — the images list stopped printing one string twice per row: the `TAGS` pill column that repeated `REPOSITORY:TAG` on every row is gone, and `SIZE` — the word that carried two different numbers in one product — is now `DISK USAGE` (`images/specs/images-screen.md`). One column fewer, and a two-word label in its track, is the **shape** of those two requirements being met. This screen is therefore **not skipped**: it is compared surface by surface like the eight unchanged ones, with exactly one declared exemption — the images list’s own header row may be **narrower** where the table is wider than its card and is sized by its columns rather than by the card (375×812). It may not grow, it may not move sideways, and no other surface of the screen is exempt, so a further unintended move on it still fails. What the row *says* is checked in `images-one-fact-once.spec.ts`',
  'system-prune':
    'plan-ui-coherence-optimisation/REQ-73…REQ-75 — the fixed 1 : 1.2 template that never collapsed became the library’s pair arrangement: equal panels above the breakpoint, one column below, and `align-items: start`, so the two cards no longer share a height; the system prune left the section header for the screen toolbar under it, which puts the reclaim card’s rows one row lower; and the two empty results gained their explanation and their way out. What the batch states does **not** change is everything the screen says: the eight daemon properties, the five prune rows and the standing warning, which are compared word for word against this same delivered build in `system-prune-preserved.spec.ts`',
  'coverage-matrix':
    'plan-ui-coherence-optimisation/REQ-70…REQ-72 — the screen titled every section one way (REQ-70), and lost the `Daemon event stream` card that repeated the Dashboard’s stream verbatim (REQ-71). Two deltas, and nothing else is declared: **one card fewer**, and **each remaining card’s own header** costing whatever the one treatment costs it. So no card may move sideways or change width, no card may be added or lost besides that one, each card’s body must be the height it was, and each card must sit exactly where the removed card and the header deltas above it put it — which leaves a further unintended move failing. What the screen still **says** is `plan-ui-coherence-optimisation/REQ-72`’s, compared word for word against this same delivered build in `about-one-treatment.spec.ts`',
  swarm:
    'plan-ui-coherence-optimisation/REQ-52…REQ-55 — the condition of the swarm is stated **once**, on one surface, with `Initialise a swarm` and `Join an existing one` inside it, where the delivered build stated it in a banner and again in each of five lists; the state bar is not drawn where there is no state to qualify, the panels are not drawn where there is no cluster to read, and `QuadPanelLayout` is deleted with the two-by-two grid, the five inventories stacked at the content column’s full width',
};

/**
 * **What counts as a statement of the condition** — the definition the 12→1
 * figure is only meaningful against, kept identical to `swarm-row-geometry.spec.ts`'s.
 *
 * A statement is a leaf element whose own text asserts, in words, that there is
 * no cluster to read. A container is not counted for what its children say; a
 * line saying what to *do* about the condition is an instruction and not a
 * repetition of it; and a **state name is not an assertion**, so the delivered
 * bar's `Swarm inactive` title is not counted. That is why this file reports
 * **11** where `swarm-screen.md` records 12 — the spec counts the bar's title,
 * this definition does not. The two agree that the answer after is **1**.
 */
const SWARM_CONDITION = /not part of a swarm|not a manager|only a manager|no cluster to read/i;

/**
 * The swarm screen, as the change REQ-52…REQ-55 declares can be measured on both
 * builds: **how many elements say the same thing**, on how many surfaces, and
 * what else the screen draws while saying it.
 *
 * This is the one place in the plan where a count of painted text *is* the
 * requirement, so it is counted here rather than replaced by a box: a surface
 * that still says "this daemon is not part of a swarm" five times has every
 * rectangle it had. The boxes are measured beside it, not instead of it — the
 * statement's own, and the lowest edge the screen reaches, which is what five
 * repetitions cost in length.
 */
async function measureSwarmScreen(page: Page): Promise<{
  columnWidth: number;
  saying: string[];
  surfaces: number;
  emptyStates: number;
  stateBars: number;
  cards: string[];
  cardLists: number;
  objectLists: number;
  quadPanelLayouts: number;
  statement: { x: number; y: number; width: number; height: number } | null;
  actions: { label: string; y: number; insideTheStatement: boolean }[];
  /** Where each card's content actually starts, which is what REQ-54's 25.4px offset is about. */
  cardContentTops: { card: string; y: number }[];
  screenBottom: number;
}> {
  return await page.evaluate((pattern) => {
    const test = new RegExp(pattern, 'i');
    const content = document.querySelector('.ui-frame__content')! as HTMLElement;
    const contentStyle = getComputedStyle(content);
    const columnWidth =
      content.clientWidth - Number.parseFloat(contentStyle.paddingLeft) - Number.parseFloat(contentStyle.paddingRight);
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };

    const leaves = [...content.querySelectorAll<HTMLElement>('*')].filter(
      (element) => element.children.length === 0 && test.test((element.textContent ?? '').trim()),
    );
    const surfaces = new Set(
      leaves
        .map((element) => element.closest('.ui-empty-state, .ui-state-summary-bar, .ui-surface'))
        .filter((surface): surface is Element => surface !== null),
    );

    // The statement of the condition: the empty state on this build, and — on the delivered one,
    // which drew several — the first of them, so the two figures name the same kind of thing.
    const statement = content.querySelector('.ui-empty-state');
    const resolving = [...content.querySelectorAll<HTMLElement>('button')].filter((button) =>
      /^(Initialise|Join)\b/.test((button.textContent ?? '').trim()),
    );

    const screenBottom = [...content.querySelectorAll<HTMLElement>('*')].reduce((lowest, element) => {
      const rect = element.getBoundingClientRect();
      return rect.height > 0 ? Math.max(lowest, rect.bottom) : lowest;
    }, content.getBoundingClientRect().top);

    return {
      columnWidth,
      saying: leaves.map((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 70)),
      surfaces: surfaces.size,
      emptyStates: content.querySelectorAll('.ui-empty-state').length,
      stateBars: content.querySelectorAll('.ui-state-summary-bar').length,
      cards: [...content.querySelectorAll('.ui-section-header__title')].map((node) => (node.textContent ?? '').trim()),
      cardLists: content.querySelectorAll('.ui-card-list').length,
      objectLists: content.querySelectorAll('.ui-data-table').length,
      quadPanelLayouts: content.querySelectorAll('.ui-quad-panel-layout').length,
      statement: statement ? box(statement) : null,
      actions: resolving.map((button) => ({
        label: (button.textContent ?? '').trim(),
        y: button.getBoundingClientRect().y,
        insideTheStatement: statement !== null && statement.contains(button),
      })),
      // Each card's own empty state, by the card that holds it: REQ-54's offset is the difference
      // between two of them, `Secrets`' against `Configs & stacks`'.
      cardContentTops: [...content.querySelectorAll('.ui-empty-state')]
        .map((state) => ({ state, card: state.closest('.ui-surface:has(.ui-section-header__title)') }))
        .filter((entry): entry is { state: Element; card: Element } => entry.card !== null)
        .map(({ state, card }) => ({
          card: (card.querySelector('.ui-section-header__title')?.textContent ?? '').trim(),
          y: state.getBoundingClientRect().y,
        })),
      screenBottom,
    };
  }, SWARM_CONDITION.source);
}

/** The section the About screen drew that `plan-ui-coherence-optimisation/REQ-71` takes off it. */
const REMOVED_ABOUT_SECTION = 'Daemon event stream';

/**
 * The About screen, as the change REQ-70…REQ-72 declares can be measured on both
 * builds.
 *
 * A **treatment** is what the browser resolves rather than what the source says
 * — the font, its size, its weight, its letter-spacing, the case it is drawn in
 * and its colour — so nothing here reads a class name to decide how many there
 * are. What each card costs its neighbours is measured beside it: the space
 * between the card's own top edge and the top of its content is what a title's
 * treatment is worth in pixels, and the rest of the card's height is content
 * this batch does not touch.
 */
async function measureAboutScreen(page: Page): Promise<{
  columnWidth: number;
  cards: {
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    headerCost: number;
    bodyHeight: number;
    text: string;
  }[];
  cardTitles: number;
  eyebrows: number;
  eventStreams: number;
  treatments: string[];
}> {
  return await page.evaluate(() => {
    const content = document.querySelector('.ui-frame__content')! as HTMLElement;
    const contentStyle = getComputedStyle(content);
    const columnWidth = content.clientWidth - Number.parseFloat(contentStyle.paddingLeft) - Number.parseFloat(contentStyle.paddingRight);
    const candidates = [...content.querySelectorAll('.ui-section-header__title, .ui-card__title')];
    // A build whose card title *wraps* the header primitive matches both selectors
    // on one title; the outer element is a box, the inner one carries the type.
    const titles = candidates.filter((element) => !candidates.some((other) => other !== element && element.contains(other)));
    const ownText = (element: Element) =>
      [...element.childNodes]
        .filter((node) => !(node instanceof Element && node.matches('.ui-section-header__sublabel')))
        .map((node) => node.textContent ?? '')
        .join('')
        .replace(/\s+/g, ' ')
        .trim();

    return {
      columnWidth,
      cardTitles: content.querySelectorAll('.ui-card__title').length,
      eyebrows: content.querySelectorAll('.ui-section-header--eyebrow').length,
      eventStreams: content.querySelectorAll('.ui-event-stream').length,
      treatments: titles.map((title) => {
        const style = getComputedStyle(title);
        const own = ownText(title);
        const rendered = style.textTransform === 'uppercase' ? own.toUpperCase() : own;
        return [
          style.fontFamily,
          style.fontSize,
          style.fontWeight,
          style.letterSpacing,
          style.textTransform,
          style.color,
          /[a-z]/.test(rendered) ? 'mixed case' : 'upper case',
        ].join(' | ');
      }),
      cards: titles
        .map((title) => {
          const card = title.closest('.ui-surface');
          if (card === null) return null;
          const header = title.closest('.ui-section-header') ?? title;
          let node: Element | null = header;
          let bodyTop: number | null = null;
          while (node !== null && node !== card) {
            if (node.nextElementSibling !== null) {
              bodyTop = node.nextElementSibling.getBoundingClientRect().top;
              break;
            }
            node = node.parentElement;
          }
          const rect = card.getBoundingClientRect();
          return {
            title: ownText(title),
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            headerCost: bodyTop === null ? Number.NaN : bodyTop - rect.top,
            bodyHeight: bodyTop === null ? Number.NaN : rect.bottom - bodyTop,
            text: (card.textContent ?? '').replace(/\s+/g, ' ').trim(),
          };
        })
        .filter((card): card is NonNullable<typeof card> => card !== null),
    };
  });
}

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

/**
 * The images list, as the change REQ-57 and REQ-59 declare can be measured on
 * both builds: **which columns it has** and what that costs the header row's box.
 *
 * `images/specs/images-screen.md` fixes the column set — a leading status dot,
 * `REPOSITORY:TAG` (every tag the image carries, stated once), `DIGEST`,
 * `PLATFORM`, `DISK USAGE`, `CREATED` and `ACTIONS` — and states both changes in
 * so many words: "the pills are gone and the reference column carries the whole
 * tag list", and "`DISK USAGE`, not `SIZE`".
 *
 * The geometry follows from that and from nothing else. Where the table fits its
 * card, the columns share the card's width and removing one moves no box at all —
 * which is what the two desktop viewports measure. Where the table is **wider
 * than its card** and is therefore sized by its own columns, one column fewer is
 * one column narrower, and a two-word label in a narrow track is a header row of
 * two lines instead of one.
 */
async function measureImagesList(page: Page): Promise<{
  headers: string[];
  header: { x: number; y: number; width: number; height: number } | null;
  card: { x: number; width: number } | null;
  rows: number;
}> {
  return await page.evaluate(() => {
    const content = document.querySelector('.ui-frame__content')! as HTMLElement;
    const table = content.querySelector('.ui-data-table');
    const header = table?.querySelector('.ui-data-table__header') ?? null;
    const card = table?.closest('.ui-surface') ?? null;
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return {
      headers: [...(header?.querySelectorAll('.ui-data-table__header-cell') ?? [])].map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim()),
      header: header ? box(header) : null,
      card: card ? { x: card.getBoundingClientRect().x, width: card.getBoundingClientRect().width } : null,
      rows: table?.querySelectorAll('.ui-data-table__row').length ?? 0,
    };
  });
}

/**
 * The one surface of the images screen whose **width** REQ-57 and REQ-59 entitle
 * to change, and in the one direction they entitle it to.
 *
 * Kept as narrow as the requirements are: this screen's own list header, only
 * ever smaller. A header that grew, a header that moved sideways, and every
 * other surface of the screen are compared exactly as the eight unchanged
 * screens' are — which is what stops this entry from turning the images screen
 * into an unmeasured one.
 */
function widthDeclaredBy(screenId: string, key: string, delta: number): boolean {
  return screenId === 'images-layers' && key.endsWith('.ui-data-table__header#0') && delta < 0;
}

/**
 * The system & prune screen, as the change REQ-73…REQ-75 declares can be
 * measured on both builds.
 *
 * Three deltas, and each of them is a box:
 *
 * - the **pair**: the delivered build divided every width 1 : 1.2 and collapsed
 *   at none; the arrangement gives two equal panels above its own breakpoint and
 *   one full-width column below it;
 * - the **toolbar**: the system prune left the section header for the action bar
 *   under it, so the reclaim card's rows start one row lower — 30.84px lower at
 *   both desktop widths, the 36.84px bar less the 6px the header gives back for
 *   the control it no longer carries. **Where the delivered header wrapped, the
 *   offsets are not comparable** and are reported instead: at the phone
 *   breakpoint that card was 171.81px wide and its header 136.09px tall, starting
 *   the rows 169.09px down a card this build starts them 115.88px down. Comparing
 *   the two there would read the collapse as an action bar that costs nothing;
 * - `align-items: start`: the two cards no longer stretch to a shared height,
 *   which is measured as the **slack** each card carries below its own content —
 *   a stretched card has more of it than its neighbour, an unstretched pair has
 *   the same padding under both.
 *
 * What the batch preserves is read here too, but only as a count: the words are
 * compared against this same delivered build in `system-prune-preserved.spec.ts`.
 */
async function measureSystemScreen(page: Page): Promise<{
  columnWidth: number;
  cards: { title: string; x: number; y: number; width: number; height: number; slack: number }[];
  toolbars: number;
  systemPrune: { insideToolbar: boolean; insideSectionHeader: boolean } | null;
  /** How far under its card's own top edge the first prune row starts: what a toolbar row costs. */
  rowsStartUnderTheCard: number | null;
  /** The reclaim card's own header height, which decides whether that offset is comparable at all. */
  reclaimHeaderHeight: number | null;
  /** The action bar between the header and the rows, `null` on a build that draws none. */
  toolbar: { y: number; height: number; underTheHeader: boolean; aboveTheRows: boolean } | null;
  daemonProperties: string[];
  storageRows: number;
  callouts: number;
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
        const last = card.lastElementChild?.getBoundingClientRect();
        return {
          title,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          // The empty space the card carries under its own content: a card
          // stretched to its neighbour's height carries more of it than padding.
          slack: last ? rect.bottom - last.bottom : Number.NaN,
        };
      });
    const prune = [...content.querySelectorAll('button')].find((button) => (button.textContent ?? '').trim().startsWith('System prune'));
    const firstRow = content.querySelector('.ui-storage-usage-row');
    const reclaimCard = firstRow?.closest('.ui-surface') ?? null;
    const reclaimHeader = reclaimCard?.querySelector('.ui-section-header') ?? null;
    const reclaimToolbar = reclaimCard?.querySelector('.ui-screen-toolbar') ?? null;
    const text = (content.textContent ?? '').replace(/\s+/g, ' ');
    return {
      columnWidth,
      cards,
      toolbars: content.querySelectorAll('.ui-screen-toolbar').length,
      systemPrune: prune
        ? {
            insideToolbar: prune.closest('.ui-screen-toolbar') !== null,
            insideSectionHeader: prune.closest('.ui-section-header') !== null,
          }
        : null,
      rowsStartUnderTheCard:
        firstRow && reclaimCard ? firstRow.getBoundingClientRect().y - reclaimCard.getBoundingClientRect().y : null,
      reclaimHeaderHeight: reclaimHeader ? reclaimHeader.getBoundingClientRect().height : null,
      toolbar:
        reclaimToolbar && reclaimHeader && firstRow
          ? {
              y: reclaimToolbar.getBoundingClientRect().y,
              height: reclaimToolbar.getBoundingClientRect().height,
              underTheHeader: reclaimToolbar.getBoundingClientRect().top >= reclaimHeader.getBoundingClientRect().bottom - 1,
              aboveTheRows: reclaimToolbar.getBoundingClientRect().bottom <= firstRow.getBoundingClientRect().top + 1,
            }
          : null,
      daemonProperties: daemonLabels.filter((label) => text.includes(label)),
      storageRows: content.querySelectorAll('.ui-storage-usage-row').length,
      callouts: content.querySelectorAll('.ui-callout').length,
    };
  }, DAEMON_PROPERTIES);
}

/**
 * The plugins screen, as the change REQ-46…REQ-48 declares can be measured on
 * both builds: what the two lists are made of, where the cards sit, how many
 * toolbars the screen draws, and how many empty results are stated on the
 * primitive rather than as bare text.
 */
async function measurePluginsScreen(page: Page): Promise<{
  columnWidth: number;
  cards: { title: string; x: number; y: number; width: number }[];
  cardLists: number;
  objectLists: number;
  toolbars: number;
  emptyStates: { card: string; title: string; description: string | null; controls: number; x: number; width: number }[];
}> {
  return await page.evaluate(() => {
    const content = document.querySelector('.ui-frame__content')! as HTMLElement;
    const contentStyle = getComputedStyle(content);
    const columnWidth = content.clientWidth - Number.parseFloat(contentStyle.paddingLeft) - Number.parseFloat(contentStyle.paddingRight);
    // The element both builds draw for a card's title.
    const titleOf = (element: Element) =>
      (element.closest('.ui-surface')?.querySelector('.ui-section-header__title')?.textContent ?? '').trim();
    const cards = [...content.querySelectorAll('.ui-section-header__title')]
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
      emptyStates: [...content.querySelectorAll('.ui-empty-state')].map((state) => {
        const rect = state.getBoundingClientRect();
        return {
          card: titleOf(state),
          title: (state.querySelector('.ui-empty-state__title')?.textContent ?? '').trim(),
          description: state.querySelector('.ui-empty-state__description')?.textContent?.trim() ?? null,
          controls: state.querySelectorAll('button, [role="button"], a').length,
          x: rect.x,
          width: rect.width,
        };
      }),
    };
  });
}

/**
 * The compose screen, as the change REQ-49…REQ-51 declares can be measured on
 * both builds: what the projects are listed with, how many regions the screen
 * lays side by side, and what the empty result says and how wide it is drawn.
 *
 * The empty states are measured with the **lines their title paints**, which is
 * the pin batch 5 left on this batch: the delivered `1fr` column resolved a 105px
 * card in which an empty state's own box was 48px, its title wrapping to three
 * and four lines. A width alone would not have shown that; a line count alone
 * would not have shown the box.
 */
async function measureComposeScreen(page: Page): Promise<{
  columnWidth: number;
  cards: { title: string; x: number; y: number; width: number }[];
  groupedRowsPanels: number;
  objectLists: number;
  grids: number;
  detailPanels: number;
  emptyStates: { title: string; titleLines: number; description: string | null; controls: number; x: number; width: number }[];
}> {
  return await page.evaluate(() => {
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
    return {
      columnWidth,
      cards,
      groupedRowsPanels: content.querySelectorAll('.ui-grouped-rows-panel').length,
      objectLists: content.querySelectorAll('.ui-data-table').length,
      grids: content.querySelectorAll('.ui-grid').length,
      detailPanels: content.querySelectorAll('.ui-detail-panel').length,
      emptyStates: [...content.querySelectorAll('.ui-empty-state')].map((state) => {
        const rect = state.getBoundingClientRect();
        const title = state.querySelector('.ui-empty-state__title');
        let titleLines = 0;
        if (title) {
          const range = document.createRange();
          range.selectNodeContents(title);
          titleLines = range.getClientRects().length;
        }
        return {
          title: (title?.textContent ?? '').trim(),
          titleLines,
          description: state.querySelector('.ui-empty-state__description')?.textContent?.trim() ?? null,
          controls: state.querySelectorAll('button, [role="button"], a').length,
          x: rect.x,
          width: rect.width,
        };
      }),
    };
  });
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

          // The plugins screen, whose declared change is the two lists, the pair that held them and
          // the empty results: `Grid columns="1fr 1fr"` never collapsed, so at 375×812 each list
          // drew in 157.5px; and the inspection is a row's own expansion, so a list's width is the
          // panel's width. Stacked, the panel is read at the content column's full width.
          if (screen.id === 'plugins') {
            const deliveredScreen = await measurePluginsScreen(before);
            const currentScreen = await measurePluginsScreen(page);
            console.log(
              `[REQ-46] ${at} ${screen.heading}: delivered ${deliveredScreen.cardLists} card list(s), ${deliveredScreen.objectLists} object list(s), ` +
                `${deliveredScreen.toolbars} toolbar(s), empty states ${JSON.stringify(deliveredScreen.emptyStates)}, ` +
                `cards ${deliveredScreen.cards.map((card) => `${card.title} x=${round(card.x)} y=${round(card.y)} w=${round(card.width)}`).join(', ')} — ` +
                `now ${currentScreen.cardLists} / ${currentScreen.objectLists} / ${currentScreen.toolbars}, ` +
                `empty states ${JSON.stringify(currentScreen.emptyStates)}, ` +
                `cards ${currentScreen.cards.map((card) => `${card.title} x=${round(card.x)} y=${round(card.y)} w=${round(card.width)}`).join(', ')} — ${
                  DELIBERATELY_CHANGED[screen.id]
                }`,
            );

            // The premise: the delivered build really did draw the hand-built lists this batch
            // deletes, no object list at all, and the two of them side by side at this viewport.
            expect(deliveredScreen.cardLists, `${at}: the delivered build drew no card list here, so this comparison shows nothing`).toBeGreaterThan(0);
            expect(deliveredScreen.objectLists, `${at}: the delivered build already listed the plugins on the object list`).toBe(0);
            expect(deliveredScreen.cards.length, `${at}: the delivered build drew a different number of cards`).toBe(2);
            expect(
              round(deliveredScreen.cards[1]!.x),
              `${at}: the delivered build already stacked the two lists, so the pair REQ-46 deletes was not there`,
            ).not.toBe(round(deliveredScreen.cards[0]!.x));

            expect(currentScreen.cardLists, `${at}: a hand-built card list is still drawn on this screen`).toBe(0);
            expect(currentScreen.objectLists, `${at}: the two inventories are not both on the object list`).toBe(2);
            expect(currentScreen.toolbars, `${at}: the screen does not carry exactly one page-level toolbar`).toBe(1);

            // Stacked, each at the content column's full width, the daemon list under the CLI one.
            const [cli, daemon] = currentScreen.cards;
            expect(currentScreen.cards.map((card) => card.title), `${at}: the screen draws a different pair of cards`).toEqual([
              'CLI plugins',
              'Daemon plugins',
            ]);
            expect(round(daemon!.x), `${at}: the two lists are not on one left edge`).toBe(round(cli!.x));
            expect(round(daemon!.width), `${at}: the two lists do not share one width`).toBe(round(cli!.width));
            expect(daemon!.y, `${at}: the daemon list is not below the CLI list`).toBeGreaterThan(cli!.y);
            for (const card of currentScreen.cards) {
              expect(
                round(card.width),
                `${at}: the ${card.title} card is ${round(card.width)}px of a ${round(currentScreen.columnWidth)}px content column`,
              ).toBeGreaterThanOrEqual(round(currentScreen.columnWidth) - 1);
              expect(card.width, `${at}: the migrated ${card.title} list is no wider than the half it replaces`).toBeGreaterThan(
                deliveredScreen.cards[0]!.width,
              );
            }

            // REQ-48 — "a title, one line of explanation and, where one exists, the action that
            // resolves it". The delivered build's empty result was a title and nothing else; what
            // is compared is therefore what each of them **says**, not how many there are. Whether
            // an action is offered depends on the daemon's own answer — it is withheld where the
            // daemon states a reason installing a plugin would not resolve — so that half is
            // measured against a stubbed reading in `plugins-row-geometry.spec.ts`, and only
            // reported here.
            const deliveredEmpty = deliveredScreen.emptyStates.find((state) => state.card === 'Daemon plugins');
            const currentEmpty = currentScreen.emptyStates.find((state) => state.card === 'Daemon plugins');
            if (currentEmpty) {
              console.log(
                `[REQ-48] ${at}: delivered "${deliveredEmpty?.title}" / "${deliveredEmpty?.description}" (${deliveredEmpty?.controls} control(s), ` +
                  `${round(deliveredEmpty?.width ?? Number.NaN)}px) — now "${currentEmpty.title}" / "${currentEmpty.description}" ` +
                  `(${currentEmpty.controls} control(s), ${round(currentEmpty.width)}px)`,
              );
              expect(
                deliveredEmpty?.description ?? null,
                `${at}: the delivered build already explained the empty daemon inventory, so REQ-48 has nothing to repair here`,
              ).toBeNull();
              expect(currentEmpty.description, `${at}: the empty daemon inventory states no line of explanation (REQ-48)`).not.toBeNull();
              expect(currentEmpty.description!.length, `${at}: the empty daemon inventory explains nothing (REQ-48)`).toBeGreaterThan(20);
            } else {
              console.log(`[REQ-48] ${at}: this daemon exposes a managed plugin, so no empty result is drawn to compare`);
            }

            // The change is inside the screen: the shell's content column is where it was.
            expect(round(currentScreen.columnWidth), `${at}: the shell's content column changed width`).toBe(round(deliveredScreen.columnWidth));
            continue;
          }

          // The compose screen, whose declared change is the list component itself: the projects
          // leave the product's third list paradigm for the object list, and `GroupedRowsPanel` is
          // deleted with them. The pair that held the file and the logs beside the list goes too —
          // not collapsed but deleted, its two regions now being views of the selected project's
          // own panel — which is what lets the empty result be read as words at 375×812 instead of
          // as a column of single characters in a 105px track.
          if (screen.id === 'compose') {
            const deliveredScreen = await measureComposeScreen(before);
            const currentScreen = await measureComposeScreen(page);
            console.log(
              `[REQ-49] ${at} ${screen.heading}: delivered ${deliveredScreen.groupedRowsPanels} grouped-rows panel(s), ` +
                `${deliveredScreen.objectLists} object list(s), ${deliveredScreen.grids} grid(s), ` +
                `empty states ${JSON.stringify(deliveredScreen.emptyStates)} — ` +
                `now ${currentScreen.groupedRowsPanels} / ${currentScreen.objectLists} / ${currentScreen.grids}, ` +
                `empty states ${JSON.stringify(currentScreen.emptyStates)}, ` +
                `cards ${currentScreen.cards.map((card) => `${card.title} x=${round(card.x)} w=${round(card.width)}`).join(', ')} — ${
                  DELIBERATELY_CHANGED[screen.id]
                }`,
            );

            // The premise: the delivered build really did lay two regions side by side here, and
            // really did list nothing on the object list.
            expect(deliveredScreen.grids, `${at}: the delivered build laid out no pair here, so this comparison shows nothing`).toBeGreaterThan(0);
            expect(deliveredScreen.objectLists, `${at}: the delivered build already listed the projects on the object list`).toBe(0);

            expect(currentScreen.groupedRowsPanels, `${at}: the retired grouped-rows panel is still drawn`).toBe(0);
            expect(currentScreen.objectLists, `${at}: the projects are not listed on the object list`).toBe(1);
            expect(currentScreen.grids, `${at}: a Grid still lays something out beside the list`).toBe(0);
            expect(currentScreen.detailPanels, `${at}: a project's detail is open before anything was selected`).toBe(0);

            // One card, at the content column's full width — which the 2fr of a pair could not give
            // the detail panel it now reveals.
            expect(currentScreen.cards.map((card) => card.title), `${at}: the screen draws a card the migration does not`).toEqual([
              'Compose projects',
            ]);
            const card = currentScreen.cards[0]!;
            expect(
              round(card.width),
              `${at}: the card is ${round(card.width)}px of a ${round(currentScreen.columnWidth)}px content column`,
            ).toBeGreaterThanOrEqual(round(currentScreen.columnWidth) - 1);

            // REQ-51 — the empty result, and the pin batch 5 left on this batch. What the delivered
            // build drew in the second column is only there when that column is: on a daemon
            // holding a compose project the reading differs, so the comparison is made on the one
            // empty state both builds draw whatever the daemon says, and the rest is reported.
            const deliveredEmpty = deliveredScreen.emptyStates.find((state) => state.title === 'No compose projects');
            const currentEmpty = currentScreen.emptyStates.find((state) => state.title === 'No compose projects');
            if (currentEmpty && deliveredEmpty) {
              expect(
                deliveredEmpty.description,
                `${at}: the delivered build already explained the empty result, so REQ-51 has nothing to repair here`,
              ).toBeNull();
              expect(deliveredEmpty.controls, `${at}: the delivered empty result already offered an action`).toBe(0);
              expect(currentEmpty.description, `${at}: the empty result states no line of explanation (REQ-51)`).not.toBeNull();
              expect(currentEmpty.description!.length, `${at}: the empty result explains nothing (REQ-51)`).toBeGreaterThan(20);
              expect(currentEmpty.controls, `${at}: the empty result offers no action that resolves it (REQ-51)`).toBe(1);
              expect(currentEmpty.titleLines, `${at}: the empty result's title wraps over ${currentEmpty.titleLines} lines`).toBe(1);
            } else {
              console.log(`[REQ-51] ${at}: this daemon holds a compose project, so no empty result is drawn to compare`);
            }

            // The two empty states the deleted column produced — each of them a state a panel
            // belonging to a project cannot be in — are gone outright, with the column.
            expect(
              currentScreen.emptyStates.map((state) => state.title),
              `${at}: an empty state of the deleted column survives`,
            ).not.toContain('No project selected');

            // The change is inside the screen: the shell's content column is where it was.
            expect(round(currentScreen.columnWidth), `${at}: the shell's content column changed width`).toBe(round(deliveredScreen.columnWidth));
            continue;
          }

          // The swarm screen, whose declared change is a **count**: one fact stated once. The
          // delivered build said "this daemon is not part of a swarm" in the state bar and again in
          // each of five lists, with the two actions that resolve it in the bar rather than in the
          // statement; and it laid the panels out two by two, which capped a reveal at a third of
          // the column. Both halves are measured on both builds.
          if (screen.id === 'swarm') {
            const deliveredScreen = await measureSwarmScreen(before);
            const currentScreen = await measureSwarmScreen(page);
            console.log(
              `[REQ-52] ${at} ${screen.heading}: delivered ${deliveredScreen.saying.length} element(s) over ` +
                `${deliveredScreen.surfaces} surface(s) — ${JSON.stringify(deliveredScreen.saying)}; ` +
                `${deliveredScreen.emptyStates} empty state(s), ${deliveredScreen.stateBars} state bar(s), ` +
                `cards ${JSON.stringify(deliveredScreen.cards)}, ${deliveredScreen.quadPanelLayouts} quad layout(s), ` +
                `screen ends at y=${round(deliveredScreen.screenBottom)} — now ${currentScreen.saying.length} element(s) over ` +
                `${currentScreen.surfaces} surface(s) — ${JSON.stringify(currentScreen.saying)}; ` +
                `${currentScreen.emptyStates} empty state(s), ${currentScreen.stateBars} state bar(s), ` +
                `cards ${JSON.stringify(currentScreen.cards)}, ${currentScreen.quadPanelLayouts} quad layout(s), ` +
                `screen ends at y=${round(currentScreen.screenBottom)} — ${DELIBERATELY_CHANGED[screen.id]}`,
            );
            console.log(
              `[REQ-53] ${at}: delivered actions ${JSON.stringify(deliveredScreen.actions)} against a statement at ` +
                `${deliveredScreen.statement ? `y=${round(deliveredScreen.statement.y)}` : 'no statement surface'} — ` +
                `now ${JSON.stringify(currentScreen.actions)} against ` +
                `${currentScreen.statement ? `y=${round(currentScreen.statement.y)}` : 'no statement surface'}`,
            );

            // On a daemon that is in a swarm this screen states no condition at all, so there is
            // nothing for either build to repeat and the comparison would show nothing. Reported and
            // skipped rather than asserted against zero (REQ-56).
            if (deliveredScreen.saying.length === 0) {
              console.log(`[REQ-52] ${at}: this daemon is in a swarm, so neither build states the condition to compare`);
              continue;
            }

            // REQ-54's premise, measured rather than quoted: on the delivered build the bottom row's
            // two cards did **not** start their content at the same y — `Secrets`' empty state sat
            // 25.4px above `Configs & stacks`', because that card was the only one holding two
            // inventories and had to label the first of them inside its own body. After this batch
            // there is no such card and no such row: one card per inventory, each starting its
            // content 0px under its own header, which is measured on a manager in
            // `swarm-row-geometry.spec.ts`. Reported at every viewport, asserted only where the
            // delivered build actually drew the pair side by side.
            const deliveredSecrets = deliveredScreen.cardContentTops.find((entry) => entry.card === 'Secrets');
            const deliveredConfigs = deliveredScreen.cardContentTops.find((entry) => entry.card === 'Configs & stacks');
            console.log(
              `[REQ-54] ${at}: delivered card contents ${JSON.stringify(
                deliveredScreen.cardContentTops.map((entry) => `${entry.card} y=${round(entry.y)}`),
              )} — Secrets against Configs & stacks: ` +
                `${deliveredSecrets && deliveredConfigs ? `${round(deliveredConfigs.y - deliveredSecrets.y)}px apart` : 'not both drawn'}`,
            );
            if (deliveredSecrets && deliveredConfigs && viewport.width >= 1280) {
              expect(
                round(deliveredConfigs.y - deliveredSecrets.y),
                `${at}: the delivered bottom row already shared a baseline, so REQ-54 has nothing to repair here`,
              ).not.toBe(0);
            }

            // The premise: the delivered build really did state one fact many times over, and really
            // did lay the panels out two by two.
            expect(
              deliveredScreen.saying.length,
              `${at}: the delivered build stated the condition ${deliveredScreen.saying.length} time(s), so REQ-52 has nothing to repair here`,
            ).toBeGreaterThan(1);
            expect(
              deliveredScreen.surfaces,
              `${at}: the delivered build already stated the condition on one surface`,
            ).toBeGreaterThan(1);
            expect(deliveredScreen.quadPanelLayouts, `${at}: the delivered build laid out no two-by-two grid here`).toBeGreaterThan(0);

            // REQ-52 — stated once, on one surface, by one element.
            expect(currentScreen.saying, `${at}: the condition is stated by more than one element`).toHaveLength(1);
            expect(currentScreen.surfaces, `${at}: the condition is stated on more than one surface`).toBe(1);
            expect(currentScreen.emptyStates, `${at}: more than one statement surface is drawn`).toBe(1);
            expect(currentScreen.stateBars, `${at}: the state bar is drawn where there is no state to qualify`).toBe(0);
            expect(currentScreen.cards, `${at}: an inventory card is drawn where there is no cluster to read`).toEqual([]);
            expect(currentScreen.cardLists, `${at}: a hand-built card list is still drawn on this screen`).toBe(0);
            expect(currentScreen.quadPanelLayouts, `${at}: the two-by-two grid is still laying the panels out`).toBe(0);

            // REQ-53 — the two actions sit **in** the statement, where the delivered build had them
            // in a bar above the repetitions.
            expect(
              deliveredScreen.actions.some((action) => action.insideTheStatement),
              `${at}: the delivered build already carried a resolving action inside the statement`,
            ).toBe(false);
            expect(currentScreen.actions.length, `${at}: the screen offers neither way into a swarm`).toBe(2);
            for (const action of currentScreen.actions) {
              expect(action.insideTheStatement, `${at}: ${action.label} is drawn outside the statement of the condition`).toBe(true);
            }

            // …and the screen is shorter for it: five repetitions had a length.
            expect(
              currentScreen.screenBottom,
              `${at}: the inactive screen still reaches y=${round(currentScreen.screenBottom)}, against a delivered ${round(
                deliveredScreen.screenBottom,
              )}`,
            ).toBeLessThan(deliveredScreen.screenBottom);

            // The change is inside the screen: the shell's content column is where it was.
            expect(round(currentScreen.columnWidth), `${at}: the shell's content column changed width`).toBe(round(deliveredScreen.columnWidth));
            continue;
          }

          // The images screen, whose declared change is **which columns the list has** (REQ-57,
          // REQ-59). Unlike every other entry of `DELIBERATELY_CHANGED`, this one does not skip the
          // surface-by-surface comparison: the column set is asserted here and the screen then falls
          // through to it, carrying the single declared exemption `widthDeclaredBy` states.
          if (screen.id === 'images-layers') {
            const deliveredList = await measureImagesList(before);
            const currentList = await measureImagesList(page);
            console.log(
              `[REQ-57] ${at} ${screen.heading}: delivered headers ${JSON.stringify(deliveredList.headers)}, header ${JSON.stringify(
                deliveredList.header,
              )}, card ${JSON.stringify(deliveredList.card)}, ${deliveredList.rows} row(s) — now headers ${JSON.stringify(currentList.headers)}, ` +
                `header ${JSON.stringify(currentList.header)}, card ${JSON.stringify(currentList.card)}, ${currentList.rows} row(s) — ${
                  DELIBERATELY_CHANGED[screen.id]
                }`,
            );

            expect(deliveredList.header, `${at}: the delivered build draws no images list`).not.toBeNull();
            expect(currentList.header, `${at}: this build draws no images list`).not.toBeNull();

            // The premise: the delivered build really did carry both the repeated column and the
            // word that named two different numbers.
            expect(deliveredList.headers, `${at}: the delivered build drew no TAGS column, so REQ-57 has nothing to remove here`).toContain('TAGS');
            expect(deliveredList.headers, `${at}: the delivered build did not call the row's number SIZE, so REQ-59 has nothing to rename`).toContain(
              'SIZE',
            );

            // …and this build has neither, keeps the reference column, and names the row's number
            // what it measures (images-screen.md).
            expect(currentList.headers, `${at}: the repeated TAGS column is still drawn (REQ-57)`).not.toContain('TAGS');
            expect(currentList.headers, `${at}: the row's number is still called SIZE (REQ-59)`).not.toContain('SIZE');
            expect(currentList.headers, `${at}: the reference column is gone (REQ-57 keeps it)`).toContain('REPOSITORY:TAG');
            expect(currentList.headers, `${at}: the row's number is not named what it measures (REQ-59)`).toContain('DISK USAGE');
            expect(currentList.headers.length, `${at}: the list gained or lost more than the one column REQ-57 removes`).toBe(
              deliveredList.headers.length - 1,
            );

            // The box that column cost. Where the table fits its card, the columns share the card's
            // width and one fewer moves nothing; where the table is wider than its card, it is
            // sized by its own columns and is narrower by that one.
            const deliveredScrolls = deliveredList.header!.width > (deliveredList.card?.width ?? Number.POSITIVE_INFINITY) + 1;
            expect(round(currentList.header!.x), `${at}: the images list header moved sideways`).toBe(round(deliveredList.header!.x));
            expect(round(currentList.header!.y), `${at}: the images list header moved down the screen`).toBe(round(deliveredList.header!.y));
            if (deliveredScrolls) {
              expect(
                currentList.header!.width,
                `${at}: the table is sized by its own columns here and did not lose the width of the column REQ-57 removes`,
              ).toBeLessThan(deliveredList.header!.width);
              // `DISK USAGE` is two words in the track `SIZE` had (REQ-59), so the header row is
              // allowed to take a second line — never to lose one.
              expect(
                currentList.header!.height,
                `${at}: the renamed column left the header row shorter than the delivered one`,
              ).toBeGreaterThanOrEqual(deliveredList.header!.height);
            } else {
              expect(
                round(currentList.header!.width),
                `${at}: the table fills its card here, so removing a column may move no box`,
              ).toBe(round(deliveredList.header!.width));
            }
            // Deliberately no `continue`: the screen is compared surface by surface below.
          }

          // The system & prune screen, whose declared change is the pair, the toolbar and the two
          // empty results — and whose whole point is what it does **not** change: the eight daemon
          // properties it keeps (REQ-75), the five prune rows (REQ-73) and the standing warning
          // (REQ-74) are counted here and compared word for word in `system-prune-preserved.spec.ts`.
          if (screen.id === 'system-prune') {
            const deliveredScreen = await measureSystemScreen(before);
            const currentScreen = await measureSystemScreen(page);
            console.log(
              `[REQ-75] ${at} ${screen.heading}: delivered cards ${deliveredScreen.cards
                .map((card) => `${card.title} x=${round(card.x)} y=${round(card.y)} ${round(card.width)}×${round(card.height)} slack=${round(card.slack)}`)
                .join(', ')}, ${deliveredScreen.toolbars} toolbar(s), system prune ${JSON.stringify(deliveredScreen.systemPrune)}, ` +
                `rows start ${round(deliveredScreen.rowsStartUnderTheCard ?? Number.NaN)}px under their card, ` +
                `${deliveredScreen.daemonProperties.length}/8 daemon properties, ${deliveredScreen.storageRows} prune row(s), ${deliveredScreen.callouts} callout(s) — ` +
                `now cards ${currentScreen.cards
                  .map((card) => `${card.title} x=${round(card.x)} y=${round(card.y)} ${round(card.width)}×${round(card.height)} slack=${round(card.slack)}`)
                  .join(', ')}, ${currentScreen.toolbars} toolbar(s), system prune ${JSON.stringify(currentScreen.systemPrune)}, ` +
                `rows start ${round(currentScreen.rowsStartUnderTheCard ?? Number.NaN)}px under their card, ` +
                `${currentScreen.daemonProperties.length}/8 daemon properties, ${currentScreen.storageRows} prune row(s), ${currentScreen.callouts} callout(s), ` +
                `content column ${round(currentScreen.columnWidth)}px — ${DELIBERATELY_CHANGED[screen.id]}`,
            );

            const cardOf = (screenReading: typeof currentScreen, title: string) => screenReading.cards.find((card) => card.title === title);
            const deliveredDaemon = cardOf(deliveredScreen, 'Daemon info');
            const deliveredReclaim = cardOf(deliveredScreen, 'Reclaim disk space');
            const daemon = cardOf(currentScreen, 'Daemon info');
            const reclaim = cardOf(currentScreen, 'Reclaim disk space');
            for (const [name, cards] of [
              ['the delivered build', [deliveredDaemon, deliveredReclaim]],
              ['this build', [daemon, reclaim]],
            ] as const) {
              expect(cards[0], `${at}: ${name} draws no daemon card`).toBeDefined();
              expect(cards[1], `${at}: ${name} draws no reclaim card`).toBeDefined();
            }

            // The premise: the delivered build really did divide the column unequally, really did
            // keep the two side by side at every viewport, really did stretch them to one height,
            // and really did carry the system prune inside the section header.
            expect(round(deliveredDaemon!.x), `${at}: the delivered build already stacked the two cards, so this comparison shows nothing`).not.toBe(
              round(deliveredReclaim!.x),
            );
            expect(
              round(deliveredDaemon!.width),
              `${at}: the delivered build already gave the two cards one width, so this comparison shows nothing`,
            ).not.toBe(round(deliveredReclaim!.width));
            expect(
              Math.abs(deliveredDaemon!.height - deliveredReclaim!.height),
              `${at}: the delivered pair did not stretch to one height, so the align-items change has nothing to show`,
            ).toBeLessThanOrEqual(1);
            expect(deliveredScreen.systemPrune?.insideSectionHeader, `${at}: the delivered build did not carry the system prune in the section header`).toBe(
              true,
            );
            expect(deliveredScreen.toolbars, `${at}: the delivered build already drew an action bar on this screen`).toBe(0);

            // The pair: equal panels while the grid's own box carries both, one full-width column
            // when it cannot (layout-primitives.md — intrinsic, not keyed to the viewport).
            if (viewport.width >= 1280) {
              expect(round(reclaim!.y), `${at}: the two cards are no longer on one row`).toBe(round(daemon!.y));
              expect(Math.abs(reclaim!.width - daemon!.width), `${at}: the pair still divides the column unequally`).toBeLessThanOrEqual(1);
              expect(daemon!.width, `${at}: the daemon card is no wider than the one the fixed template gave it`).toBeGreaterThan(deliveredDaemon!.width);
              expect(reclaim!.width, `${at}: the reclaim card did not give up the width the fixed template gave it`).toBeLessThan(
                deliveredReclaim!.width,
              );
            } else {
              expect(round(reclaim!.x), `${at}: the two cards are still side by side`).toBe(round(daemon!.x));
              expect(round(reclaim!.width), `${at}: the stacked cards do not share one width`).toBe(round(daemon!.width));
              expect(reclaim!.y, `${at}: the reclaim card is not below the daemon card`).toBeGreaterThan(daemon!.y);
              expect(
                round(daemon!.width),
                `${at}: the daemon card is ${round(daemon!.width)}px of a ${round(currentScreen.columnWidth)}px content column`,
              ).toBeGreaterThanOrEqual(round(currentScreen.columnWidth) - 1);
            }

            // `align-items: start`: each card is its own content's height, so the empty space under
            // the content is the same padding in both — where the delivered pair stretched one of
            // them to the other's height.
            expect(
              Math.abs(deliveredDaemon!.slack - deliveredReclaim!.slack),
              `${at}: the delivered cards already carried the same slack, so the stretch this batch removes was not there`,
            ).toBeGreaterThan(1);
            expect(
              Math.abs(daemon!.slack - reclaim!.slack),
              `${at}: the two cards still stretch to a shared height (slack ${round(daemon!.slack)}px against ${round(reclaim!.slack)}px)`,
            ).toBeLessThanOrEqual(1);

            // The toolbar: the screen's own action is a control of the action bar under the header,
            // and the rows it pushes down sit lower for it.
            expect(currentScreen.toolbars, `${at}: the screen does not carry exactly one action bar`).toBe(1);
            expect(currentScreen.systemPrune?.insideToolbar, `${at}: the system prune is not a control of the action bar`).toBe(true);
            expect(currentScreen.systemPrune?.insideSectionHeader, `${at}: the system prune is still inside the section header`).toBe(false);
            expect(currentScreen.toolbar?.underTheHeader, `${at}: the action bar is not drawn under the panel's header`).toBe(true);
            expect(currentScreen.toolbar?.aboveTheRows, `${at}: the action bar is not drawn above the prune rows`).toBe(true);

            // What that row costs the rows below it — where the header above them is the header the
            // delivered build drew and not a wrapped one. The delivered header **carried the system
            // prune inside it**, so it is entitled to be one control taller than this one (52.03px
            // against 46.03px at both desktop widths); a header taller than that has wrapped in a
            // narrower card, which is what the phone breakpoint's 171.81px card did (136.09px), and
            // comparing the offsets there would report the collapse as an action bar costing
            // nothing.
            const deliveredHeader = deliveredScreen.reclaimHeaderHeight ?? Number.NaN;
            const currentHeader = currentScreen.reclaimHeaderHeight ?? Number.NaN;
            const toolbarHeight = currentScreen.toolbar?.height ?? Number.NaN;
            const rowsLowerBy = (currentScreen.rowsStartUnderTheCard ?? Number.NaN) - (deliveredScreen.rowsStartUnderTheCard ?? Number.NaN);
            const headerComparable = deliveredHeader <= currentHeader + toolbarHeight + 1;
            console.log(
              `[REQ-75] ${at}: the reclaim header is ${round(deliveredHeader)}px on the delivered build and ${round(currentHeader)}px here; ` +
                `the action bar is ${round(toolbarHeight)}px, and the rows start ${round(rowsLowerBy)}px lower — ${
                  headerComparable ? 'comparable' : 'not comparable: the delivered header wrapped in a card this build no longer draws'
                }`,
            );
            if (headerComparable) {
              expect(
                rowsLowerBy,
                `${at}: the prune rows start ${round(currentScreen.rowsStartUnderTheCard ?? Number.NaN)}px under their card, against a delivered ${round(
                  deliveredScreen.rowsStartUnderTheCard ?? Number.NaN,
                )}px, so the action bar costs no row`,
              ).toBeGreaterThan(0);
              expect(
                rowsLowerBy,
                `${at}: the prune rows start ${round(rowsLowerBy)}px lower, which is more than the ${round(toolbarHeight)}px action bar above them`,
              ).toBeLessThanOrEqual(toolbarHeight + 1);
            }

            // …and what the batch states it does not change is still all there.
            expect(currentScreen.daemonProperties, `${at}: this screen no longer states the eight daemon properties it keeps (REQ-75)`).toEqual(
              DAEMON_PROPERTIES,
            );
            expect(currentScreen.storageRows, `${at}: the screen draws a different number of prune rows (REQ-73)`).toBe(deliveredScreen.storageRows);
            expect(currentScreen.callouts, `${at}: the standing warning is no longer stated as one callout (REQ-74)`).toBe(deliveredScreen.callouts);

            // The change is inside the screen: the shell's content column is where it was.
            expect(round(currentScreen.columnWidth), `${at}: the shell's content column changed width`).toBe(round(deliveredScreen.columnWidth));
            continue;
          }

          // The About screen, whose declared change is one card fewer and one treatment for every
          // section title: the `Daemon event stream` card repeated the Dashboard's own stream
          // verbatim (REQ-71), and the uppercase micro-caps card title is gone from the screen
          // (REQ-70). Everything else is asserted to be exactly where those two put it.
          if (screen.id === 'coverage-matrix') {
            const deliveredScreen = await measureAboutScreen(before);
            const currentScreen = await measureAboutScreen(page);
            console.log(
              `[REQ-70] ${at} ${screen.heading}: delivered ${new Set(deliveredScreen.treatments).size} treatment(s) over ` +
                `${deliveredScreen.cards.length} section(s) — ${JSON.stringify(
                  deliveredScreen.cards.map((card, index) => `${card.title} → ${deliveredScreen.treatments[index]}`),
                )}; ${deliveredScreen.cardTitles} card title(s), ${deliveredScreen.eyebrows} eyebrow header(s), ` +
                `${deliveredScreen.eventStreams} event stream(s) — now ${new Set(currentScreen.treatments).size} treatment(s) over ` +
                `${currentScreen.cards.length} section(s) — ${JSON.stringify(
                  currentScreen.cards.map((card, index) => `${card.title} → ${currentScreen.treatments[index]}`),
                )}; ${currentScreen.cardTitles} card title(s), ${currentScreen.eyebrows} eyebrow header(s), ` +
                `${currentScreen.eventStreams} event stream(s) — ${DELIBERATELY_CHANGED[screen.id]}`,
            );

            // The premise: the delivered build really did title this screen in more than one way,
            // and really did carry the card REQ-71 takes off it.
            expect(
              new Set(deliveredScreen.treatments).size,
              `${at}: the delivered build already titled every section of this screen one way, so REQ-70 has nothing to repair here`,
            ).toBeGreaterThan(1);
            // The **panel**, not the surface: the stream draws no surface of its own until an event
            // has arrived, and the delivered build's server process is minutes old, so a surface
            // count is not evidence either way of the card REQ-71 removes.
            expect(
              deliveredScreen.cards.map((card) => card.title),
              `${at}: the delivered build drew no ${REMOVED_ABOUT_SECTION} card, so REQ-71 has nothing to remove here`,
            ).toContain(REMOVED_ABOUT_SECTION);

            expect(new Set(currentScreen.treatments).size, `${at}: the screen carries more than one section-header treatment`).toBe(1);
            expect(currentScreen.cardTitles, `${at}: a card title is still drawn on this screen`).toBe(0);
            expect(currentScreen.eyebrows, `${at}: the uppercase micro-caps treatment is still drawn on this screen`).toBe(0);
            expect(currentScreen.eventStreams, `${at}: a daemon event stream is still drawn on this screen`).toBe(0);

            // One card fewer, and that one: the screen states everything else it stated, in the
            // order it stated it (REQ-72).
            expect(
              currentScreen.cards.map((card) => card.title),
              `${at}: the screen lost or gained a section beyond the stream REQ-71 removes`,
            ).toEqual(deliveredScreen.cards.map((card) => card.title).filter((title) => title !== REMOVED_ABOUT_SECTION));

            let offset = 0;
            let comparableY = true;
            for (const [index, deliveredCard] of deliveredScreen.cards.entries()) {
              if (deliveredCard.title === REMOVED_ABOUT_SECTION) {
                const next = deliveredScreen.cards[index + 1];
                offset -= next ? next.y - deliveredCard.y : deliveredCard.height;
                continue;
              }
              const card = currentScreen.cards.find((candidate) => candidate.title === deliveredCard.title)!;
              expect(round(card.x), `${at}: the ${card.title} card moved sideways`).toBe(round(deliveredCard.x));
              expect(round(card.width), `${at}: the ${card.title} card changed width`).toBe(round(deliveredCard.width));
              expect(
                round(card.width),
                `${at}: the ${card.title} card is ${round(card.width)}px of a ${round(currentScreen.columnWidth)}px content column`,
              ).toBeGreaterThanOrEqual(round(currentScreen.columnWidth) - 1);

              const headerDelta = card.headerCost - deliveredCard.headerCost;
              const heightDelta = card.height - deliveredCard.height;
              console.log(
                `[REQ-70] ${at} ${card.title}: header ${round(deliveredCard.headerCost)}px → ${round(card.headerCost)}px, ` +
                  `card ${round(deliveredCard.height)}px → ${round(card.height)}px, y ${round(deliveredCard.y)} → ${round(card.y)} ` +
                  `(expected ${round(deliveredCard.y + offset)})`,
              );

              if (card.text !== deliveredCard.text) {
                console.log(`[REQ-72] ${at} ${card.title}: the daemon changed what this card says between the two reads, so its box is not comparable`);
                comparableY = false;
              } else if (comparableY) {
                expect(
                  Math.abs(card.y - (deliveredCard.y + offset)),
                  `${at}: the ${card.title} card is not where the removed card and the titles above it put it`,
                ).toBeLessThanOrEqual(1);
                expect(
                  Math.abs(card.bodyHeight - deliveredCard.bodyHeight),
                  `${at}: the ${card.title} card's content changed height, which no requirement of this batch declares`,
                ).toBeLessThanOrEqual(1);
                expect(
                  Math.abs(heightDelta - headerDelta),
                  `${at}: the ${card.title} card changed height by ${round(heightDelta)}px, against the ${round(headerDelta)}px its own title costs`,
                ).toBeLessThanOrEqual(1);
              }
              offset += heightDelta;
            }

            // The change is inside the screen: the shell's content column is where it was.
            expect(round(currentScreen.columnWidth), `${at}: the shell's content column changed width`).toBe(round(deliveredScreen.columnWidth));
            continue;
          }

          // The volumes & networks screen — the first entry of `DELIBERATELY_CHANGED` and the only
          // one still reached by name rather than by its own `if` above. (It was `DELIBERATELY_CHANGED[
          // screen.id] !== undefined` while every entry skipped the comparison; `images-layers` is
          // the first that does not, so the condition names the screen it has always meant.)
          if (screen.id === 'volumes-networks') {
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
            // …and except on the one surface a migration of this plan declares: the images list's
            // own header row, narrower by the column REQ-57 removes, and only where the table is
            // sized by its columns rather than by its card. Asserted positively in that screen's
            // branch above; exempted here so that every other surface of it stays under the rule.
            if (widthDelta < 0 || widthDelta > widthAllowance) {
              if (widthDeclaredBy(screen.id, key, widthDelta)) {
                console.log(`[REQ-57] declared: ${screen.heading} ${key}: width ${round(widthDelta)}px — the column the images list no longer draws`);
              } else {
                record('width', widthDelta);
              }
            }

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
