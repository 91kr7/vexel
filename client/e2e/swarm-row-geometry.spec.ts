/**
 * F12 — the swarm screen, measured
 * (`plan-ui-coherence-optimisation/REQ-52`, `REQ-53`, `REQ-54`, `REQ-55`,
 * `REQ-56`; `swarm/specs/swarm-screen.md` and the four panel specs).
 *
 * **Nothing here initialises a swarm.** Swarm mode is a property of the whole
 * daemon, which no label can scope, and the daemon this runs against is the
 * operator's own — `docker swarm init` would reconfigure it and leave an ingress
 * network behind. So the cluster is answered **in the browser**, which is the
 * precedent batches 8, 10 and 11 set for exactly this problem, and the daemon is
 * not touched at all. What that costs is stated rather than hidden: this file
 * says nothing about the server's own reading of a real cluster. That half is
 * `e2e/exclusive/swarm-cluster.spec.ts`, which puts the daemon back the way it
 * found it and skips outright where it cannot prove it may.
 *
 * The **inactive** presentation — the one the analysis actually measured, and
 * the one every machine can reach — is checked unconditionally (REQ-56): it is
 * stubbed too, so that the assertions hold whatever state the daemon this runs
 * against happens to be in.
 *
 * Every claim is about **boxes, paint and counts**. A condition stated six times
 * over, an action 883px away from the statement it resolves, a panel drawn at a
 * third of the column — none of them change what the screen *says*; what they
 * change is how many elements say it and where the rectangles are (CLAUDE.md,
 * "What a check drives, and what it measures"). The one place a count of text *is*
 * the requirement is REQ-52 itself, which is this batch's own case.
 *
 * Every control is driven with a **real pointer at the visible control's own
 * coordinates**, and a row is selected on its **first cell**.
 */
import { expect, test, type Locator, type Page } from './support/test.js';
import { openApp } from './support/fixtures.js';
import {
  MANAGER_TOKEN,
  WORKER_REASON,
  WORKER_TOKEN,
  inactiveSwarmFixture,
  managerSwarmFixture,
  stubSwarmReading,
  workerSwarmFixture,
  type SwarmFixture,
  type SwarmStub,
} from './support/swarm-reading.js';

interface Viewport {
  width: number;
  height: number;
}

/** The three viewports this plan is written against. */
const VIEWPORTS: Viewport[] = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
  { width: 375, height: 812 },
];

function content(page: Page): Locator {
  return page.locator('.ui-frame__content');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function describeBox(box: Box): string {
  return `x=${round(box.x)}, y=${round(box.y)}, ${round(box.width)}×${round(box.height)}`;
}

/**
 * **What counts as a statement of the condition**, so that the number this file
 * reports means the same thing to the next reader as it does here.
 *
 * A statement is a **leaf element whose own text asserts, in words, that there is
 * no cluster to read**. Three consequences, each deliberate:
 *
 * - *leaf* — a container is not counted for what its children say, or every
 *   ancestor up to the content region would be a statement of its own;
 * - *asserts the condition* — a line that says what to do about it does not
 *   count. The empty state's description ("Initialise one to make this daemon the
 *   first manager…") is an instruction, not a sixth repetition of the fact;
 * - *in words* — a **tone or a state name is not an assertion**. The delivered
 *   state bar's title read `Swarm inactive`, which names the daemon's state
 *   without stating the condition, so it is **not** counted here.
 *
 * That last one is why this file reports **11** on the delivered build where
 * `swarm-screen.md` records 12: the spec counts the bar's title among the
 * elements saying it, this definition does not. The stricter of the two, and the
 * difference is one element in the *before* figure only — both agree the answer
 * after is **1**. The count **is** the requirement here (REQ-52), which is why it
 * is defined rather than left to a regular expression to imply.
 */
const CONDITION_PATTERN = /not part of a swarm|not a manager|only a manager|no cluster to read/i;

interface ConditionCount {
  /** One entry per leaf element stating it, with its text and its box. */
  elements: { text: string; box: Box }[];
  /** The surfaces those elements sit on: an empty state, or the state bar. */
  surfaces: number;
  emptyStates: number;
  stateBars: number;
  cards: number;
  lists: number;
  /** The lowest edge of anything the content region draws, so the screen's own length is comparable. */
  contentBottom: number;
}

async function measureCondition(page: Page): Promise<ConditionCount> {
  return await page.evaluate((pattern) => {
    const test = new RegExp(pattern, 'i');
    const region = document.querySelector('.ui-frame__content') as HTMLElement;
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const elements = [...region.querySelectorAll<HTMLElement>('*')]
      .filter((element) => element.children.length === 0 && test.test((element.textContent ?? '').trim()))
      .map((element) => ({ text: (element.textContent ?? '').replace(/\s+/g, ' ').trim(), box: box(element) }));

    const surfaces = new Set(
      [...region.querySelectorAll<HTMLElement>('*')]
        .filter((element) => element.children.length === 0 && test.test((element.textContent ?? '').trim()))
        .map((element) => element.closest('.ui-empty-state, .ui-state-summary-bar, .ui-surface'))
        .filter((surface): surface is Element => surface !== null),
    );

    const drawn = [...region.querySelectorAll<HTMLElement>('*')];
    const contentBottom = drawn.reduce((lowest, element) => {
      const rect = element.getBoundingClientRect();
      return rect.height > 0 ? Math.max(lowest, rect.bottom) : lowest;
    }, region.getBoundingClientRect().top);

    return {
      elements,
      surfaces: surfaces.size,
      emptyStates: region.querySelectorAll('.ui-empty-state').length,
      stateBars: region.querySelectorAll('.ui-state-summary-bar').length,
      cards: region.querySelectorAll('.ui-section-header__title').length,
      lists: region.querySelectorAll('.ui-data-table').length,
      contentBottom,
    };
  }, CONDITION_PATTERN.source);
}

interface CellGeometry {
  header: string;
  text: string;
  box: Box;
  /** Painted ink of this cell landing outside the row that holds it, in px. */
  outsideTheRow: number;
  lines: number;
}

interface RowGeometry {
  list: string;
  label: string;
  kind: 'row' | 'nested';
  box: Box;
  cells: CellGeometry[];
  inkPieces: number;
}

interface CardGeometry {
  title: string;
  box: Box;
  /**
   * Whether this panel's own heading is drawn **on a surface**, which is how the
   * two compositions on this screen tell themselves apart while the migration is
   * half done: an inventory converted to the one presentation puts its header
   * above the unpadded card holding its list
   * (`plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`),
   * and one still drawn the old way keeps it inside the card. Read from the tree
   * rather than from a list of panel names, so the checks below follow the
   * migration instead of having to be edited by it.
   */
  headerOnASurface: boolean;
  /** The card's own section header, and the top of the first thing drawn under it. */
  headerBox: Box | null;
  contentTop: number;
  /** Sublabels the header states — REQ-54's supposed cause, which this screen never used. */
  sublabels: number;
  /** Section headers drawn *inside* the card's body, which is what actually shifted the baseline. */
  innerEyebrows: number;
  listBox: Box | null;
  listClientWidth: number;
  listScrollWidth: number;
}

interface ScreenGeometry {
  contentColumn: number;
  cards: CardGeometry[];
  rows: RowGeometry[];
  lists: number;
  cardLists: number;
  quadPanelLayouts: number;
  grids: number;
  detailPanels: number;
}

/** The whole screen in one pass — so no two figures come from two layouts. */
async function measureScreen(page: Page): Promise<ScreenGeometry> {
  return await page.evaluate(() => {
    const region = document.querySelector('.ui-frame__content') as HTMLElement;
    const regionStyle = getComputedStyle(region);
    const contentColumn =
      region.clientWidth - Number.parseFloat(regionStyle.paddingLeft) - Number.parseFloat(regionStyle.paddingRight);

    const box = (element: Element): Box => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };

    const clip = (raw: DOMRect, from: Element | null): Box | null => {
      let { top, bottom, left, right } = raw;
      for (let node: Element | null = from; node !== null; node = node.parentElement) {
        const style = getComputedStyle(node);
        const owner = node.getBoundingClientRect();
        if (style.overflowX !== 'visible') {
          left = Math.max(left, owner.left);
          right = Math.min(right, owner.right);
        }
        if (style.overflowY !== 'visible') {
          top = Math.max(top, owner.top);
          bottom = Math.min(bottom, owner.bottom);
        }
      }
      if (right - left <= 0.5 || bottom - top <= 0.5) return null;
      return { x: left, y: top, width: right - left, height: bottom - top };
    };

    const paintedInk = (element: Element): Box[] => {
      const out: Box[] = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.nodeValue?.trim()) continue;
        range.selectNodeContents(node);
        for (const raw of Array.from(range.getClientRects())) {
          const clipped = clip(raw, node.parentElement);
          if (clipped) out.push(clipped);
        }
      }
      return out;
    };

    // A panel is named by **what it holds** rather than by the surface it used to
    // be: on a converted inventory the section header sits *above* the one
    // unpadded card holding its list
    // (`.../classic-table/REQ-40`), so `header.closest('.ui-surface')` resolves to
    // null and the panel would simply vanish from this enumeration. The panel is
    // the innermost region carrying both this header and a list — which is the
    // card itself on an inventory still drawn the old way. `surface` stays the
    // list's own card wherever there is one, so every figure about the surface
    // goes on being about the surface.
    const cards: CardGeometry[] = [];
    const headings = Array.from(region.querySelectorAll<HTMLElement>('.ui-section-header'));
    for (const header of headings) {
      let card: HTMLElement | null = header.parentElement;
      while (card !== null && card !== region && card.querySelector('.ui-data-table') === null) card = card.parentElement;
      if (card === null || card === region) continue;
      // Only a panel's *own* header: the first one drawn inside it. An eyebrow in
      // a body, or the header of a list nested in a row's detail, resolves to the
      // same panel and comes later, exactly as it did when the panel was a card.
      if (headings.find((candidate) => card!.contains(candidate)) !== header) continue;
      const title = (header.querySelector('.ui-section-header__title')?.textContent ?? '').trim();
      const headerRect = header.getBoundingClientRect();
      // The first element drawn under the header inside the same panel.
      const following = Array.from(card.querySelectorAll<HTMLElement>('*')).filter(
        (element) => !header.contains(element) && element.getBoundingClientRect().top >= headerRect.bottom - 0.5,
      );
      const contentTop = following.reduce(
        (highest, element) => Math.min(highest, element.getBoundingClientRect().top),
        Number.POSITIVE_INFINITY,
      );
      const list = card.querySelector('.ui-data-table');
      const surface = (list?.closest('.ui-surface') ?? card) as HTMLElement;
      cards.push({
        title,
        box: box(surface),
        headerOnASurface: header.closest('.ui-surface') !== null,
        headerBox: box(header),
        contentTop: Number.isFinite(contentTop) ? contentTop : headerRect.bottom,
        sublabels: header.querySelectorAll('.ui-section-header__sublabel').length,
        innerEyebrows: Array.from(card.querySelectorAll('.ui-section-header')).filter((inner) => inner !== header).length,
        listBox: list ? box(list) : null,
        listClientWidth: list ? (list as HTMLElement).clientWidth : 0,
        listScrollWidth: list ? (list as HTMLElement).scrollWidth : 0,
      });
    }

    const rows: RowGeometry[] = [];
    for (const row of Array.from(region.querySelectorAll<HTMLElement>('.ui-data-table__row'))) {
      const table = row.closest('.ui-data-table') as HTMLElement;
      // The panel a row belongs to, named by the last heading drawn before its
      // table: a converted list's card holds the table and nothing else, its
      // section header sitting above it (`.../classic-table/REQ-40`), so the name
      // is no longer inside the surface. Failures name the list either way.
      const card = table.closest('.ui-surface');
      const preceding = headings.filter(
        (heading) => (heading.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      );
      const listName = (
        card?.querySelector('.ui-section-header__title')?.textContent ??
        preceding[preceding.length - 1]?.querySelector('.ui-section-header__title')?.textContent ??
        'list'
      ).trim();
      const nested = row.closest('.ui-data-table__row-content') !== null;
      const headers = Array.from(table.querySelectorAll<HTMLElement>('.ui-data-table__header-cell')).map((cell) =>
        (cell.textContent ?? '').trim(),
      );
      const rowBox = row.getBoundingClientRect();
      const cells = Array.from(row.querySelectorAll<HTMLElement>('.ui-data-table__cell')).filter(
        (cell) => cell.closest('.ui-data-table__row') === row,
      );
      let inkPieces = 0;
      const measured = cells.map((cell, index) => {
        const ink = paintedInk(cell);
        inkPieces += ink.length;
        const outside = ink.reduce(
          (total, rect) =>
            total +
            Math.max(0, rect.x + rect.width - rowBox.right) +
            Math.max(0, rowBox.left - rect.x) +
            Math.max(0, rect.y + rect.height - rowBox.bottom) +
            Math.max(0, rowBox.top - rect.y),
          0,
        );
        return {
          header: headers[index] ?? `#${index}`,
          text: (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
          box: box(cell),
          outsideTheRow: outside,
          lines: cell.querySelectorAll(
            '.ui-table-two-line-cell__title, .ui-table-two-line-cell__subtitle, .ui-table-meta-cell, .ui-table-badge-list-cell',
          ).length,
        };
      });
      rows.push({
        list: listName,
        label: (row.querySelector('.ui-table-two-line-cell__title')?.textContent ?? row.textContent ?? '').trim().slice(0, 40),
        kind: nested ? 'nested' : 'row',
        box: { x: rowBox.x, y: rowBox.y, width: rowBox.width, height: rowBox.height },
        cells: measured,
        inkPieces,
      });
    }

    return {
      contentColumn,
      cards,
      rows,
      lists: region.querySelectorAll('.ui-data-table').length,
      cardLists: region.querySelectorAll('.ui-card-list').length,
      quadPanelLayouts: region.querySelectorAll('.ui-quad-panel-layout').length,
      grids: region.querySelectorAll('.ui-grid').length,
      detailPanels: region.querySelectorAll('.ui-detail-panel').length,
    };
  });
}

interface PanelGeometry {
  panels: number;
  closeControls: number;
  panel: Box | null;
  /** The list the open panel belongs to, so "one at a time" can be said of five lists. */
  list: string | null;
  bands: { label: string; x: number; y: number; width: number; valueWidth: number }[];
  /** Rows of a list nested inside the panel — a service's tasks. */
  nestedRows: number;
  text: string;
}

async function measurePanel(page: Page): Promise<PanelGeometry> {
  return await page.evaluate(() => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const region = document.querySelector('.ui-frame__content') as HTMLElement;
    const panel = region.querySelector('.ui-detail-panel');
    // Which list the open panel belongs to, named by **the heading of the region
    // holding it** rather than by a surface carrying one: a converted list's card
    // holds the table alone, its section header above it
    // (`.../classic-table/REQ-40`), and an unconverted one puts every row on a
    // surface of its own — so neither the nearest surface nor a surface with a
    // header of its own answers this on both. The innermost region carrying both a
    // heading and this panel does, on either.
    // A heading **outside the panel itself**: a service's panel labels its own
    // nested tasks list with an eyebrow header, so the first heading found
    // walking up would be the panel's own and every panel would report "Tasks".
    const headingOutside = (candidate: Element): boolean =>
      Array.from(candidate.querySelectorAll('.ui-section-header__title')).some((title) => panel === null || !panel.contains(title));
    let owner: Element | null = panel?.parentElement ?? null;
    while (owner !== null && owner !== region && !headingOutside(owner)) {
      owner = owner.parentElement;
    }
    return {
      panels: region.querySelectorAll('.ui-detail-panel').length,
      closeControls: region.querySelectorAll('.ui-detail-panel [aria-label="Close detail"]').length,
      panel: panel ? box(panel) : null,
      list:
        owner !== null && owner !== region
          ? (
              Array.from(owner.querySelectorAll('.ui-section-header__title')).find(
                (title) => panel === null || !panel.contains(title),
              )?.textContent ?? ''
            ).trim()
          : null,
      bands: panel
        ? Array.from(panel.querySelectorAll<HTMLElement>('.ui-definition-list__row')).map((band) => {
            const rect = band.getBoundingClientRect();
            const value = band.querySelector('.ui-definition-list__value');
            return {
              label: (band.querySelector('.ui-definition-list__label')?.textContent ?? '').trim(),
              x: rect.x,
              y: rect.y,
              width: rect.width,
              valueWidth: value ? value.getBoundingClientRect().width : 0,
            };
          })
        : [],
      nestedRows: panel ? panel.querySelectorAll('.ui-data-table__row').length : 0,
      text: (panel?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    };
  });
}

/** The screen, at `viewport`, with the stubbed reading drawn. */
async function openScreen(page: Page, viewport: Viewport, fixture: SwarmFixture): Promise<SwarmStub> {
  await page.setViewportSize(viewport);
  const stub = await stubSwarmReading(page, fixture);
  await openApp(page, 'swarm');
  await expect(page.getByRole('heading', { level: 1, name: 'Swarm' })).toBeVisible({ timeout: 20_000 });
  // **The shell's own connection probe is waited out first.** It starts
  // unreachable and settles asynchronously, so a screen read the instant its
  // heading appears is read under a `Daemon unreachable` banner the shell drew
  // and is about to remove — which is a control, a surface and some height that
  // belong to this runner's timing and not to the screen. Measured without this
  // wait, every viewport reported a `Retry` control the statement does not carry.
  await expect(
    content(page).locator('.ui-error-banner').filter({ hasText: 'Daemon unreachable' }),
    'the application could not reach the daemon, so nothing below measures the screen',
  ).toHaveCount(0, { timeout: 30_000 });
  // Waited for on whichever half the fixture produces: a screen still being read
  // is not a screen with nothing to show, and measuring the first would measure
  // this runner's timing.
  if (fixture.state.manager === true) {
    await expect(content(page).getByRole('heading', { level: 2, name: 'Stacks' })).toBeVisible({ timeout: 20_000 });
    await expect(content(page).locator('.ui-data-table__row').first()).toBeVisible({ timeout: 20_000 });
  } else {
    await expect(content(page).locator('.ui-empty-state__description')).toBeVisible({ timeout: 20_000 });
  }
  return stub;
}

/**
 * One inventory of this screen, by the section header titling it.
 *
 * Named by **what it holds** rather than by the surface it used to be: a
 * converted panel's section header sits above the one unpadded card holding its
 * list (`.../classic-table/REQ-40`), so a card can no longer be found by the
 * heading it used to hold. A panel is the innermost region carrying both the
 * heading and a list; every region matching contains the same heading and is
 * therefore an ancestor of the next, so the last in document order is the
 * panel's own — and on an inventory still drawn the old way that is its card.
 */
function panelTitled(page: Page, title: string): Locator {
  return content(page)
    .locator('.ui-stack, .ui-surface')
    .filter({ has: page.getByRole('heading', { level: 2, name: title, exact: true }) })
    .filter({ has: page.locator('.ui-data-table') })
    .last();
}

/** A real pointer at the visible control's own coordinates — never `element.click()`. */
async function clickAtItsOwnCentre(page: Page, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * A row is selected on its **first cell**: below the desktop breakpoint the row
 * is wider than the box it is read in, so its own centre can sit over another
 * column — or over a control.
 */
function firstCellOf(page: Page, listTitle: string, index: number): Locator {
  return panelTitled(page, listTitle)
    .locator('.ui-data-table__row')
    .nth(index)
    .locator('.ui-data-table__cell')
    .first();
}

test.describe('F12 — the swarm screen outside a swarm, which is what the analysis measured', () => {
  for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}×${viewport.height}`;

    // REQ-52 — "**One fact is stated once.** The delivered screen states 'this daemon is not part of
    // a swarm' five times: once in the banner and once in each of four cards. After this change the
    // inactive-swarm condition is stated once, on one surface." swarm-screen.md pins the delivered
    // figure at **12 elements over 6 surfaces**, and the figure after at **1**.
    test(`the inactive condition is stated by exactly one element, on one surface — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport, inactiveSwarmFixture());

      const measured = await measureCondition(page);
      console.log(
        `[REQ-52] ${at}: ${measured.elements.length} element(s) over ${measured.surfaces} surface(s) state the condition — ` +
          measured.elements.map((element) => `"${element.text.slice(0, 60)}" ${describeBox(element.box)}`).join(' | '),
      );
      console.log(
        `[REQ-52] ${at}: ${measured.emptyStates} empty state(s), ${measured.stateBars} state bar(s), ` +
          `${measured.cards} card(s), ${measured.lists} list(s); the inactive screen ends at y=${round(measured.contentBottom)}`,
      );

      expect(measured.elements.length, `${at}: the condition is stated by more than one element`).toBe(1);
      expect(measured.surfaces, `${at}: the condition is stated on more than one surface`).toBe(1);
      expect(measured.emptyStates, `${at}: more than one empty state is drawn`).toBe(1);

      // The bar exists to qualify a state with facts; a daemon in no swarm has none to qualify, and
      // drawing it there is what made the condition's fifth and sixth statements.
      expect(measured.stateBars, `${at}: the state bar is drawn where there is no state to qualify`).toBe(0);
      // …and no panel is drawn at all, so none can repeat it.
      expect(measured.cards, `${at}: an inventory card is drawn where there is no cluster to read`).toBe(0);
      expect(measured.lists, `${at}: a list is drawn where there is no cluster to read`).toBe(0);
    });

    // REQ-53 — "The actions that resolve the condition sit with the statement of it. `Initialise a
    // swarm` and `Join an existing one` belong to the empty state that explains the condition, not to
    // a banner above four empty states that repeat it." Asserted as **containment of one box in
    // another**, and then as a real hit test: a control listed inside a surface it is drawn outside of
    // would satisfy the DOM and not the operator.
    test(`both resolving actions are drawn inside the statement, and hit-test to themselves — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport, inactiveSwarmFixture());

      const geometry = await page.evaluate(() => {
        const box = (element: Element) => {
          const rect = element.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        };
        const statement = document.querySelector('.ui-frame__content .ui-empty-state') as HTMLElement;
        const controls = Array.from(statement.querySelectorAll<HTMLElement>('button')).map((button) => ({
          label: (button.textContent ?? '').trim(),
          box: box(button),
        }));
        // Every control the content region draws, so an action drawn outside the statement is caught
        // rather than merely absent from the list above.
        const all = Array.from(document.querySelectorAll<HTMLElement>('.ui-frame__content button')).map((button) => ({
          label: (button.textContent ?? '').trim(),
          insideTheStatement: statement.contains(button),
        }));
        return { statement: box(statement), controls, all };
      });

      console.log(
        `[REQ-53] ${at}: statement ${describeBox(geometry.statement)}; controls ` +
          geometry.controls.map((control) => `${control.label} ${describeBox(control.box)}`).join(' + ') +
          `; every control the content region draws ${JSON.stringify(geometry.all)}`,
      );

      expect(
        geometry.controls.map((control) => control.label),
        `${at}: the statement does not carry the two actions that resolve it`,
      ).toEqual(['Initialise a swarm', 'Join an existing one']);
      // …and **no way into a swarm is offered anywhere else**: the bar that used to carry the pair
      // above five repetitions of the condition leaves nothing behind. Restricted to the controls
      // that could resolve the condition, since the shell draws controls of its own in this region
      // and they are not this screen's.
      const elsewhere = geometry.all.filter(
        (control) => !control.insideTheStatement && /initialise|join|swarm/i.test(control.label),
      );
      expect(
        elsewhere.map((control) => control.label),
        `${at}: a way into a swarm is offered outside the statement of the condition`,
      ).toEqual([]);

      for (const control of geometry.controls) {
        expect(control.box.y, `${at}: ${control.label} is drawn above the statement it belongs to`).toBeGreaterThanOrEqual(
          geometry.statement.y - 0.5,
        );
        expect(
          control.box.y + control.box.height,
          `${at}: ${control.label} is drawn below the statement it belongs to`,
        ).toBeLessThanOrEqual(geometry.statement.y + geometry.statement.height + 0.5);
        expect(control.box.x, `${at}: ${control.label} is drawn left of the statement it belongs to`).toBeGreaterThanOrEqual(
          geometry.statement.x - 0.5,
        );
      }

      // The rect and the hit test are taken in one tick: read as two, the probe races whatever
      // scrolling the measurement started.
      const hits = await page.evaluate((height) => {
        const statement = document.querySelector('.ui-frame__content .ui-empty-state') as HTMLElement;
        return Array.from(statement.querySelectorAll<HTMLElement>('button')).map((button) => {
          const rect = button.getBoundingClientRect();
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          const hit = document.elementFromPoint(x, y)?.closest('button');
          return {
            label: (button.textContent ?? '').trim(),
            x,
            y,
            insideTheViewport: y > 0 && y < height,
            hit: (hit?.textContent ?? 'nothing').trim(),
          };
        });
      }, viewport.height);

      for (const control of hits) {
        console.log(`[REQ-53] ${at}: ${control.label} probed at (${round(control.x)}, ${round(control.y)}) hits "${control.hit}"`);
        expect(control.insideTheViewport, `${at}: ${control.label} is drawn outside the viewport`).toBe(true);
        expect(control.hit, `${at}: ${control.label} is not reachable at its own centre`).toBe(control.label);
      }
    });

    // REQ-53 — "Both actions still perform exactly what they perform today", which is the two forms.
    // Driven with a real pointer, and **nothing is submitted**: the two routes that would reconfigure
    // the daemon are aborted in the page.
    test(`each action opens the form it opened before, and neither reaches the daemon — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      const stub = await openScreen(page, viewport, inactiveSwarmFixture());

      await clickAtItsOwnCentre(page, content(page).getByRole('button', { name: 'Initialise a swarm' }));
      const dialog = page.locator('.ui-modal');
      await expect(dialog, `${at}: Initialise a swarm opened no form`).toBeVisible({ timeout: 20_000 });
      await expect(dialog.getByRole('heading', { name: 'Initialise swarm' })).toBeVisible();
      await expect(dialog.getByLabel('Advertise address')).toBeVisible();
      await clickAtItsOwnCentre(page, dialog.getByRole('button', { name: 'Cancel' }));
      await expect(dialog).toHaveCount(0);

      await clickAtItsOwnCentre(page, content(page).getByRole('button', { name: 'Join an existing one' }));
      await expect(dialog, `${at}: Join an existing one opened no form`).toBeVisible({ timeout: 20_000 });
      await expect(dialog.getByRole('heading', { name: 'Join swarm' })).toBeVisible();
      await expect(dialog.getByLabel('Manager address')).toBeVisible();

      // REQ-80, swarm-screen.md — "the join token (entered masked, never displayed back)": a masked
      // field with **no** reveal control, dropped with the form whichever way it closed.
      const token = dialog.getByLabel('Join token');
      await expect(token).toHaveAttribute('type', 'password');
      const reveals = await dialog.getByRole('button', { name: /show|reveal/i }).count();
      const copies = await dialog.getByRole('button', { name: /copy/i }).count();
      console.log(`[REQ-80] ${at}: the join form offers ${reveals} reveal control(s) and ${copies} copy control(s)`);
      expect(reveals, `${at}: the join token can be revealed in the form it is typed into`).toBe(0);
      expect(copies, `${at}: the join form offers a copy control`).toBe(0);

      await token.fill('SWMTKN-1-e2e-typed-never-submitted');
      await clickAtItsOwnCentre(page, dialog.getByRole('button', { name: 'Cancel' }));
      await expect(dialog).toHaveCount(0);
      expect(await page.content(), `${at}: the typed join token outlived the form`).not.toContain('SWMTKN-1-e2e-typed-never-submitted');

      expect(stub.mutations(), `${at}: opening a form reached the daemon`).toEqual([]);
    });
  }

  // REQ-52's other half — "in a swarm but not on a manager ...: 'No cluster to read from here' with
  // the daemon's **own** reason where it gave one, and **no** action — nothing on this screen
  // promotes a node." One statement again, this time beside a bar that has a state to qualify.
  test('a worker states its condition once, in the daemon’s own words, with no action', async ({ page }) => {
    test.setTimeout(120_000);
    await openScreen(page, VIEWPORTS[0], workerSwarmFixture());

    const measured = await measureCondition(page);
    console.log(
      `[REQ-52] worker: ${measured.elements.length} element(s) over ${measured.surfaces} surface(s) — ` +
        measured.elements.map((element) => `"${element.text.slice(0, 70)}"`).join(' | '),
    );

    expect(measured.emptyStates, 'a worker draws more than one statement surface').toBe(1);
    expect(measured.surfaces, 'a worker states its condition on more than one surface').toBe(1);
    expect(measured.cards, 'an inventory card is drawn on a worker').toBe(0);
    // The bar is drawn here: a worker has a state to qualify, and it qualifies it with facts rather
    // than restating the condition.
    expect(measured.stateBars, 'the state bar is not drawn where there is a state to qualify').toBe(1);

    await expect(content(page).getByText('No cluster to read from here')).toBeVisible();
    await expect(content(page).getByText(WORKER_REASON), 'the daemon’s own sentence was replaced by a generic one').toBeVisible();
    const statementControls = await content(page).locator('.ui-empty-state button, .ui-empty-state a').count();
    expect(statementControls, 'the worker’s statement offers an action, and nothing here promotes a node').toBe(0);
  });
});

test.describe('F12 — the cluster’s inventories, on a stubbed manager (REQ-55)', () => {
  for (const viewport of VIEWPORTS) {
    const at = `${viewport.width}×${viewport.height}`;

    // REQ-55 — "Swarm's lists use the object-list primitive"; swarm-screen.md — "The two-by-two grid
    // is deleted and the inventories are stacked, each at the content column's full width",
    // `QuadPanelLayout` leaving the client with them.
    test(`the five inventories are stacked object lists at the content column's full width — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport, managerSwarmFixture());

      const screen = await measureScreen(page);
      console.log(
        `[REQ-55] ${at}: content column ${round(screen.contentColumn)}px; cards ` +
          screen.cards.map((card) => `${card.title} ${describeBox(card.box)}`).join(', '),
      );

      expect(
        screen.cards.map((card) => card.title),
        `${at}: the screen does not draw the five inventories, each in a card of its own`,
      ).toEqual(['Nodes', 'Services & tasks', 'Secrets', 'Configs', 'Stacks']);
      expect(screen.lists, `${at}: the five inventories are not all on the object list`).toBeGreaterThanOrEqual(5);
      expect(screen.cardLists, `${at}: a hand-built card list is still drawn on this screen`).toBe(0);
      expect(screen.quadPanelLayouts, `${at}: the two-by-two grid is still laying the panels out`).toBe(0);
      expect(screen.grids, `${at}: a Grid still lays something out beside a list`).toBe(0);
      expect(screen.detailPanels, `${at}: a detail is open before anything was selected`).toBe(0);

      // Stacked: one left edge, one width, each below the last, at the column's full width.
      const [first, ...rest] = screen.cards;
      for (const card of rest) {
        expect(round(card.box.x), `${at}: the ${card.title} card is not on the one left edge`).toBe(round(first!.box.x));
        expect(round(card.box.width), `${at}: the ${card.title} card does not share the one width`).toBe(round(first!.box.width));
      }
      for (const card of screen.cards) {
        expect(
          round(card.box.width),
          `${at}: the ${card.title} card is ${round(card.box.width)}px of a ${round(screen.contentColumn)}px content column`,
        ).toBeGreaterThanOrEqual(round(screen.contentColumn) - 1);
      }
    });

    // REQ-54, read where the migration actually leaves it: the bottom row is gone with the pair, and
    // what replaces the guarantee is that **every card carries one section header and starts its
    // content 0px under it** (swarm-configs-stacks-panel.md), with every header the same height. The
    // delivered offset — `Secrets`' empty state at y=650.6 against `Configs & stacks`' at y=676.0,
    // 25.4px — came from a `SectionHeader variant="eyebrow"` inside the card body, which one card per
    // inventory removes outright. **No sublabel is supplied anywhere on this screen.**
    test(`every card starts its content the same distance under its own header — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport, managerSwarmFixture());

      const screen = await measureScreen(page);
      const gaps = screen.cards.map((card) => ({
        title: card.title,
        headerHeight: round(card.headerBox!.height),
        gap: round(card.contentTop - (card.headerBox!.y + card.headerBox!.height)),
        sublabels: card.sublabels,
        innerEyebrows: card.innerEyebrows,
        converted: !card.headerOnASurface,
      }));
      for (const gap of gaps) {
        console.log(
          `[REQ-54] ${at} ${gap.title}: header ${gap.headerHeight}px, content starts ${gap.gap}px under it, ` +
            `${gap.sublabels} sublabel(s), ${gap.innerEyebrows} header(s) inside the body, ` +
            `${gap.converted ? 'header above its card' : 'header inside its card'}`,
        );
      }

      expect(gaps.every((gap) => gap.sublabels === 0), `${at}: a card states a header sublabel`).toBe(true);
      expect(
        gaps.filter((gap) => gap.innerEyebrows > 0).map((gap) => gap.title),
        `${at}: a card labels a list inside its own body, which is what shifted the baseline`,
      ).toEqual([]);

      // **The claim is unchanged; the population it is quantified over is stated.**
      // What REQ-54 protects is that no inventory's content sits at a different
      // distance under its heading from its neighbours' *for a reason of its own*
      // — the cause it was written against being a `SectionHeader
      // variant="eyebrow"` inside one card's body, asserted absent above. This
      // screen carried **two compositions at once** while
      // `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-40`
      // was half delivered — three inventories converted in that plan's batch 2
      // and the last two, `Configs` and `Stacks`, in its batch 3 — a converted
      // inventory's heading sitting above the card holding its list, which is a
      // different rhythm from a heading inside one, 0px having been the second's
      // value. So the equality is asserted **within each composition**, which is
      // where "the same distance" is a statement about layout rather than about
      // how far the migration has got. The grouping is read from the tree and not
      // from a list of panel names, so the two groups became one with batch 3 and
      // this assertion needed no edit for it; the one below, which held the
      // retired composition to the value it was certified at, is now unreachable
      // and states so rather than being deleted with the cover it gave.
      const compositions = [
        { name: 'header above its card', members: gaps.filter((gap) => gap.converted) },
        { name: 'header inside its card', members: gaps.filter((gap) => !gap.converted) },
      ].filter((composition) => composition.members.length > 0);
      expect(compositions.length, `${at}: no inventory was measured at all`).toBeGreaterThan(0);
      for (const composition of compositions) {
        const distinct = [...new Set(composition.members.map((gap) => gap.gap))];
        expect(
          distinct.length,
          `${at}: the inventories drawn with the ${composition.name} start their content at ${JSON.stringify(
            composition.members.map((gap) => `${gap.title} ${gap.gap}px`),
          )} under their headers`,
        ).toBe(1);
      }
      // …and there is one composition on this screen, which is what the last two
      // inventories converting means. The branch that held the retired one to the
      // value it was certified at is kept and made an assertion of: an inventory
      // reverting to a header inside its card is a failure here, where it used to
      // be a second population.
      expect(
        compositions.map((composition) => composition.name),
        `${at}: the inventories are drawn in ${compositions.length} compositions at once, where REQ-40 leaves one`,
      ).toEqual(['header above its card']);

      // …and every header is one height, which is what "side-by-side headers share a baseline"
      // becomes once the row itself is a stack — **at the two desktop widths**, which is where
      // swarm-screen.md states the figure (46px). At 375×812 nothing is side by side at all and a
      // header's own description wraps according to its length, so requiring one height there would
      // be a rule about copy rather than about layout.
      const headerHeights = [...new Set(gaps.map((gap) => gap.headerHeight))];
      if (viewport.width >= 1280) {
        expect(
          headerHeights.length,
          `${at}: the section headers are ${JSON.stringify(gaps.map((gap) => `${gap.title} ${gap.headerHeight}px`))} tall`,
        ).toBe(1);
      }
    });

    // The four panel specs — "Every cell of a row is a fixed number of lines whatever the object is
    // ... Every row of both levels is the reference's own height."
    //
    // **The 59.39px recorded for a row was the retired presentation's and is superseded** (batches 2
    // and 3 of `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table`, REQ-39);
    // the nested row's 56px was already the reference's. What is asserted here is the claim itself —
    // one height per list, whatever a row carries — and the equality with the containers and images
    // rows is measured where those are read in the same run
    // (`classic-table-criteria-nested-lists.spec.ts`), never against a figure copied into a spec.
    test(`every row of every list is one height, with nothing painted past a row — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport, managerSwarmFixture());

      const screen = await measureScreen(page);
      for (const row of screen.rows) {
        console.log(
          `[REQ-55] ${at} ${row.list} ${row.kind} "${row.label}": ${describeBox(row.box)} — ` +
            row.cells.map((cell) => `${cell.header || '(cell)'}="${cell.text}" ${round(cell.box.width)}px/${cell.lines} line(s)`).join(' | '),
        );
      }

      // **The claim is "a row's height does not depend on what that row carries",
      // and it is a claim about one list.** It used to be asserted over every row
      // on the screen at once, which was the same thing while all five
      // inventories were drawn one way. It became a statement about how far the
      // migration had got while
      // `plan-ui-coherence-optimisation-comfortable_variant_retired-classic_table/REQ-20`
      // was half delivered — three inventories the containers row, two not yet —
      // and per list it is in any case the stronger reading of the two: it fails
      // on one list whose rows disagree even if the screen's other four agree.
      // The **equality across the lists** is asserted below, over the population
      // read from the tree, which since that plan's batch 3 is all five of them.
      for (const kind of ['row', 'nested'] as const) {
        const rows = screen.rows.filter((row) => row.kind === kind);
        expect(rows.length, `${at}: no ${kind} row was measured, so this comparison shows nothing`).toBeGreaterThan(1);
        const lists = [...new Set(rows.map((row) => row.list))];
        console.log(
          `[REQ-55] ${at}: ${rows.length} ${kind} row(s) over ${lists.length} list(s) — ` +
            lists
              .map((list) => `${list} ${JSON.stringify([...new Set(rows.filter((row) => row.list === list).map((row) => round(row.box.height)))])}`)
              .join(', '),
        );
        for (const list of lists) {
          const heights = [...new Set(rows.filter((row) => row.list === list).map((row) => round(row.box.height)))];
          expect(
            heights.length,
            `${at}: the ${kind} rows of ${list} are ${JSON.stringify(heights)}px tall — a row's height still depends on what it carries`,
          ).toBe(1);
        }
      }
      // …and the inventories converted to the one presentation share **one** row
      // with each other, which is what REQ-39 asks of them and is read here from
      // the tree rather than from a list of names: a panel is converted when its
      // heading is not on a surface.
      const convertedLists = new Set(screen.cards.filter((card) => !card.headerOnASurface).map((card) => card.title));
      const convertedHeights = [
        ...new Set(screen.rows.filter((row) => row.kind === 'row' && convertedLists.has(row.list)).map((row) => round(row.box.height))),
      ];
      console.log(`[REQ-55] ${at}: the converted inventories (${[...convertedLists].join(', ')}) draw rows ${JSON.stringify(convertedHeights)}px tall`);
      expect(convertedLists.size, `${at}: no inventory on this screen is drawn in the one presentation`).toBeGreaterThan(0);
      expect(
        convertedHeights.length,
        `${at}: the converted inventories draw rows of ${JSON.stringify(convertedHeights)}px, so they are not one row`,
      ).toBe(1);

      // The premise: the fixture really does differ in the values that used to share a subtitle line,
      // or one height proves nothing.
      const cellText = (list: string, label: string) =>
        screen.rows.find((row) => row.list === list && row.label.startsWith(label))!.cells.map((cell) => cell.text).join(' | ');
      expect(cellText('Nodes', 'vexel-e2e-worker-down'), `${at}: the daemon's own message about a node is not stated`).toContain(
        'heartbeat failure',
      );
      expect(cellText('Nodes', 'vexel-e2e-worker-plain'), `${at}: a healthy node states a message anyway`).toMatch(/[-–—]/);
      expect(cellText('Services & tasks', 'vexel-e2e-api'), `${at}: a published port is not stated`).toContain('8080');
      expect(cellText('Services & tasks', 'vexel-e2e-agent'), `${at}: a service publishing nothing states a port`).not.toContain('8080');

      // …and each of them is its own column, one line, on every row.
      for (const row of screen.rows) {
        for (const cell of row.cells.filter((candidate) => candidate.lines > 0)) {
          expect(cell.lines, `${at}: ${row.list} · ${row.label} draws ${cell.lines} lines in its ${cell.header} cell`).toBe(1);
        }
      }

      // Nothing paints outside the row that holds it: below the desktop widths the list pans, and a
      // column that does not fit is panned to rather than spilled.
      const spilling = screen.rows.flatMap((row) =>
        row.cells
          .filter((cell) => cell.outsideTheRow > 1)
          .map((cell) => `${row.list} ${row.label} ${cell.header}: ${round(cell.outsideTheRow)}px painted outside the row`),
      );
      const inkPieces = screen.rows.reduce((total, row) => total + row.inkPieces, 0);
      console.log(`[REQ-55] ${at}: ${inkPieces} painted text(s) over ${screen.rows.length} row(s), ${spilling.length} spilling`);
      expect(inkPieces, `${at}: no painted text was measured, so this comparison shows nothing`).toBeGreaterThan(0);
      expect(spilling, `${at}: a value is painted outside the row that holds it`).toEqual([]);
    });

    // REQ-55 — "its detail the detail-panel primitive"; swarm-screen.md records the width the stack
    // buys: "stacked, the panel is **1012 / 852 / 229px**", against 482 / 362 / 227 inside the grid.
    test(`a node's detail opens on the panel at the list's own width — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport, managerSwarmFixture());

      const before = await measureScreen(page);
      await clickAtItsOwnCentre(page, firstCellOf(page, 'Nodes', 0));
      await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });

      const panel = await measurePanel(page);
      const after = await measureScreen(page);
      const nodes = after.cards.find((card) => card.title === 'Nodes')!;
      console.log(
        `[REQ-55] ${at}: node panel ${describeBox(panel.panel!)} inside a ${round(nodes.listClientWidth)}px list ` +
          `(card ${round(nodes.box.width)}px of a ${round(after.contentColumn)}px content column)`,
      );

      expect(panel.panels, `${at}: the row opened no detail panel`).toBe(1);
      expect(
        round(panel.panel!.width),
        `${at}: the panel is ${round(panel.panel!.width)}px inside a ${round(nodes.listClientWidth)}px list`,
      ).toBeGreaterThanOrEqual(round(nodes.listClientWidth) * 0.75);
      expect(round(panel.panel!.width), `${at}: the panel is wider than the box the list is read in`).toBeLessThanOrEqual(
        round(nodes.listClientWidth) + 0.5,
      );
      expect(panel.panel!.x, `${at}: the panel is drawn off the left edge of the viewport`).toBeGreaterThanOrEqual(-0.5);
      expect(round(before.cards[0]!.box.width), `${at}: opening a panel changed the list's own width`).toBe(round(nodes.box.width));

      // swarm-nodes-panel.md — the full value of anything the row omits is in the panel.
      expect(
        panel.bands.map((band) => band.label),
        `${at}: the node's panel does not state the properties its spec lists`,
      ).toEqual(['Node id', 'Hostname', 'Address', 'Engine', 'Platform', 'Reachability', 'Status', 'Labels']);

      // The grid derives its column count from its own width against the content class the caller
      // states — `long-single-line` here, for 56–60 character single-line values — so on these panels
      // it resolves **one** column, and the caller states no count of its own.
      const tops = [...new Set(panel.bands.map((band) => Math.round(band.y)))];
      const columns = Math.max(...tops.map((top) => panel.bands.filter((band) => Math.round(band.y) === top).length));
      console.log(`[REQ-55] ${at}: ${panel.bands.length} band(s) over ${tops.length} line(s), ${columns} column(s)`);
      const starved = panel.bands.filter((band) => band.valueWidth <= 1).map((band) => band.label);
      expect(starved, `${at}: a property value is in the DOM and nowhere on screen`).toEqual([]);
    });

    // swarm-services-panel.md — "**A task is listed, not described.** The tasks of the opened service
    // are rows of the same object list the screen lists everything else with."
    test(`a service's detail carries its tasks as rows of a list of their own — ${at}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openScreen(page, viewport, managerSwarmFixture());

      await clickAtItsOwnCentre(page, firstCellOf(page, 'Services & tasks', 0));
      await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('.ui-detail-panel .ui-data-table__row').first()).toBeVisible({ timeout: 20_000 });

      const panel = await measurePanel(page);
      console.log(`[REQ-55] ${at}: service panel ${describeBox(panel.panel!)} with ${panel.nestedRows} task row(s)`);
      expect(panel.nestedRows, `${at}: the opened service's tasks are not rows of a list`).toBe(2);
      expect(panel.text, `${at}: the daemon's message about a failed task is not stated`).toContain('no suitable node');
      expect(
        panel.bands.map((band) => band.label),
        `${at}: a task was stated as a property band rather than as a row`,
      ).not.toContain('Tasks');
    });
  }

  // detail-panel.md — "at most one detail panel is open anywhere in the interface", and in the
  // `opening-gesture` presentation "the panel presents **no** close control … `Escape` calls
  // `onClose` instead". Driven **across five independent lists**, which is the case this screen
  // makes and no other does: four components, five lists, one panel.
  test('one detail is open at a time across all five lists, with no close control, closed by Escape', async ({ page }) => {
    test.setTimeout(180_000);
    await openScreen(page, VIEWPORTS[0], managerSwarmFixture());

    // Every list that reveals a detail. A stack's services are carried by the row itself rather than
    // by a selection (swarm-configs-stacks-panel.md), so `Stacks` is not one of them.
    const lists = ['Nodes', 'Services & tasks', 'Secrets', 'Configs'];
    const opened: string[] = [];

    for (const list of lists) {
      await clickAtItsOwnCentre(page, firstCellOf(page, list, 0));
      await expect(page.locator('.ui-detail-panel'), `${list}: selecting a row opened no panel`).toHaveCount(1, { timeout: 20_000 });
      const panel = await measurePanel(page);
      opened.push(`${list} → ${panel.list} (${round(panel.panel!.width)}px)`);
      expect(panel.closeControls, `${list}: the panel presents a close control of its own`).toBe(0);
      expect(panel.list, `${list}: the panel opened under another list`).toBe(list);
    }
    console.log(`[REQ-55] one panel across five lists: ${opened.join('; ')}`);

    // The panel that is open is the last list's, and no earlier one survived beside it.
    expect(await page.locator('.ui-detail-panel').count(), 'a panel of an earlier list survived beside the new one').toBe(1);

    // The row that opened it closes it…
    await clickAtItsOwnCentre(page, firstCellOf(page, 'Configs', 0));
    await expect(page.locator('.ui-detail-panel'), 'the open row left its panel open').toHaveCount(0, { timeout: 20_000 });

    // …and so does Escape.
    await clickAtItsOwnCentre(page, firstCellOf(page, 'Secrets', 0));
    await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('.ui-detail-panel'), 'Escape left the panel open').toHaveCount(0, { timeout: 20_000 });
  });

  // REQ-84 / swarm-secrets-panel.md — "**Nothing in this panel ever shows a secret's value**: there
  // is no reveal affordance, no request that could return one, and no column and no property carrying
  // one"; the same discipline for a config's content. Checked on the markup, which is where a value
  // would have to appear first, and on every answer the browser received.
  test('an opened secret and an opened config state metadata alone, and say the value is never displayed', async ({ page }) => {
    test.setTimeout(180_000);
    const bodies: string[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/api/swarm')) {
        void response
          .text()
          .then((text) => bodies.push(text))
          .catch(() => undefined);
      }
    });
    await openScreen(page, VIEWPORTS[0], managerSwarmFixture());

    for (const [list, id] of [
      ['Secrets', 'e2esec1'],
      ['Configs', 'e2ecfg1'],
    ] as const) {
      await clickAtItsOwnCentre(page, firstCellOf(page, list, 0));
      await expect(page.locator('.ui-detail-panel')).toHaveCount(1, { timeout: 20_000 });
      const panel = await measurePanel(page);
      console.log(`[REQ-84] ${list}: bands ${JSON.stringify(panel.bands.map((band) => band.label))}`);
      expect(panel.text, `${list}: the opened object does not state its id`).toContain(id);
      expect(panel.text, `${list}: nothing says the value is never displayed`).toMatch(/never displayed|cannot be read|not read/i);
      const reveals = await page.locator('.ui-detail-panel').getByRole('button', { name: /show|reveal|copy/i }).count();
      expect(reveals, `${list}: the opened object offers a reveal or a copy control`).toBe(0);
      await page.keyboard.press('Escape');
      await expect(page.locator('.ui-detail-panel')).toHaveCount(0, { timeout: 20_000 });
    }

    // Nothing the browser was handed carries a value at all: the endpoints answer metadata.
    for (const body of bodies) {
      expect(body, 'an answer of the swarm endpoints carried something called a value').not.toMatch(/"(value|data|content)"\s*:/);
    }
  });

  /**
   * REQ-80 and `plan-docker_management_app-remove_copy_controls`/REQ-21 — the join tokens keep
   * everything that plan left them with: masked by default, revealed only by `Show`, rotatable, and
   * **not takeable without being displayed**. No copy affordance returns (REQ-87, bug-5).
   *
   * The rotation is offered and **never pressed**: rotating invalidates a token for everyone, and the
   * route is aborted in the page so a mistake here cannot reach a daemon at all.
   */
  test('the join tokens are masked, revealed one at a time, rotatable, uncopyable, and gone with the dialog', async ({ page }) => {
    test.setTimeout(180_000);
    const stub = await openScreen(page, VIEWPORTS[0], managerSwarmFixture());

    await clickAtItsOwnCentre(page, content(page).getByRole('button', { name: 'Join tokens' }));
    const dialog = page.locator('.ui-modal');
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => stub.tokenReads(), { timeout: 20_000 }).toBe(1);

    // Read when the dialog opens, and shown by nothing until asked for.
    expect(await page.content(), 'a join token was displayed before anything asked for it').not.toContain('SWMTKN-');

    const reveals = dialog.getByRole('button', { name: 'Show' });
    const rotates = dialog.getByRole('button', { name: 'Rotate' });
    const copies = dialog.getByRole('button', { name: /copy/i });
    console.log(
      `[REQ-80] the token dialog offers ${await reveals.count()} reveal(s), ${await rotates.count()} rotation(s) and ${await copies.count()} copy control(s)`,
    );
    expect(await reveals.count(), 'the two tokens are not each revealable on their own').toBe(2);
    expect(await rotates.count(), 'the two tokens are not each rotatable on the spot').toBe(2);
    expect(await copies.count(), 'a copy affordance returned to the token dialog').toBe(0);

    await clickAtItsOwnCentre(page, reveals.first());
    await expect(dialog.getByText(WORKER_TOKEN)).toBeVisible({ timeout: 20_000 });
    // Revealing one does not reveal the other.
    expect(await page.content(), 'revealing the worker token revealed the manager token too').not.toContain(MANAGER_TOKEN);

    await clickAtItsOwnCentre(page, dialog.getByRole('button', { name: 'Done' }));
    await expect(dialog).toHaveCount(0, { timeout: 20_000 });
    expect(await page.content(), 'a join token outlived the dialog that held it').not.toContain('SWMTKN-');

    // …and it is read again on reopening, hidden again.
    await clickAtItsOwnCentre(page, content(page).getByRole('button', { name: 'Join tokens' }));
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => stub.tokenReads(), { timeout: 20_000 }).toBe(2);
    expect(await page.content(), 'a reopened dialog showed a token nobody asked for').not.toContain('SWMTKN-');

    // Nothing was rotated, and nothing else reached the daemon.
    expect(stub.mutations(), 'the token dialog issued a mutation').toEqual([]);
  });
});
