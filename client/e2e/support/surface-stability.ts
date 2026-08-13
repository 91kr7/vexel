/**
 * Measuring **what moves**, with a **real pointer**.
 *
 * Both halves are the point. A surface that is dragged out of the viewport
 * keeps every child it had and every character of text it drew, so a check
 * comparing content sees nothing at all; what changes is the surface's
 * position, and that is what is asserted here. And the displacement is caused
 * by the browser scrolling a focused element into view, so it can only be
 * provoked by an interaction that actually moves focus:
 * `HTMLElement.click()` and a dispatched event do not, and are refused here
 * (REQ-10, REQ-11 of plan-docker_management_app-toggle_focus_scroll).
 *
 * Written for the switch and shared by its two consumers under check — a
 * dialog and a scrolling detail panel — because a fault of the shared control
 * is only shown to be the control's by being observed on more than one screen.
 */
import { expect, type Locator, type Page } from '@playwright/test';

/** A rectangle in viewport coordinates, as the browser reports it. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One decimal is enough to read a displacement of hundreds of pixels, and keeps the message legible. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function describe(box: Box): string {
  return `x=${round(box.x)}, y=${round(box.y)}, ${round(box.width)}×${round(box.height)}`;
}

/**
 * The element's rectangle, refusing an element that has none: a surface with no
 * box cannot be said to have stayed where it was.
 */
export async function boxOf(target: Locator, description: string): Promise<Box> {
  const box = await target.boundingBox();
  expect(box, `${description} has no box on screen, so nothing about its position can be measured`).not.toBeNull();
  return box as Box;
}

/**
 * How far a control's hidden input is drawn from the visible control it belongs
 * to (REQ-2), reported as evidence beside a displacement rather than asserted
 * on its own: it is the quantity that explains the movement, and a reader of a
 * failure needs both numbers to see the mechanism.
 */
export async function hiddenControlGap(hidden: Locator, visible: Box): Promise<number> {
  const box = await hiddenControlBox(hidden);
  return box === null ? Number.NaN : Math.hypot(box.x - visible.x, box.y - visible.y);
}

async function hiddenControlBox(hidden: Locator): Promise<Box | null> {
  return await hidden.boundingBox();
}

export interface SurfaceStabilityCheck {
  page: Page;
  /** The dialog, panel or page the control sits on — the thing that must not move. */
  surface: Locator;
  /** How the surface is named in a failure message. */
  surfaceName: string;
  /** The visible part of the control, the part an operator aims a pointer at. */
  control: Locator;
  /** How the control is named in a failure message. */
  controlName: string;
  /** The control's visually hidden input, measured for the report when the surface moves. */
  hiddenControl?: Locator;
}

/** What the check measured, so a caller can assert more about the same two observations. */
export interface SurfaceStabilityResult {
  surfaceBefore: Box;
  surfaceAfter: Box;
  controlBefore: Box;
  controlAfter: Box;
}

/**
 * Clicks the control with a real pointer and asserts the surface it sits on did
 * not move and the control is still within the viewport (REQ-10).
 *
 * The control is brought into view **before** the measurement is taken, so the
 * scrolling a pointer legitimately needs in order to reach a control is not
 * what the comparison is made of: the two measurements straddle the click and
 * nothing else.
 */
export async function clickAndExpectSurfaceUnmoved(check: SurfaceStabilityCheck): Promise<SurfaceStabilityResult> {
  const { page, surface, surfaceName, control, controlName } = check;

  await expect(control, `${controlName} is not on screen at all`).toBeVisible();
  await control.scrollIntoViewIfNeeded();

  const surfaceBefore = await boxOf(surface, surfaceName);
  const controlBefore = await boxOf(control, controlName);
  const gap = check.hiddenControl === undefined ? Number.NaN : await hiddenControlGap(check.hiddenControl, controlBefore);
  const evidence = Number.isNaN(gap) ? '' : `; its hidden input is drawn ${round(gap)}px away from it`;

  // A real pointer, delivered at the control's own coordinates and carrying
  // focus with it. Never `element.click()` and never a dispatched event: seven
  // such activations failed to reproduce this defect (REQ-11).
  await control.click();

  const surfaceAfter = await boxOf(surface, surfaceName);
  expect(
    { x: surfaceAfter.x, y: surfaceAfter.y },
    `${surfaceName} moved when ${controlName} was clicked with a real pointer: from (${describe(surfaceBefore)}) to (${describe(surfaceAfter)}), a displacement of ${round(surfaceAfter.x - surfaceBefore.x)}px horizontally and ${round(surfaceAfter.y - surfaceBefore.y)}px vertically${evidence}`,
  ).toEqual({ x: surfaceBefore.x, y: surfaceBefore.y });

  const controlAfter = await boxOf(control, controlName);
  const viewport = page.viewportSize();
  expect(viewport, 'this run has no viewport size to measure the control against').not.toBeNull();
  const { width, height } = viewport as { width: number; height: number };
  const withinViewport =
    controlAfter.x >= 0 &&
    controlAfter.y >= 0 &&
    controlAfter.x + controlAfter.width <= width &&
    controlAfter.y + controlAfter.height <= height;
  expect(
    withinViewport,
    `${controlName} is no longer within the ${width}×${height} viewport after being clicked: it is at (${describe(controlAfter)}), where it was at (${describe(controlBefore)})${evidence}`,
  ).toBe(true);

  return { surfaceBefore, surfaceAfter, controlBefore, controlAfter };
}
