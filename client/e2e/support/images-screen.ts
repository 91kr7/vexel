/**
 * **The one path to an image's analyses**, so it cannot be repaired in one file
 * and left broken in another.
 *
 * `openLayerExplorer` existed twice, written out line for line in
 * `layer-build-cache.spec.ts` and `dialog-sizing.spec.ts`, and that duplication
 * is the direct cause of a lost run: the race in the overflow-menu gesture was
 * repaired in the second copy and the first kept the split shape, so the same
 * defect was shipped in a file nobody had looked at. What each caller keeps for
 * itself is what it legitimately differs on — which dialog locator it measures,
 * and how long it is willing to wait for the stack to load; what they share is
 * the screen, the search and the gesture.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { openApp } from './fixtures.js';
import { chooseFromRowOverflowMenu, type RowOverflowMenuOptions } from './row-overflow-menu.js';

/** The images list's own search field. */
export function imagesSearchField(page: Page): Locator {
  return page.getByPlaceholder('Search reference or digest…');
}

/** Images & layers, narrowed to one reference, with that row on screen. */
export async function openImagesScreenRow(page: Page, reference: string, timeout = 20_000): Promise<Locator> {
  await openApp(page, 'images-layers');
  await expect(page.getByRole('heading', { level: 1, name: 'Images & layers' })).toBeVisible();
  await imagesSearchField(page).fill(reference);
  const row = page.locator('.ui-data-table__row', { hasText: reference }).first();
  await expect(row).toBeVisible({ timeout });
  return row;
}

/**
 * Images & layers → the row's overflow menu → one of the four analyses — the
 * entry point they all have now that they are the screen's views rather than the
 * detail panel's (`images/specs/images-screen.md`). No row is selected and no
 * panel is opened on the way.
 *
 * The dialog itself is left to the caller to locate and to wait for: the two
 * callers demand different things of it.
 */
export async function chooseImageRowAnalysis(
  page: Page,
  reference: string,
  entry: string,
  options: RowOverflowMenuOptions = {},
): Promise<void> {
  const row = await openImagesScreenRow(page, reference, 20_000);
  await chooseFromRowOverflowMenu(page, row, entry, options);
}
