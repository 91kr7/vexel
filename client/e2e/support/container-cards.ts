/**
 * **Reaching a container on the containers screen, now that it is a card and not a table row**
 * (`plan-docker_management_app-containers_card_view/REQ-1`, `REQ-23`).
 *
 * Every spec that used to find a container with `.ui-data-table__row` finds it here instead, so the
 * screen's presentation is named in **one** place: the next change to it edits this file rather than
 * twenty. What each helper returns is the same thing the row locator returned — the surface carrying
 * that container's name, its controls and its values — which is what makes the restatement of the
 * delivered coverage a change of locator and not a change of claim (REQ-38).
 *
 * Two rules of CLAUDE.md are built in rather than left to each caller:
 *
 * - **a real pointer at the visible control's own coordinates**, through `settled.ts`'s aim — never
 *   `element.click()`, never a dispatched event, never aimed at something visually hidden;
 * - **the card is not its own action area**: `openContainerDetail` aims at the container's *name*,
 *   because a click anywhere inside the action cluster is contracted never to select the card, and a
 *   press at the card's own centre would land on whatever happens to sit there.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { boxOf } from './settled.js';
import { chooseFromRowOverflowMenu } from './row-overflow-menu.js';

/** Every container card of the list, in the order the screen draws them. */
export function containerCards(page: Page): Locator {
  return page.locator('.ui-frame__content .ui-surface--selectable');
}

/** The card of one container, found by the name it carries. */
export function containerCard(page: Page, name: string): Locator {
  return containerCards(page).filter({ hasText: name });
}

/** The card's overflow control: the fourth and last of its action cluster, on every card in every state. */
export function overflowTrigger(page: Page, name: string): Locator {
  return containerCard(page, name).getByRole('button', { name: `More actions for ${name}`, exact: true });
}

/**
 * The detail panel the selected card opens: a child of the list's own grid, spanning the whole row
 * and carrying no close control of its own.
 */
export function containerDetail(page: Page): Locator {
  return page.locator('.ui-frame__content .ui-detail-panel');
}

/**
 * The name on the card the panel is rendered after — which container the panel is pointing at.
 *
 * The panel spans the whole row of the grid, so what stands before it is its **row-spanning
 * wrapper's** own previous sibling: the card that owns it
 * (`plan-docker_management_app-containers_card_view/REQ-23`).
 */
export async function panelOwner(page: Page): Promise<string> {
  return await page.evaluate(
    () =>
      document
        .querySelector('.ui-frame__content .ui-detail-panel')
        ?.closest('.ui-grid__span-full')
        ?.previousElementSibling?.textContent ?? '',
  );
}

/**
 * Selects a container's card with a real pointer, aimed at its name.
 *
 * The name is the one place on the card that is neither a control nor inside the action cluster, so
 * this is the gesture an operator makes to open the panel — and the one that fails if the cluster
 * ever grows over it.
 *
 * Playwright's own click, and deliberately not a press at coordinates read beforehand
 * (`support/pointer.ts`): it is a real pointer at the visible control's own coordinates just the
 * same, and it re-checks actionability up to the moment it presses — including the hit test. The
 * containers list re-reads on every daemon event and this file's callers do not all narrow it to
 * their own fixture, so a press aimed at coordinates taken a frame earlier lands on whatever the
 * re-read has since put there. That is the same reasoning `row-overflow-menu.ts` records for the
 * menu entry it presses.
 */
export async function openContainerDetail(page: Page, name: string): Promise<void> {
  const card = containerCard(page, name);
  await expect(card).toBeVisible();
  const heading = card.getByRole('heading', { name, exact: true });
  await heading.scrollIntoViewIfNeeded();
  // Beside the click, not instead of it: a card dragged above the top of the viewport keeps every
  // character it had, and its coordinates are the only thing that says so.
  const box = await boxOf(heading, `the name on the card of ${name}`);
  expect(box.y, `the card of ${name} sits above the top of the viewport`).toBeGreaterThanOrEqual(0);
  await heading.click();
}

/**
 * The card's overflow menu opened and one of its entries chosen, as **one retried gesture**
 * (`support/row-overflow-menu.ts`).
 *
 * The settle that helper performs by default reads a `DataTable`, which this screen no longer draws,
 * so the wait for the layout to come to rest is done here on the card's own box and the gesture is
 * then asked not to repeat it. The rest is unchanged, the guard against pressing a destructive entry
 * twice included.
 */
export async function chooseCardAction(page: Page, name: string, entry: string): Promise<void> {
  const card = containerCard(page, name);
  await expect(card).toBeVisible();
  await boxOf(card, `the card of ${name}`);
  await chooseFromRowOverflowMenu(page, card, entry, { trigger: `More actions for ${name}`, settle: false });
}
