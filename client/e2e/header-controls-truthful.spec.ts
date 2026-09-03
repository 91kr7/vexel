/**
 * F3 — the permanent header offers only working controls, and no second route
 * (plan-ui-coherence-optimisation/REQ-12, REQ-13, REQ-15).
 *
 * **Written and run before the change it covers** (batch 3, INT-1). A check that
 * has never been observed to fail has not been shown capable of catching
 * anything, and once a dead control is removed the check that catches dead
 * controls can never be seen failing. So the "before" run happens against the
 * build that still ships the control, and what it measures is recorded with the
 * run.
 *
 * Three rules decide the shape of everything below.
 *
 * - **A real pointer, at the visible control's own coordinates** (`CLAUDE.md`).
 *   Every activation here is `page.mouse.click()` at the control's measured
 *   centre — never `element.click()`, never a dispatched event. A programmatic
 *   activation would also observe "nothing happened" on a control with no
 *   handler, but for the wrong reason: it needs no hit test and moves no focus,
 *   so it would keep passing the day a handler is wired that a real click still
 *   cannot reach.
 * - **The expected results come from the requirements, not from the build.** The
 *   controls are enumerated from the header as it renders — never from a list of
 *   the ones that happen to exist today — and each is required to answer. Nothing
 *   here names the search control, the badge or the console action: a check
 *   written against those three names would say nothing about the fourth inert
 *   control somebody adds next.
 * - **Effect, not merely presence.** REQ-12 is about a control that *does
 *   nothing when clicked*, which is invisible to any assertion that a control is
 *   on screen, has a label, or is enabled. What is asserted is the application's
 *   observable answer to the click.
 *
 * REQ-12 asks for the two screens the runtime half drives *and* for the absence
 * in source of an enabled control with no handler: the header is one component
 * rendered on all thirteen screens, so the source-level test at the end of this
 * file is what covers the other eleven, and it is not replaceable by the runtime
 * half nor the runtime half by it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from './support/test.js';
import { navEntry, openApp } from './support/fixtures.js';
import { boxOf, centreOf, clickAtItsCentre } from './support/settled.js';
import { cleanDaemonBeforeAll } from './support/lifecycle.js';

cleanDaemonBeforeAll();

/** A rectangle in viewport coordinates, as the browser reports it. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The two screens REQ-12 asks the runtime half to be verified on. Neither is the
 * raw console: a header control routing to the screen already showing would
 * produce no change of its own, so a check run there could not tell an inert
 * control from a control acting on the current screen.
 */
const SCREENS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'containers', label: 'Containers' },
] as const;

/** The permanent header of the shell, and only it: the rail and the content area are not its business. */
function header(page: Page): Locator {
  return page.locator('header.ui-page-header');
}

/**
 * A control the operator can operate, whatever it is called and whether or not
 * it carries text — the criterion is the capability, not the label.
 */
const CONTROL_SELECTOR = 'button:not([disabled]), [role="button"]:not([aria-disabled="true"]), a[href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function describeBox(box: Box): string {
  return `{t:${round(box.y)}, l:${round(box.x)}, w:${round(box.width)}, h:${round(box.height)}}`;
}

/** How a control is named in a failure: its accessible text, falling back to its tag. */
async function nameOf(control: Locator): Promise<string> {
  return control.evaluate((element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim() || `<${element.tagName.toLowerCase()}>`);
}

/**
 * What an operator can observe of the application, in a form a spontaneous
 * update cannot forge.
 *
 * The skeleton is tags and classes with **no text at all**, so a live list
 * re-reading itself, a relative timestamp ticking or a count changing does not
 * read as an answer to a click; the header's own text is kept beside it, because
 * a control whose whole effect is to relabel itself has genuinely answered.
 */
interface ObservableState {
  screen: string;
  active: string;
  overlays: number;
  headerText: string;
  skeleton: string;
}

async function observableState(page: Page): Promise<ObservableState> {
  return page.evaluate(() => {
    const skeletonSource = Array.from(document.querySelectorAll('body *'))
      .map((element) => `${element.tagName}.${typeof element.className === 'string' ? element.className : ''}`)
      .join('|');
    let hash = 0;
    for (let index = 0; index < skeletonSource.length; index += 1) {
      hash = (hash * 31 + skeletonSource.charCodeAt(index)) | 0;
    }
    return {
      screen: document.querySelector('h1')?.textContent?.trim() ?? '',
      active: document.querySelector('[aria-current="page"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      overlays: document.querySelectorAll('.ui-modal, [role="dialog"], [role="menu"], .ui-toast, .ui-combobox__list').length,
      headerText: document.querySelector('header.ui-page-header')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      skeleton: `${skeletonSource.length}:${hash}`,
    };
  });
}

function sameState(a: ObservableState, b: ObservableState): boolean {
  return a.screen === b.screen && a.active === b.active && a.overlays === b.overlays && a.headerText === b.headerText && a.skeleton === b.skeleton;
}

function describeState(state: ObservableState): string {
  return `screen "${state.screen}", active "${state.active}", ${state.overlays} overlay(s), header "${state.headerText}", skeleton ${state.skeleton}`;
}

/**
 * The application's state once it has stopped changing on its own.
 *
 * The daemon's event stream can move the application without anybody clicking
 * anything, and a check that reads "it changed" out of such a moment would
 * certify an inert control as working. Two identical samples in a row are what
 * makes the change measured after the click attributable to the click.
 */
async function settledState(page: Page, where: string): Promise<ObservableState> {
  const deadline = Date.now() + 15_000;
  let previous = await observableState(page);
  while (Date.now() < deadline) {
    await page.waitForTimeout(400);
    const current = await observableState(page);
    if (sameState(previous, current)) return current;
    previous = current;
  }
  throw new Error(`${where}: the application never stopped changing on its own, so no effect could be attributed to a click`);
}

/** What the browser finds at a point, and whether it is the control being aimed at. */
async function hitTestAtCentre(control: Locator, centre: { x: number; y: number }): Promise<{ hit: boolean; found: string }> {
  return control.evaluate((node, point) => {
    const element = document.elementFromPoint(point.x, point.y);
    if (element === null) return { hit: false, found: 'nothing at all' };
    const classes = typeof element.className === 'string' && element.className.trim().length > 0 ? `.${element.className.trim().split(/\s+/).join('.')}` : '';
    return { hit: element === node || node.contains(element), found: `${element.tagName.toLowerCase()}${classes}` };
  }, centre);
}

/** Every request the application sent to its own API, collected so that an effect with no visible surface still counts. */
function collectApiRequests(page: Page): { since: () => void; seen: () => string[] } {
  let requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) requests.push(request.url());
  });
  return {
    since: () => {
      requests = [];
    },
    seen: () => [...requests],
  };
}

interface Activation {
  name: string;
  box: Box;
  found: string;
  before: ObservableState;
  after: ObservableState;
  requests: string[];
  clickedAt: number;
}

/**
 * The controls the header offers once the application has settled, and only
 * then.
 *
 * The order matters and was paid for on the first run of this check: while the
 * daemon has not been probed yet the status pill carries a "Retry" of its own,
 * which is gone a moment later. Controls enumerated before the application
 * settles are therefore a mix of what it offers and what it was showing on the
 * way there — and a click aimed at a box measured then lands where nothing is,
 * which reads exactly like an inert control. What REQ-12 is about is the header
 * an operator is looking at, so everything here is measured after the settle,
 * never before it.
 */
async function settledHeaderControls(page: Page, where: string): Promise<{ state: ObservableState; count: number }> {
  const state = await settledState(page, where);
  return { state, count: await header(page).locator(CONTROL_SELECTOR).count() };
}

/**
 * Clicks one header control with a real pointer at its own centre and reports
 * everything the application did in answer — a change an operator can see, or a
 * call it made. Nothing here decides whether that is enough: the tests do.
 */
async function activateHeaderControl(
  page: Page,
  index: number,
  expectedCount: number,
  where: string,
  api: ReturnType<typeof collectApiRequests>,
  justBeforeTheClick?: () => void,
): Promise<Activation> {
  const { state: before, count } = await settledHeaderControls(page, `${where}, before clicking control ${index}`);
  expect(count, `${where}: the settled header offered ${expectedCount} controls and now offers ${count}`).toBe(expectedCount);

  const control = header(page).locator(CONTROL_SELECTOR).nth(index);
  await expect(control, `${where}: header control ${index} is not on screen`).toBeVisible();
  const name = await nameOf(control);
  // Read once the header has stopped moving: the hit test below is only worth anything about a
  // point the control still occupies when the pointer arrives (`support/settled.ts`).
  const box = await boxOf(control, `${where}: the "${name}" control`);
  const centre = centreOf(box);

  const { hit, found } = await hitTestAtCentre(control, centre);
  expect(
    hit,
    `${where}: a hit test at the centre of the "${name}" control (${round(centre.x)}, ${round(centre.y)}) returns ${found}, not the control — a real click cannot reach it (REQ-12)`,
  ).toBe(true);

  api.since();
  justBeforeTheClick?.();
  const clickedAt = Date.now();
  // A real pointer at the visible control's own coordinates (CLAUDE.md).
  await page.mouse.click(centre.x, centre.y);
  await page.waitForTimeout(1_200);
  const after = await observableState(page);

  return { name, box, found, before, after, requests: api.seen(), clickedAt };
}

function answered(activation: Activation): boolean {
  return !sameState(activation.before, activation.after) || activation.requests.length > 0;
}

// ─── runtime half · every header control answers a real click ────────────────

/**
 * **The rule, over whatever the header offers — including nothing.**
 *
 * This test asserts an implication: *every* control the settled header offers
 * answers a real pointer click. With a reachable daemon the header is a pair of
 * statements — a status pill and a version badge, both plain `<span>`s — and it
 * offers no control at all, which satisfies the implication vacuously.
 *
 * That is deliberate, and it is safe **only because of the pairing stated here**:
 * the source-level test at the end of this file independently establishes that
 * the shell renders no enabled control in the header without a handler, on all
 * thirteen screens at once, and the unreachable-daemon test below exercises the
 * implication against a control that genuinely exists. So "no control" is never
 * a way for this file as a whole to pass while proving nothing, and the day a
 * working control is added to the header this test starts exercising it without
 * being touched.
 *
 * The alternative — asserting the header is empty — was refused on purpose: it
 * would pin today's design into a check whose subject is "controls answer
 * clicks", and would fail a correct product the day the header gains a control
 * that works.
 */
for (const screen of SCREENS) {
  // plan-ui-coherence-optimisation/REQ-12
  test(`every control the header offers on the ${screen.label} screen answers a real pointer click`, async ({ page }) => {
    test.setTimeout(180_000);
    const api = collectApiRequests(page);
    const where = `header @${screen.label}`;

    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page, screen.id);
    await expect(page.getByRole('heading', { level: 1, name: screen.label })).toBeVisible({ timeout: 20_000 });

    const { count } = await settledHeaderControls(page, where);
    console.log(`[REQ-12] ${where}: the settled header offers ${count} control(s)`);

    const measured: string[] = [];
    const inert: string[] = [];

    for (let index = 0; index < count; index += 1) {
      // Each control is clicked from the same stated starting screen: a control
      // that navigates would otherwise decide where the next one is clicked
      // from, and a route to the screen already showing produces no change of
      // its own.
      await openApp(page, screen.id);
      await expect(page.getByRole('heading', { level: 1, name: screen.label })).toBeVisible({ timeout: 20_000 });

      const activation = await activateHeaderControl(page, index, count, where, api);
      measured.push(
        `${where} "${activation.name}" ${describeBox(activation.box)} → hit ${activation.found}; before: ${describeState(activation.before)}; after: ${describeState(activation.after)}; api calls: ${activation.requests.length}`,
      );
      if (!answered(activation)) {
        inert.push(`"${activation.name}" at ${describeBox(activation.box)} — clicked at its own centre, the application did nothing at all: ${describeState(activation.after)}, and no call to its own API`);
      }
    }

    if (measured.length > 0) console.log(`[REQ-12] ${measured.join('\n[REQ-12] ')}`);
    expect(
      inert,
      `${where}: an enabled control of the permanent header does nothing when a real pointer clicks it (REQ-12)`,
    ).toEqual([]);
  });
}

// ─── runtime half · the same rule, against a control that exists ─────────────

/**
 * The state in which the header does offer a control: the daemon unreachable,
 * where the status pill grows a `Retry` of its own.
 *
 * **Simulated at the boundary, never on the machine.** The live channel — the
 * one connection the window opens, and the only source the status has since it
 * stopped being polled for
 * (…-multiplexed_sse/REQ-17, REQ-19, REQ-39) — is refused in the browser, so the
 * application reports a daemon it cannot reach while the operator's daemon — the
 * one their work runs on — is neither stopped, paused nor touched in any way
 * (`CLAUDE.md`). Nothing else is intercepted: the pill, the badge and the retry
 * are the product's own. What this used to intercept was the connectivity
 * endpoint the browser polled; nothing in the interface reads it any more, so
 * intercepting it would leave the daemon reachable and this case with no control
 * to exercise.
 *
 * The observation that made this possible was first met as a flaw in this very
 * check: the pill "carries a Retry of its own" before the daemon has been probed,
 * "and it is gone a moment later".
 */
interface UnreachableDaemonBoundary {
  /** Puts the boundary back into its refusing state, for the next control. */
  reset: () => void;
  /** The channel the click is about to ask for is let through. */
  arm: () => void;
  /** When each attempt arrived, so the one a click caused can be told from the browser's own retry. */
  attempts: () => number[];
}

async function serveUnreachableDaemon(page: Page): Promise<UnreachableDaemonBoundary> {
  let refusing = true;
  const attempts: number[] = [];

  await page.route('**/api/live', async (route) => {
    attempts.push(Date.now());
    if (refusing) await route.abort();
    else await route.continue();
  });

  return {
    reset: () => {
      refusing = true;
    },
    arm: () => {
      refusing = false;
    },
    attempts: () => [...attempts],
  };
}

/**
 * Waits for an attempt to land, so the click that follows happens at the far end
 * of the browser's own reconnection cadence.
 *
 * A dropped `EventSource` is reopened by the browser every three seconds, and an
 * attempt arriving on its own would answer the click's question for it. Clicking
 * just after one leaves the next about three seconds away, so an attempt
 * observed within a second of the click is the click's.
 */
async function anchorOnAnAttempt(boundary: UnreachableDaemonBoundary): Promise<void> {
  const before = boundary.attempts().length;
  await expect
    .poll(() => boundary.attempts().length, { timeout: 20_000, message: 'the browser stopped asking for the channel at all, so its cadence could not be anchored' })
    .toBeGreaterThan(before);
}

// plan-ui-coherence-optimisation/REQ-12 — the implication above, exercised
// against a control that genuinely exists, so it can never pass vacuously.
test('the control the header offers while the daemon is unreachable answers a real pointer click', async ({ page }) => {
  test.setTimeout(180_000);
  const api = collectApiRequests(page);
  const boundary = await serveUnreachableDaemon(page);
  const where = 'header @Dashboard, daemon unreachable';

  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, 'dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

  const { count } = await settledHeaderControls(page, where);
  expect(
    count,
    `${where}: the daemon reads as unreachable and the header still offers no control at all, so REQ-12 has nothing to exercise here (REQ-12)`,
  ).toBeGreaterThan(0);

  const measured: string[] = [];
  const inert: string[] = [];

  for (let index = 0; index < count; index += 1) {
    boundary.reset();
    await openApp(page, 'dashboard');
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });
    await settledState(page, `${where}, control ${index}`);
    await anchorOnAnAttempt(boundary);

    const activation = await activateHeaderControl(page, index, count, where, api, boundary.arm);
    const attempts = boundary.attempts();
    const answeredAttempt = attempts.find((at) => at >= activation.clickedAt);
    const lastBefore = attempts.filter((at) => at < activation.clickedAt).pop();
    const delay = answeredAttempt === undefined ? undefined : answeredAttempt - activation.clickedAt;
    // The attribution, reported rather than assumed: the browser reopens the
    // channel every 3000ms and one attempt landed shortly before the click, so an
    // attempt arriving inside the observation window is the click's.
    measured.push(
      `${where} "${activation.name}" ${describeBox(activation.box)} → hit ${activation.found}; before: ${describeState(activation.before)}; after: ${describeState(activation.after)}; api calls: ${activation.requests.length}; last attempt ${lastBefore === undefined ? 'none' : `${activation.clickedAt - lastBefore}ms before the click`}, next ${delay === undefined ? 'never arrived' : `${delay}ms after it`} (browser retry 3000ms)`,
    );
    if (!answered(activation)) {
      inert.push(`"${activation.name}" at ${describeBox(activation.box)} — clicked at its own centre, the application did nothing at all: ${describeState(activation.after)}, and no call to its own API`);
    }
  }

  console.log(`[REQ-12] ${measured.join('\n[REQ-12] ')}`);
  expect(
    inert,
    `${where}: an enabled control of the permanent header does nothing when a real pointer clicks it (REQ-12)`,
  ).toEqual([]);
});

// ─── runtime half · a keyboard hint is a promise about a keystroke ───────────

/**
 * Every keyboard shortcut the header advertises, however it is drawn: a `kbd`
 * element, or any text in the header shaped like a shortcut. The component that
 * draws it today is deliberately not the criterion — the promise the operator
 * reads is the text, not the class it is rendered with.
 */
async function advertisedShortcuts(page: Page): Promise<string[]> {
  return header(page).evaluate((element) => {
    const shortcuts = new Set<string>();
    const pattern = /(?:[⌘⌃⌥⇧]+\s*[A-Za-z0-9]|(?:Cmd|Ctrl|Control|Alt|Option|Shift)\s*\+\s*[A-Za-z0-9])/g;
    for (const hint of Array.from(element.querySelectorAll('kbd'))) {
      const text = (hint.textContent ?? '').replace(/\s+/g, '').trim();
      if (text.length > 0) shortcuts.add(text);
    }
    for (const match of (element.textContent ?? '').matchAll(pattern)) {
      shortcuts.add(match[0].replace(/\s+/g, ''));
    }
    return Array.from(shortcuts);
  });
}

/** The keystroke an advertised shortcut asks for, in the browser's own notation. */
function keystrokeOf(shortcut: string): string | null {
  const modifiers: string[] = [];
  let rest = shortcut;
  const named: [RegExp, string][] = [
    [/^(⌘|Cmd\s*\+|Command\s*\+)/i, 'Meta'],
    [/^(⌃|Ctrl\s*\+|Control\s*\+)/i, 'Control'],
    [/^(⌥|Alt\s*\+|Option\s*\+)/i, 'Alt'],
    [/^(⇧|Shift\s*\+)/i, 'Shift'],
  ];
  let matched = true;
  while (matched) {
    matched = false;
    for (const [pattern, modifier] of named) {
      const found = rest.match(pattern);
      if (found) {
        modifiers.push(modifier);
        rest = rest.slice(found[0].length).trim();
        matched = true;
      }
    }
  }
  const key = rest.trim();
  if (modifiers.length === 0 || !/^[A-Za-z0-9]$/.test(key)) return null;
  return [...modifiers, key.toUpperCase()].join('+');
}

for (const screen of SCREENS) {
  // plan-ui-coherence-optimisation/REQ-13 — the requirement is a biconditional:
  // either the handler exists or the badge does not. What is asserted is exactly
  // that implication, so a build that removes the badge and a build that wires
  // the shortcut both satisfy it, and a build that shows a hint for a keystroke
  // nothing answers satisfies neither.
  test(`no keyboard hint in the header of the ${screen.label} screen advertises a shortcut nothing answers`, async ({ page }) => {
    test.setTimeout(120_000);
    const api = collectApiRequests(page);
    const where = `header @${screen.label}`;

    await page.setViewportSize({ width: 1440, height: 900 });
    await openApp(page, screen.id);
    await expect(page.getByRole('heading', { level: 1, name: screen.label })).toBeVisible({ timeout: 20_000 });

    const shortcuts = await advertisedShortcuts(page);
    const unanswered: string[] = [];
    const measured: string[] = [`${where}: hints advertised — ${shortcuts.length === 0 ? 'none' : shortcuts.join(', ')}`];

    for (const shortcut of shortcuts) {
      const keystroke = keystrokeOf(shortcut);
      expect(keystroke, `${where}: the header advertises "${shortcut}", which names no keystroke this check can press`).not.toBeNull();

      const before = await settledState(page, `${where}, before pressing ${shortcut}`);
      api.since();
      await page.keyboard.press(keystroke as string);
      await page.waitForTimeout(1_200);
      const after = await observableState(page);
      const requests = api.seen();
      measured.push(`${where}: pressed ${shortcut} (${keystroke}) → before: ${describeState(before)}; after: ${describeState(after)}; api calls: ${requests.length}`);

      if (sameState(before, after) && requests.length === 0) {
        unanswered.push(`"${shortcut}" (${keystroke}) — the header advertises it and pressing it does nothing at all: ${describeState(after)}, and no call to the application's own API`);
      }
    }

    console.log(`[REQ-13] ${measured.join('\n[REQ-13] ')}`);
    expect(
      unanswered,
      `${where}: the header displays a keyboard hint for a shortcut no handler answers (REQ-13)`,
    ).toEqual([]);
  });
}

// ─── runtime half · one destination, one control ─────────────────────────────

/** Every destination the navigation rail offers, by the label it offers it under. */
async function railDestinations(page: Page): Promise<string[]> {
  return page.getByRole('navigation').evaluate((rail) =>
    Array.from(rail.querySelectorAll('.ui-nav-item__label'))
      .map((label) => (label.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((label) => label.length > 0),
  );
}

// plan-ui-coherence-optimisation/REQ-15 — a destination the rail already offers
// is not offered a second time, as a different kind of thing, by the header.
test('no control of the permanent header is a second route to a destination the rail already offers', async ({ page }) => {
  test.setTimeout(180_000);
  const api = collectApiRequests(page);
  const screen = SCREENS[0];

  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, screen.id);
  await expect(page.getByRole('heading', { level: 1, name: screen.label })).toBeVisible({ timeout: 20_000 });

  const destinations = await railDestinations(page);
  expect(destinations.length, 'the navigation rail offers no destination at all, so this check would prove nothing').toBeGreaterThan(0);

  const { count } = await settledHeaderControls(page, `header @${screen.label}`);
  const duplicated: string[] = [];
  const measured: string[] = [`the rail offers ${destinations.length} destinations: ${destinations.join(', ')}`];

  for (let index = 0; index < count; index += 1) {
    await openApp(page, screen.id);
    await expect(page.getByRole('heading', { level: 1, name: screen.label })).toBeVisible({ timeout: 20_000 });

    const activation = await activateHeaderControl(page, index, count, `header @${screen.label}`, api);
    const reached = activation.after.screen;
    measured.push(`header "${activation.name}" ${describeBox(activation.box)} → screen "${activation.before.screen}" then "${reached}"`);
    if (reached !== activation.before.screen && destinations.includes(reached)) {
      duplicated.push(`"${activation.name}" at ${describeBox(activation.box)} navigates to "${reached}", which the rail already offers as its own entry`);
    }
  }

  console.log(`[REQ-15] ${measured.join('\n[REQ-15] ')}`);
  expect(
    duplicated,
    'a header control leads to a destination the navigation rail already offers, so one destination is offered by two controls of two different kinds (REQ-15)',
  ).toEqual([]);
});

// plan-ui-coherence-optimisation/REQ-15 — and the route that must survive: the
// navigation entry, at the docked breakpoint and inside the phone drawer.
test('the raw console is reached from the navigation rail, docked and in the phone drawer', async ({ page }) => {
  test.setTimeout(120_000);
  const destination = 'Raw console';

  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page, 'dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

  const docked = navEntry(page, destination);
  await docked.scrollIntoViewIfNeeded();
  await clickAtItsCentre(page, docked, `the "${destination}" entry in the docked rail`);
  await expect(
    page.getByRole('heading', { level: 1, name: destination }),
    `a real click at the centre of the docked "${destination}" entry did not open the screen (REQ-15)`,
  ).toBeVisible({ timeout: 20_000 });

  await page.setViewportSize({ width: 375, height: 812 });
  await openApp(page, 'dashboard');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible({ timeout: 20_000 });

  const toggle = page.getByRole('button', { name: 'Open navigation' });
  await expect(toggle, 'the phone breakpoint offers no control that opens the navigation drawer (REQ-15)').toBeVisible();
  await toggle.click();
  await expect(page.locator('.ui-frame__rail--open')).toBeVisible();

  const drawerEntry = navEntry(page, destination);
  await drawerEntry.scrollIntoViewIfNeeded();
  // The drawer slides in on a transition, so this is exactly the aim that must not be taken from
  // the frame the surface was still in flight (`support/settled.ts`).
  await clickAtItsCentre(page, drawerEntry, `the "${destination}" entry in the phone drawer`);
  await expect(
    page.getByRole('heading', { level: 1, name: destination }),
    `a real click at the centre of the "${destination}" entry in the phone drawer did not open the screen (REQ-15)`,
  ).toBeVisible({ timeout: 20_000 });

  console.log(`[REQ-15] the raw console was reached from the rail at 1440×900 and from the drawer at 375×812`);
});

// ─── source half · no enabled control rendered without a handler ─────────────

/**
 * The other eleven screens, and the half a browser cannot see: the header is one
 * component, so what the source says about it holds on every screen at once.
 *
 * The rule is derived from REQ-12 — *no enabled control is rendered without a
 * handler* — and not from the controls that happen to be there today. Which
 * elements are controls is asked of the UI library itself rather than written
 * into a list here: a component of the library is a control when it renders an
 * interactive element, and it is a control **only when that element is
 * rendered**, which for a few of them (a badge that becomes a button when given
 * an `onClick`, a status pill that grows one when given an `action`) depends on
 * what the call site passes.
 */
const CLIENT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHELL_SOURCE = join(CLIENT_ROOT, 'src', 'shell', 'Shell.tsx');
const UI_LIBRARY = join(CLIENT_ROOT, 'src', 'ui');

/** The markup that makes something operable: the platform's own interactive elements. */
const INTERACTIVE_MARKUP = /<button[\s>]|<a[\s>][^>]*href|<input[\s>]|<select[\s>]|<textarea[\s>]|role="button"/g;
/** A handler bound at a call site, whether as a prop or inside a prop object (`action={{ …, onClick: … }}`). */
const HANDLER_BINDING = /\bon[A-Z][A-Za-z]*\s*[:=]/;

interface ControlComponent {
  name: string;
  /** Empty when the interactive element is rendered unconditionally; otherwise the props that gate it. */
  gates: string[];
}

function tsxFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tsxFilesUnder(path);
    return entry.name.endsWith('.tsx') ? [path] : [];
  });
}

/** The props a component declares, read from its destructured parameter list. */
function declaredProps(source: string, componentName: string): string[] {
  const signature = source.match(new RegExp(`export function ${componentName}\\s*\\(\\s*\\{([^}]*)\\}`));
  if (!signature) return [];
  return (signature[1] ?? '')
    .split(',')
    .map((part) => (part.split(/[:=]/)[0] ?? '').trim())
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
}

/** Which props, if any, an interactive element is rendered behind. */
function gatesBefore(source: string, at: number, props: string[]): string[] {
  const window = source.slice(Math.max(0, at - 240), at);
  const gates = new Set<string>();
  for (const match of window.matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:\?|&&)/g)) {
    if (props.includes(match[1] as string)) gates.add(match[1] as string);
  }
  for (const match of window.matchAll(/if\s*\(\s*!?\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
    if (props.includes(match[1] as string)) gates.add(match[1] as string);
  }
  return Array.from(gates);
}

/** Every component of the UI library that renders something operable, and what it renders it behind. */
function controlComponents(): ControlComponent[] {
  const components = new Map<string, Set<string>>();
  for (const path of tsxFilesUnder(UI_LIBRARY)) {
    const source = readFileSync(path, 'utf8');
    const exported = Array.from(source.matchAll(/export function ([A-Z][\w$]*)/g)).map((match) => match[1] as string);
    if (exported.length === 0) continue;
    for (const occurrence of source.matchAll(INTERACTIVE_MARKUP)) {
      // One component per file is the library's own convention; where a file
      // exports several, the gate is attributed to each of them, which can only
      // make this check more permissive, never less honest.
      for (const name of exported) {
        const props = declaredProps(source, name);
        const gates = gatesBefore(source, occurrence.index ?? 0, props);
        const known = components.get(name) ?? new Set<string>();
        if (gates.length === 0) known.add('');
        else for (const gate of gates) known.add(gate);
        components.set(name, known);
      }
    }
  }
  return Array.from(components.entries()).map(([name, gates]) => ({
    name,
    gates: gates.has('') ? [] : Array.from(gates),
  }));
}

/** The value of a JSX prop of the shell, brace-balanced — here, the header the frame is given. */
function jsxPropValue(source: string, prop: string): string {
  const start = source.indexOf(`${prop}={`);
  expect(start, `the shell renders no \`${prop}\` prop, so the permanent header could not be located in its source`).toBeGreaterThan(-1);
  const from = source.indexOf('{', start);
  let depth = 0;
  for (let index = from; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(from + 1, index);
    }
  }
  return '';
}

/** The attributes of one JSX opening tag, brace-balanced so a nested object does not end it early. */
function openingTag(region: string, at: number): string {
  let depth = 0;
  for (let index = at; index < region.length; index += 1) {
    const character = region[index];
    if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
    else if (character === '>' && depth === 0) return region.slice(at, index);
  }
  return region.slice(at);
}

/** Where in `Shell.tsx` an offending usage sits, so a failure points at a line rather than at a file. */
function lineOf(source: string, region: string, at: number): number {
  const absolute = source.indexOf(region) + at;
  return source.slice(0, absolute).split('\n').length;
}

// plan-ui-coherence-optimisation/REQ-12 — the source-level half, and the one
// that covers all thirteen screens at once.
test('no enabled control of the permanent header is rendered without a handler', () => {
  const source = readFileSync(SHELL_SOURCE, 'utf8');
  const region = jsxPropValue(source, 'header');
  const controls = controlComponents();
  expect(controls.length, 'no component of the UI library was recognised as rendering a control, so this check would pass while proving nothing').toBeGreaterThan(0);

  const byName = new Map(controls.map((control) => [control.name, control]));
  // The platform's own tags count as themselves: feature code may not emit them
  // (CLAUDE.md), and one appearing here would be a control just the same.
  for (const tag of ['button', 'a', 'input', 'select', 'textarea']) byName.set(tag, { name: tag, gates: [] });

  const offending: string[] = [];
  const examined: string[] = [];

  for (const usage of region.matchAll(/<([A-Za-z][\w$]*)/g)) {
    const control = byName.get(usage[1] as string);
    if (!control) continue;
    const attributes = openingTag(region, usage.index ?? 0);
    // A gated component renders its interactive element only when the call site
    // passes the prop it is gated on; without it, no control is rendered here.
    const gated = control.gates.length > 0;
    const passesGate = control.gates.some((gate) => new RegExp(`\\b${gate}\\s*=`).test(attributes));
    if (gated && !passesGate) continue;

    const line = lineOf(source, region, usage.index ?? 0);
    const hasHandler = HANDLER_BINDING.test(attributes);
    const isDisabled = /\bdisabled\b(?!\s*=\s*\{?\s*false)/.test(attributes);
    const spreadsProps = /\{\s*\.\.\./.test(attributes);
    examined.push(`Shell.tsx:${line} <${control.name}> — handler ${hasHandler ? 'yes' : 'no'}, disabled ${isDisabled ? 'yes' : 'no'}`);
    if (!hasHandler && !isDisabled && !spreadsProps) {
      offending.push(`Shell.tsx:${line} — <${control.name} ${attributes.slice((control.name?.length ?? 0) + 1).replace(/\s+/g, ' ').trim()}> is rendered enabled with no handler of any kind`);
    }
  }

  console.log(`[REQ-12] header controls in source: ${examined.length === 0 ? 'none found' : examined.join('; ')}`);
  expect(
    offending,
    'the shell renders an enabled control in the permanent header with no handler, so it does nothing when clicked (REQ-12)',
  ).toEqual([]);
});
