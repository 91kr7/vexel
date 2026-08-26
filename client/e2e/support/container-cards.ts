/**
 * Reaching a container on the containers screen — its card, and the dialog its card's own control
 * opens (`plan-docker_management_app-containers_card_view/REQ-1`,
 * `plan-docker_management_app-containers_card_view-detail_modal/REQ-1`, `REQ-5`, `REQ-6`). Named in
 * one place, so the next change to the presentation edits this file rather than twenty.
 *
 * Two rules of CLAUDE.md are built in rather than left to each caller: a real pointer at the visible
 * control's own coordinates, and aiming at the **detail control** — the only route into the detail,
 * the card's body having stopped being one.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { boxOf } from './settled.js';
import { chooseFromRowOverflowMenu } from './row-overflow-menu.js';

/** Every container card of the list, in the order the screen draws them. */
export function containerCards(page: Page): Locator {
  return page.locator('.ui-frame__content .ui-grid--cards > .ui-surface');
}

/** The card of one container, found by the name it carries. */
export function containerCard(page: Page, name: string): Locator {
  return containerCards(page).filter({ hasText: name });
}

/** The card's overflow control: the fourth and last of its action cluster, on every card in every state. */
export function overflowTrigger(page: Page, name: string): Locator {
  return containerCard(page, name).getByRole('button', { name: `More actions for ${name}`, exact: true });
}

/** The card's top-right control: the only route into that container's detail. */
export function detailControl(page: Page, name: string): Locator {
  return containerCard(page, name).getByRole('button', { name: `Open ${name} details`, exact: true });
}

/**
 * The detail the card's control opens: the product's own dialog surface at its large size, over the
 * whole screen rather than inside the list's grid.
 */
export function containerDetail(page: Page): Locator {
  return page.locator('.ui-modal--size-large');
}

/** The dimmed area beside the dialog — one of its two ways out. */
export function containerDetailScrim(page: Page): Locator {
  return page.locator('.ui-modal-overlay');
}

/** The dialog's own close control — the other way out, and the only labelled one. */
export function containerDetailCloseControl(page: Page): Locator {
  return containerDetail(page).getByRole('button', { name: 'Close dialog', exact: true });
}

/** The dialog's own chrome band: what it says it belongs to, carried on the dialog itself (REQ-16). */
export function containerDetailHeader(page: Page): Locator {
  return containerDetail(page).locator('.ui-modal__title');
}

/**
 * One container's identity as the header states it — the dot's tone, the bare name, the state pill,
 * the health pill when the daemon states an outcome, and the short id
 * (`…-tabs_composition_refactor/REQ-6`, `REQ-7`, `REQ-8`). It replaced the `Container — <name>`
 * string the dialog used to be titled with, so every check that read that string reads this instead.
 *
 * Read in one pass, so a caller never compares halves of two different frames.
 */
export interface DetailIdentity {
  dot: string | null;
  name: string | null;
  state: string | null;
  stateTone: string | null;
  health: string | null;
  healthTone: string | null;
  shortId: string | null;
  /** Everything the band says, for a failure message that shows what was there instead. */
  text: string;
}

export async function detailIdentity(page: Page): Promise<DetailIdentity> {
  const header = containerDetailHeader(page);
  await expect(header, 'the detail dialog carries no header').toBeVisible();
  return await header.evaluate((band) => {
    const tone = (element: Element | null) => (element === null ? null : (/--tone-(\w+)/.exec(element.className)?.[1] ?? 'neutral'));
    const pills = Array.from(band.querySelectorAll('.ui-badge'));
    return {
      dot: tone(band.querySelector('.ui-table-status-dot')),
      name: band.querySelector('.ui-section-header__title')?.textContent ?? null,
      state: pills[0]?.textContent ?? null,
      stateTone: pills[0] === undefined ? null : tone(pills[0]),
      health: pills[1]?.textContent ?? null,
      healthTone: pills[1] === undefined ? null : tone(pills[1]),
      shortId: band.querySelector('.ui-table-identifier-cell')?.textContent ?? null,
      text: band.textContent ?? '',
    };
  });
}

/** The name alone, for a check whose subject is which container the dialog is on. */
export async function detailName(page: Page): Promise<string | null> {
  return (await detailIdentity(page)).name;
}

/**
 * Opens a container's detail with a real pointer aimed at the card's own control. Playwright's own
 * click rather than a press at coordinates read beforehand: this list re-reads on every daemon
 * event, so a press aimed at a frame-old box lands on whatever the re-read has since put there.
 */
export async function openContainerDetail(page: Page, name: string): Promise<void> {
  const card = containerCard(page, name);
  await expect(card).toBeVisible();
  const control = detailControl(page, name);
  await control.scrollIntoViewIfNeeded();
  const box = await boxOf(control, `the detail control on the card of ${name}`);
  expect(box.y, `the card of ${name} sits above the top of the viewport`).toBeGreaterThanOrEqual(0);
  await control.click();
  await expect(containerDetail(page)).toBeVisible();
}

/** Dismisses the open detail by the dialog's close control, and waits for it to be gone. */
export async function closeContainerDetail(page: Page): Promise<void> {
  await containerDetailCloseControl(page).click();
  await expect(containerDetail(page)).toHaveCount(0);
}

/** Dismisses the open detail by a click on the dimmed area beside it, and waits for it to be gone. */
export async function dismissContainerDetailByScrim(page: Page): Promise<void> {
  await containerDetailScrim(page).click({ position: { x: 4, y: 4 } });
  await expect(containerDetail(page)).toHaveCount(0);
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

/**
 * The Inspect tab's `Raw payload` section — a collapsible like the tab's others, **closed when the
 * tab opens** (`…-tabs_composition_refactor/REQ-37`). Located by its own title: the header button's
 * accessible name carries the chevron glyph too.
 */
export function rawPayloadSection(page: Page): Locator {
  return containerDetail(page)
    .locator('.ui-collapsible-section')
    .filter({ has: page.locator('.ui-collapsible-section__title', { hasText: /^Raw payload$/ }) })
    .first();
}

/**
 * Opens it, with a real pointer at the header's own coordinates, and waits for the block to be on
 * screen. What the header adds to reaching the payload is one press and nothing else, so every
 * check that used to read the block simply makes it.
 */
export async function openRawPayload(page: Page): Promise<void> {
  const section = rawPayloadSection(page);
  await expect(section, 'the Inspect tab draws no `Raw payload` section').toBeVisible({ timeout: 20_000 });
  const header = section.locator('.ui-collapsible-section__header');
  if ((await header.getAttribute('aria-expanded')) === 'true') return;
  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  await expect(section.locator('.ui-code-viewer__code')).toBeVisible({ timeout: 20_000 });
}
