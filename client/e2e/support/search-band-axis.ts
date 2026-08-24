/**
 * The search band, measured **on the axis it was placed on**.
 *
 * The band is one shared control used on both axes: wrapped in a row by the
 * container logs view, and stacked in a column by the image filesystem browser.
 * A sizing rule written for one axis is silently wrong on the other — `flex: 1 1
 * 240px` reads as "at least 240px wide, and grow" in a row and as "240px tall"
 * in a column — so the two halves of its contract are measured with one helper
 * and asserted on two screens. A fault of a shared control is only shown to be
 * the control's by being observed on more than one surface, which is the same
 * argument `surface-stability.ts` was written under.
 *
 * Geometry only: every number here comes from a viewport box the browser
 * reports, never from the text the band draws (REQ-29, REQ-30 of
 * plan-docker_management_app-filesystem_browser_layout).
 */
import { expect, type Locator } from '@playwright/test';
import { readOnceSettled } from './settled.js';

export interface SearchBandGeometry {
  /** The band's own root box, in viewport coordinates. */
  height: number;
  width: number;
  left: number;
  right: number;
  /** The tallest control the band holds — the height the band's own height must equal. */
  controlHeight: number;
  /** Every control measured, so a failure names which one the band was compared against. */
  controls: { className: string; height: number }[];
  /** The band's parent: the element whose axis decides how the band is expected to size itself. */
  parent: {
    className: string;
    flexDirection: string;
    contentLeft: number;
    contentRight: number;
  };
}

/** Measures the band and the controls it holds in one pass, so every number belongs to the same layout. */
export async function measureSearchBand(band: Locator): Promise<SearchBandGeometry> {
  // Once the layout has come to rest: this band is measured after a style rule is injected to
  // reinstate the delivered arrangement, and after text is typed into the control it sizes itself
  // around — both of which take a layout the reading must not be taken inside of
  // (`support/settled.ts`).
  return await readOnceSettled(
    band.page(),
    () => measureSearchBandThisFrame(band),
    (previous, current) => JSON.stringify(previous) === JSON.stringify(current),
  );
}

/** **One frame, and it is reachable only by naming it**: the reader above is built out of it. */
export async function measureSearchBandThisFrame(band: Locator): Promise<SearchBandGeometry> {
  return band.evaluate((element) => {
    const controls = Array.from(element.children)
      .map((child) => ({ className: child.className, height: child.getBoundingClientRect().height }))
      .filter((control) => control.height > 0);
    const parent = element.parentElement;
    if (!parent) throw new Error('the search band has no parent to be measured against');
    const parentRect = parent.getBoundingClientRect();
    const parentStyle = getComputedStyle(parent);
    const box = element.getBoundingClientRect();
    return {
      height: box.height,
      width: box.width,
      left: box.left,
      right: box.right,
      controlHeight: controls.reduce((tallest, control) => Math.max(tallest, control.height), 0),
      controls,
      parent: {
        className: parent.className,
        flexDirection: parentStyle.flexDirection,
        contentLeft: parentRect.left + Number.parseFloat(parentStyle.paddingLeft) + Number.parseFloat(parentStyle.borderLeftWidth),
        contentRight: parentRect.right - Number.parseFloat(parentStyle.paddingRight) - Number.parseFloat(parentStyle.borderRightWidth),
      },
    };
  });
}

/** One pixel of slack absorbs subpixel layout and nothing else. */
const TOLERANCE_PX = 1;

/**
 * The half of the contract that holds on **both** axes: the band occupies the
 * height of the control it contains, and claims no height nothing is drawn in.
 *
 * Measured against the control, never against the number 240: the value was
 * never the defect — the band claiming height on the block axis was.
 */
export function expectBandIsTheHeightOfItsControl(label: string, geometry: SearchBandGeometry): void {
  const claimed = geometry.height - geometry.controlHeight;
  // Soft, like every measurement here: a run's other numbers are wanted too, and
  // a soft failure still fails the check it belongs to.
  expect.soft(
    Math.abs(claimed),
    `${label} — the band's box is ${geometry.height.toFixed(1)}px tall while the tallest control it holds is ${geometry.controlHeight.toFixed(1)}px (${geometry.controls
      .map((control) => `${control.className}: ${control.height.toFixed(1)}px`)
      .join(', ')}): it claims ${claimed.toFixed(1)}px of height nothing is drawn in`,
  ).toBeLessThanOrEqual(TOLERANCE_PX);
}

/**
 * The row-axis half, unchanged by this report and verified rather than assumed
 * (REQ-4, REQ-35): at least 240px wide, and grown to the end of the row it is
 * in — "grow" asserted on the box, not read off the stylesheet.
 */
export function expectBandFillsItsRow(label: string, geometry: SearchBandGeometry, minimumWidth = 240): void {
  expect.soft(
    geometry.parent.flexDirection,
    `${label} — the band was measured for its row behaviour inside a parent whose axis is "${geometry.parent.flexDirection}" (${geometry.parent.className})`,
  ).toBe('row');
  expect.soft(
    geometry.width,
    `${label} — the band is ${geometry.width.toFixed(1)}px wide, under the ${minimumWidth}px floor it keeps in a row`,
  ).toBeGreaterThanOrEqual(minimumWidth);
  expect.soft(
    Math.abs(geometry.right - geometry.parent.contentRight),
    `${label} — the band stops ${(geometry.parent.contentRight - geometry.right).toFixed(1)}px short of its row's content edge (band right ${geometry.right.toFixed(
      1,
    )}px against row content right ${geometry.parent.contentRight.toFixed(1)}px): it is not growing to fill the row`,
  ).toBeLessThanOrEqual(TOLERANCE_PX);
}
