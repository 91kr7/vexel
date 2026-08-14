/**
 * **The guard that keeps "deliberately out of scope" fail-able.**
 *
 * `plan-docker_management_app-filesystem_browser_layout` re-lays out one large
 * dialog — the image filesystem browser — and adds to the library the
 * arrangement that gives a region the height left over. The three sibling large
 * dialogs (layer explorer, image diff, layer efficiency) are **deliberately left
 * as they are** by that report (its REQ-20), so that a regression on any of them
 * stays attributable to the report that asked for it: once the primitive exists,
 * each is a two-line change, and a batch that made all four at once would leave
 * nobody able to say which change broke what.
 *
 * What that leaves them with is a **pinned** inner region: a height stated as a
 * pixel constant in feature code, so the region measures the same whatever the
 * screen offers. The delivered values are, at the time of writing:
 *
 * - the layer explorer's inner layer table — `maxHeight="320px"`;
 * - the image diff's two-pane region — `maxHeight="480px"` — and its
 *   side-by-side viewer — `maxHeight="360px"`;
 * - the layer efficiency view states none, and is simply the height of its own
 *   content, whatever the viewport.
 *
 * Those constants are a **standing breach** of the project rule that no size is
 * hard-coded outside the UI library. They are recorded here, not excused, and
 * they await a report of their own; the three dialogs are expected to inherit
 * the same arrangement when each is taken.
 *
 * **This assertion is deleted by the report that re-lays that dialog out.** It
 * says "this dialog was not quietly re-pointed at the new primitive", which
 * stops being true — deliberately — the day it is. No constant is written into
 * the assertion itself: what is asserted is that the two measurements agree, so
 * a dialog whose pixel pin is merely *changed* still passes and only one that
 * starts answering to the viewport fails.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** The pair of viewport heights the region is measured at: the report's own two. */
const SHORT_VIEWPORT_HEIGHT = 720;
const TALL_VIEWPORT_HEIGHT = 1000;

/**
 * Measures the region at both viewport heights and asserts it did not move,
 * putting the viewport back exactly as it found it.
 */
export async function expectRegionPinnedAcrossViewportHeights(page: Page, region: Locator, label: string): Promise<void> {
  const original = page.viewportSize();
  expect(original, `${label} — this run has no viewport size to restore`).not.toBeNull();
  const { width } = original as { width: number; height: number };

  try {
    await page.setViewportSize({ width, height: SHORT_VIEWPORT_HEIGHT });
    await expect(region).toBeVisible();
    const short = await region.evaluate((element) => element.getBoundingClientRect().height);

    await page.setViewportSize({ width, height: TALL_VIEWPORT_HEIGHT });
    await expect(region).toBeVisible();
    const tall = await region.evaluate((element) => element.getBoundingClientRect().height);

    expect(
      tall,
      `${label} — the pinned region measures ${short.toFixed(1)}px at ${width} × ${SHORT_VIEWPORT_HEIGHT} and ${tall.toFixed(
        1,
      )}px at ${width} × ${TALL_VIEWPORT_HEIGHT}: this dialog is out of scope for the filesystem-browser layout report and must still state its own height`,
    ).toBeCloseTo(short, 0);
  } finally {
    await page.setViewportSize(original as { width: number; height: number });
  }
}
