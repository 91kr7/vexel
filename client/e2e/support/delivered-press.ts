/**
 * **A press that was delivered to the control it was aimed at — and, when it was
 * not, one that is repeated safely.**
 *
 * The second of the suite's three waits — layout settled (`support/settled.ts`),
 * **node identity** (here), content arrived (`support/arrived.ts`).
 *
 * `support/settled.ts` answers "has the layout stopped moving?". This answers a
 * different question that looks like the same one and is not: **"is the node
 * under the pointer still the node I aimed at?"** A list that re-reads on a poll
 * or on a daemon event replaces its rows with new nodes carrying *identical
 * geometry*, so consecutive box readings agree and the settled reader returns —
 * correctly — a box that is about to belong to somebody else.
 *
 * What that costs, measured on a run of `compose-row-geometry.spec.ts`
 * ("a project's detail opens on the panel at the list's own width — 375×812"):
 * the stubbed project list resolved at 0.202s, the press went out at 0.259s, and
 * the panel never opened — `toHaveCount(1)` polled 44 times over 20s against 0.
 * The most likely mechanism, and the one this module is built to observe rather
 * than to assume: `mousedown` lands on the row, React commits the re-read and
 * swaps the node, `mouseup` lands on its replacement, and the browser then
 * dispatches `click` **to the nearest common ancestor of the two** — the table,
 * not the row. The row's handler never runs. Nothing moved, nothing was slow,
 * and no wait of any length would have helped.
 *
 * So the press is **observed**, with a capture-phase listener on the document
 * recording which element the browser actually delivered each `click` to, and a
 * marker attribute put on the intended node for the duration of one attempt. If
 * the node is replaced, the marker goes with the old one and the delivery is
 * recorded as having landed somewhere else, by name.
 *
 * **Why the retry is safe on a toggle**, which is the trap here — selecting a
 * project row opens its panel, and selecting it again closes it, so a blind
 * retry closes a panel that was about to open:
 *
 * - the caller states the **effect** the press is supposed to have, and the
 *   effect is checked *before* the first press as well as after each one, so a
 *   gesture whose work is already done never presses at all;
 * - a press is repeated **only while that effect has not been reached**, which
 *   is the product's own state and not an inference: a second press therefore
 *   starts from the same observed state as the first, and cannot be the second
 *   half of a toggle;
 * - a press that the recorder saw **delivered to the control itself**, with the
 *   effect still absent, ends the gesture instead of repeating it. That is the
 *   product having received exactly the press that was intended and done
 *   nothing with it, which is a report to read — not something to press through.
 *
 * It costs two `evaluate` calls per attempt and no fixed wait: when the press
 * lands, which is every ordinary case, the only waiting is the wait for the
 * effect that the caller was doing anyway.
 */
import { type Locator, type Page } from '@playwright/test';
import { clickAtItsCentre, type SettleOptions } from './settled.js';

/** Where the page keeps what it saw, and the attribute that marks the node one attempt aims at. */
const DELIVERIES = '__vexelDeliveredPresses';
const MARK = 'data-vexel-press-target';

/** What the caller says must become true for the press to have taken. */
export interface PressEffect {
  /** Stated in the failure message, so a reader sees what was waited for. */
  describe: string;
  reached: () => Promise<boolean>;
}

/** The effect: a surface that appears. */
export function becomesVisible(target: Locator, describe: string): PressEffect {
  return { describe, reached: async () => await target.isVisible() };
}

/** The effect: a surface that goes. */
export function disappears(target: Locator, describe: string): PressEffect {
  return { describe, reached: async () => (await target.count()) === 0 };
}

/** The effect: a locator that comes to hold exactly `count` elements. */
export function countBecomes(target: Locator, count: number, describe: string): PressEffect {
  return { describe, reached: async () => (await target.count()) === count };
}

/** The effect: a surface that comes to say something — how a *switch* of subject is stated. */
export function comesToSay(target: Locator, text: string, describe: string): PressEffect {
  return {
    describe,
    reached: async () => {
      if ((await target.count()) === 0) return false;
      return ((await target.first().textContent()) ?? '').includes(text);
    },
  };
}

export interface PressOptions extends SettleOptions {
  /** The whole gesture's budget, repeats included. */
  budget?: number;
  /** How long one press is given to produce its effect before the delivery is examined. */
  effectTimeout?: number;
}

interface Delivery {
  intended: boolean;
  target: string;
}

/**
 * Presses a control with a real pointer at its settled coordinates, and waits for
 * the effect the caller names — repeating the press only while that effect has
 * not been reached and the press has not been delivered to the control itself.
 */
export async function pressUntilItTakes(
  page: Page,
  target: Locator,
  what: string,
  effect: PressEffect,
  options: PressOptions = {},
): Promise<void> {
  const budget = options.budget ?? 20_000;
  const effectTimeout = options.effectTimeout ?? 5_000;
  const deadline = Date.now() + budget;
  const landedOn: string[] = [];
  let attempt = 0;

  for (;;) {
    // Checked before pressing as well as after: a gesture whose effect is already
    // there must not press, or a toggle is turned back.
    if (await effect.reached()) return;

    attempt += 1;
    const token = `${Date.now()}-${attempt}`;
    await armDeliveryRecorder(page, token);
    await mark(target, token);
    try {
      await clickAtItsCentre(page, target, `${what} (attempt ${attempt})`, options);
    } finally {
      await unmark(target);
    }

    if (await reachedWithin(effect, effectTimeout)) return;

    const deliveries = await deliveriesSoFar(page);
    if (deliveries.some((delivery) => delivery.intended)) {
      throw new Error(
        `${what}: the press was delivered to the control itself and ${effect.describe} did not follow ` +
          `within ${effectTimeout}ms. Not pressing again — this is the product answering, or failing to, ` +
          `and a second press would be a second gesture.`,
      );
    }
    landedOn.push(deliveries.length === 0 ? 'nothing at all' : deliveries.map((delivery) => delivery.target).join(', '));

    if (Date.now() >= deadline) {
      throw new Error(
        `${what}: ${attempt} press(es) never reached the control — each one landed on ` +
          `[${landedOn.join(' | ')}] instead, and ${effect.describe} never happened. That is the node under the ` +
          `pointer being replaced between the aim and the press (see support/delivered-press.ts).`,
      );
    }
  }
}

/** Polls the caller's own statement of the effect; nothing here interprets the product's state for it. */
async function reachedWithin(effect: PressEffect, timeout: number): Promise<boolean> {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await effect.reached()) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Installs (once) and resets the recorder.
 *
 * Capture phase on the document, so what it sees is the delivery itself, before
 * the application's own root handler acts on it — or fails to, which is the case
 * this exists for.
 */
async function armDeliveryRecorder(page: Page, token: string): Promise<void> {
  await page.evaluate(
    ({ key, mark: attribute, token: current }) => {
      const store = window as unknown as Record<string, unknown>;
      store[key] = [];
      store[`${key}:token`] = current;
      if (store[`${key}:armed`] === true) return;
      store[`${key}:armed`] = true;
      const describe = (element: Element): string => {
        const classes = (element.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
        return `<${element.tagName.toLowerCase()}${classes.length > 0 ? ` class="${classes.join(' ')}"` : ''}>`;
      };
      document.addEventListener(
        'click',
        (event) => {
          const element = event.target;
          if (!(element instanceof Element)) return;
          const marked = element.closest(`[${attribute}]`);
          (store[key] as { intended: boolean; target: string }[]).push({
            intended: marked !== null && marked.getAttribute(attribute) === store[`${key}:token`],
            target: describe(element),
          });
        },
        true,
      );
    },
    { key: DELIVERIES, mark: MARK, token },
  );
}

async function deliveriesSoFar(page: Page): Promise<Delivery[]> {
  return await page
    .evaluate((key) => ((window as unknown as Record<string, unknown>)[key] as Delivery[]) ?? [], DELIVERIES)
    .catch(() => [] as Delivery[]);
}

/**
 * The marker is put on for the length of one attempt and taken off after it.
 *
 * It is an attribute nothing in the product reads or styles, and it is the point
 * of the whole module that it does **not** survive the node being replaced: a
 * press recorded as reaching a marked node reached the node this attempt aimed
 * at, and a press recorded anywhere else did not.
 */
async function mark(target: Locator, token: string): Promise<void> {
  await target
    .evaluate((element, { attribute, value }) => element.setAttribute(attribute, value), { attribute: MARK, value: token })
    .catch(() => undefined);
}

async function unmark(target: Locator): Promise<void> {
  await target.evaluate((element, attribute) => element.removeAttribute(attribute), MARK).catch(() => undefined);
}
