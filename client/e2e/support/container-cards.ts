/**
 * Reaching a container on the containers screen, now that it is a card and not a table row
 * (`plan-docker_management_app-containers_card_view/REQ-1`, `REQ-23`). Named in one place, so the
 * next change to the presentation edits this file rather than twenty.
 *
 * Two rules of CLAUDE.md are built in rather than left to each caller: a real pointer at the visible
 * control's own coordinates, and aiming at the container's **name** — never the card's centre, which
 * may be a control the card contracts never to select on.
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
 * Selects a container's card with a real pointer aimed at its name. Playwright's own click rather
 * than a press at coordinates read beforehand: this list re-reads on every daemon event, so a press
 * aimed at a frame-old box lands on whatever the re-read has since put there.
 */
export async function openContainerDetail(page: Page, name: string): Promise<void> {
  const card = containerCard(page, name);
  await expect(card).toBeVisible();
  const heading = card.getByRole('heading', { name, exact: true });
  await heading.scrollIntoViewIfNeeded();
  const box = await boxOf(heading, `the name on the card of ${name}`);
  expect(box.y, `the card of ${name} sits above the top of the viewport`).toBeGreaterThanOrEqual(0);
  await heading.click();
}

/**
 * The card's overflow menu opened and one of its entries chosen, as one retried gesture
 * (`support/row-overflow-menu.ts`). Its default settle reads a `DataTable` this screen no longer
 * draws, so the wait is done here on the card's own box instead.
 */
export async function chooseCardAction(page: Page, name: string, entry: string): Promise<void> {
  const card = containerCard(page, name);
  await expect(card).toBeVisible();
  await boxOf(card, `the card of ${name}`);
  await chooseFromRowOverflowMenu(page, card, entry, { trigger: `More actions for ${name}`, settle: false });
}
